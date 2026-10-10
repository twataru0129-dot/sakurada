/**
 * ゲームの選択で「ボウイの爆弾遊戯」を選んだときの、タイトルコールと画面の切り替え。
 *
 * 選択 → タイトルコールの再生と同時に白へ → 画面全体が白 → 音声の終わりに合わせて黒へ → 黒からゲーム画面を表示。
 *
 * - 白・黒の幕は、ヘッダーも含めた表示画面の全体を覆います。白くなってからゲーム画面へ切り替え、
 *   その画像を読み込んでから黒へ移るため、選択画面や読み込み前の画像は見えません。
 * - 幕が出ている間のキー（押しっぱなしの繰り返しも）は、ここで止めます（ゲームの開始や最初の問題へ持ち越しません）。
 *   幕が消えたあと、ゲーム画面は開始待ち（スタートのボタン・スペース）です。
 * - 音は桜打の「音」の設定（ミュート）とこのゲームの音量に従います。ミュート・読み込みの失敗・再生の拒否のときは、
 *   音声の長さが過ぎたところで先へ進めます（白や黒のまま止まりません）。
 * - 演出は1回の選択につき1回だけです（連打しても二重に再生・遷移しません）。
 *   途中で別の画面へ移ったとき（ブラウザの「戻る」など）は、音・タイマー・幕をすべて止めて消します。
 */
import { useEffect, useSyncExternalStore } from 'react';
import { BOWIE_TITLE_CALL as T } from '../../core/bowie/config';
import { currentPath, navigate } from '../../state/router';
import titleCallUrl from '../../assets/bowie/audio/bowie_title_call.mp3';
import logoUrl from '../../assets/bowie/scenes/title_logo.webp';

export type CurtainPhase = 'idle' | 'white' | 'black' | 'hold' | 'reveal';
/** 音声の状態（確認用に幕の data-audio にも出します） */
export type CallAudio = 'none' | 'muted' | 'loading' | 'playing' | 'ended' | 'failed' | 'timeout';

const FROM = '/game';
const TO = '/game/bowie';

let phase: CurtainPhase = 'idle';
let audioState: CallAudio = 'none';
let run = 0;
let timers: number[] = [];
let audioEl: HTMLAudioElement | null = null;
let offHash: (() => void) | null = null;
const subs = new Set<() => void>();

function emit() {
  for (const f of subs) f();
}
function setPhase(p: CurtainPhase) {
  phase = p;
  emit();
}
function setAudio(a: CallAudio) {
  audioState = a;
  emit();
}
function later(ms: number, f: () => void) {
  timers.push(window.setTimeout(f, ms));
}
function stopAudio() {
  if (!audioEl) return;
  try {
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();
  } catch {
    /* もう止まっています */
  }
  audioEl = null;
}

/** 音・タイマー・幕をすべて止めて消します */
export function cancelTitleCall(): void {
  run++;
  for (const t of timers) window.clearTimeout(t);
  timers = [];
  stopAudio();
  offHash?.();
  offHash = null;
  if (phase !== 'idle' || audioState !== 'none') {
    phase = 'idle';
    audioState = 'none';
    emit();
  }
}

function preloadImages(urls: string[]): Promise<void> {
  return Promise.all(
    urls.map(
      (u) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = img.onerror = () => res();
          img.src = u;
          if (img.complete) res();
        }),
    ),
  ).then(() => undefined);
}

/**
 * 演出を始めます（クリック・タップ・キーでの決定から呼びます）。演出中に呼んでも何もしません。
 * @param images 白の間に読み込んでおくゲーム画面の画像
 */
export function startTitleCall(opts: { muted: boolean; volume: number; images?: string[] }): boolean {
  if (phase !== 'idle') return false;
  cancelTitleCall();
  const id = ++run;
  const alive = () => id === run;
  setPhase('white');

  // 途中で別の画面へ移ったら（戻る・ログアウトなど）止めます
  let expected = FROM;
  const onHash = () => {
    if (alive() && currentPath() !== expected) cancelTitleCall();
  };
  window.addEventListener('hashchange', onHash);
  offHash = () => window.removeEventListener('hashchange', onHash);

  // 音声：本当の終わり（ended）で黒へ。鳴らせないときは音声の長さで進めます
  let audioDone = false;
  let whiteDone = false;
  let imagesDone = false;
  const callMs = Math.round(T.callSeconds * 1000);
  const tryBlack = () => {
    if (!alive() || !audioDone || !whiteDone || !imagesDone || phase !== 'white') return;
    setPhase('black');
    later(T.toBlackMs, () => {
      if (!alive()) return;
      setPhase('hold');
      later(T.blackHoldMs, () => {
        if (!alive()) return;
        setPhase('reveal');
        later(T.fadeInMs, () => {
          if (!alive()) return;
          cancelTitleCall();
        });
      });
    });
  };
  const finishAudio = (state: CallAudio) => {
    if (audioDone || !alive()) return;
    audioDone = true;
    if (audioState === 'loading' || audioState === 'playing') setAudio(state);
    tryBlack();
  };
  const fallback = (state: CallAudio) => {
    // 鳴らせなかった：選んだときから音声の長さが過ぎるまで白のままにします
    if (!alive() || audioDone) return;
    setAudio(state);
    stopAudio();
    const left = Math.max(0, callMs - (performance.now() - started));
    later(left, () => {
      if (audioDone || !alive()) return;
      audioDone = true;
      tryBlack();
    });
  };
  const started = performance.now();
  if (opts.muted || !(opts.volume > 0)) {
    setAudio('muted');
    later(callMs, () => finishAudio('muted'));
  } else {
    setAudio('loading');
    try {
      const a = new Audio(titleCallUrl);
      audioEl = a;
      a.preload = 'auto';
      a.volume = Math.min(1, Math.max(0, opts.volume));
      a.addEventListener('playing', () => alive() && audioState === 'loading' && setAudio('playing'));
      a.addEventListener('ended', () => finishAudio('ended'));
      a.addEventListener('error', () => fallback('failed'));
      void a.play().catch(() => fallback('failed'));
    } catch {
      fallback('failed');
    }
    // 音声が終わらないまま止まったとき（読み込みが途中で止まったなど）も、先へ進めます
    later(callMs + T.maxWaitExtraMs, () => {
      if (audioDone || !alive()) return;
      setAudio('timeout');
      stopAudio();
      audioDone = true;
      tryBlack();
    });
  }

  // 画面全体が白くなってから、ゲーム画面へ切り替えます（その画像を読み込んでから黒へ）
  later(T.whiteInMs, () => {
    if (!alive()) return;
    whiteDone = true;
    expected = TO;
    navigate(TO);
    let settled = false;
    const done = () => {
      if (settled || !alive()) return;
      settled = true;
      imagesDone = true;
      tryBlack();
    };
    void preloadImages([logoUrl, ...(opts.images ?? [])]).then(done);
    later(T.imageWaitMs, done);
  });
  return true;
}

export function useTitleCall(): { phase: CurtainPhase; audio: CallAudio } {
  const p = useSyncExternalStore(subscribe, () => phase);
  const a = useSyncExternalStore(subscribe, () => audioState);
  return { phase: p, audio: a };
}
function subscribe(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

/** 幕（アプリの最上位に1つだけ置きます） */
export function TitleCallCurtain() {
  const { phase: p, audio } = useTitleCall();
  const active = p !== 'idle';

  // 幕が出ている間のキーは、どの画面にも渡しません
  useEffect(() => {
    if (!active) return;
    const stop = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    for (const t of ['keydown', 'keypress', 'keyup'] as const) window.addEventListener(t, stop, { capture: true });
    return () => {
      for (const t of ['keydown', 'keypress', 'keyup'] as const) window.removeEventListener(t, stop, { capture: true });
    };
  }, [active]);
  // 幕を出したまま画面がなくなったときは止めます
  useEffect(() => () => cancelTitleCall(), []);

  if (!active) return null;
  const ms = p === 'white' ? T.whiteInMs : p === 'black' ? T.toBlackMs : p === 'reveal' ? T.fadeInMs : 0;
  return (
    <div
      className={`bowie-curtain is-${p}`}
      style={{ ['--curtain-ms' as string]: `${ms}ms` }}
      data-testid="bowie-curtain"
      data-phase={p}
      data-audio={audio}
      aria-hidden="true"
    />
  );
}
