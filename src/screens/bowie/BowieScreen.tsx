/**
 * ゲーム「ボウイの爆弾遊戯」の画面。
 *
 * - /game/bowie：タイトル（正式ロゴ・遊び方・ハイスコア・サウンド設定・開始）
 * - /game/bowie/play：プレイと結果
 *
 * 進行は BowieGame（src/core/bowie/engine.ts）に時刻を渡して決めます。この画面は、出来事に合わせて絵・音・演出を出すだけです。
 * 爆弾の位置は毎フレーム、ゲームの時間から計算して直接描きます（再描画はイベントのときだけ）。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BOWIE_CONFIG, BOWIE_CUTINS, BOWIE_LEVEL_UPS, BOWIE_TITLE, STAGES, type StageNo } from '../../core/bowie/config';
import { BowieGame, type BowieEvent } from '../../core/bowie/engine';
import { BOWIE_POOLS, drawPlay, type BowieQuestion } from '../../core/bowie/questions';
import { displaySegments, shown } from '../../core/bowie/display';
import { loadBowieRecord, saveBowieResult, type BowieRecord } from '../../data/bowieRecords';
import { useApp } from '../../state/AppContext';
import { navigate } from '../../state/router';
import { loadBowieSound, saveBowieSound, type BowieSoundLevels } from '../../data/bowieSound';
import { BowieAudio, type Playing } from '../../ui/bowie/audio';
import { SoundSettings } from '../../ui/bowie/SoundSettings';
import { useTitleCall } from '../../ui/bowie/TitleCall';
import { BOWIE_SPRITES, bombCenter, HERO_SPRITES, stageGeometry, type Box, type StageGeometry } from '../../ui/bowie/geometry';
import { BOWIE_TAUNTS, drawBowieTaunt, type BowieTaunt } from '../../ui/bowie/taunts';

const img = import.meta.glob('../../assets/bowie/{characters,scenes}/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (file: string) => Object.entries(img).find(([p]) => p.endsWith(`/${file}`))?.[1] ?? '';
const SCENE = {
  background: url('stage_background.webp'),
  /** 敗北の音声の間に出す画像（v1.5.3） */
  defeat: url('bowie_defeat.webp'),
  logo: url('title_logo.webp'),
  /** 開始前の画面の背景（v1.6.1。プレイ中の背景は stage_background のまま） */
  titleBackground: url('bowie_title_background.webp'),
  bomb: url('bomb.webp'),
  /** 全問クリアのダンス（v1.6.0）：両手を上げた姿・下げた姿 */
  danceUp: url('hero_dance_up.webp'),
  danceDown: url('hero_dance_down.webp'),
};
/** ダンスの拍（クリアの曲は約150 BPM。1拍ごとに跳ね、両手は半拍ずつ上げ下げします） */
const DANCE_BEAT_MS = 400;
/** カットインのセリフの間の音楽の大きさ（設定の音量に対する割合） */
const BGM_DUCK = 0.35;

/** 開発用の確認（通常の画面には何も出しません）。sessionStorage に設定があるときだけ、出題数と時間の倍率を変えます */
const DEV_KEY = 'sakura-type:bowie-dev';
function devOptions(): { perStage?: number; timeScale?: number; ids?: string[] } {
  try {
    const raw = sessionStorage.getItem(DEV_KEY);
    if (!raw) return {};
    const d = JSON.parse(raw) as { perStage?: unknown; timeScale?: unknown; ids?: unknown };
    const out: { perStage?: number; timeScale?: number; ids?: string[] } = {};
    // ids：各段階の最初に出す問題（確認用。登録された問題の ID だけ）
    if (Array.isArray(d.ids)) out.ids = d.ids.filter((x): x is string => typeof x === 'string').slice(0, 80);
    if (typeof d.perStage === 'number' && d.perStage >= 1 && d.perStage <= 20) out.perStage = Math.floor(d.perStage);
    if (typeof d.timeScale === 'number' && d.timeScale > 0 && d.timeScale <= 10) out.timeScale = d.timeScale;
    return out;
  } catch {
    return {};
  }
}

/** 開発用：指定した問題を、その段階の最初に出します（同じ問題は二度出しません） */
function withFirst(play: BowieQuestion[][], ids: string[], perStage: number): BowieQuestion[][] {
  if (!ids.length) return play;
  return play.map((stage, i) => {
    const pool = BOWIE_POOLS[(i + 1) as StageNo];
    const first = ids.map((id) => pool.find((q) => q.id === id)).filter((q): q is BowieQuestion => !!q);
    return [...first, ...stage.filter((q) => !first.includes(q))].slice(0, perStage);
  });
}

type HeroFace = 'hero_idle' | 'hero_disarm' | 'hero_danger' | 'hero_hit' | 'hero_victory';
type BowieMood = 'bowie_idle' | 'bowie_laugh' | 'bowie_frustrated' | 'bowie_despair';
type ResultStep = 'explode' | 'defeat' | 'taunt' | 'dance' | 'victory' | 'despair';
interface Result {
  kind: 'lose' | 'win';
  step: ResultStep;
  score: number;
  solved: number;
  total: number;
  record: BowieRecord;
  newBest: boolean;
  saved: boolean;
  taunt?: BowieTaunt;
}

const isControl = (el: EventTarget | null) => !!(el as HTMLElement | null)?.closest?.('button, input, select, textarea, a, label');

export function BowieScreen({ mode }: { mode: 'title' | 'play' }) {
  const { account, settings, updateSettings } = useApp();
  const profile = account ? (account.kind === 'guest' ? 'guest' : `user:${account.profile.id}`) : 'guest';
  const audio = useMemo(() => new BowieAudio(), []);
  /** サウンド設定（音楽・効果音・ボイス）。全体の ON／OFF は共通の「音」の設定です */
  const [levels, setLevelsState] = useState<BowieSoundLevels>(loadBowieSound);
  const [soundOpen, setSoundOpen] = useState(false);
  /** 開始前の画面の「遊び方」（説明の全文をダイアログで見せます。開いている間はスペースで始まりません） */
  const [howtoOpen, setHowtoOpen] = useState(false);
  const howtoButton = useRef<HTMLButtonElement>(null);
  const howtoClose = useRef<HTMLButtonElement>(null);
  const closeHowto = () => {
    setHowtoOpen(false);
    // 閉じたら「遊び方」のボタンへ戻します
    window.setTimeout(() => howtoButton.current?.focus(), 0);
  };
  useEffect(() => {
    if (howtoOpen) howtoClose.current?.focus();
  }, [howtoOpen]);
  const muted = !settings.sound;
  const [record, setRecord] = useState<BowieRecord>(() => loadBowieRecord(profile));
  useEffect(() => setRecord(loadBowieRecord(profile)), [profile]);

  // 画面を開いたときに音声を先読みし、離れるときにすべて止めます
  useEffect(() => {
    // 白の幕の下で音声の読み込みと準備を始めます（幕が消えたらすぐ BGM を流せるように。音を出すのは幕のあと）
    audio.preload();
    audio.unlock();
    // 結果・カットインの画像も先に読み込みます（出す瞬間に空の画面にならないように）
    for (const src of [...BOWIE_TAUNTS.map((t) => t.src), ...BOWIE_CUTINS.map((c) => url(c.image)), SCENE.defeat, SCENE.danceUp, SCENE.danceDown]) {
      const image = new Image();
      image.src = src;
    }
    return () => audio.dispose();
  }, [audio]);
  useEffect(() => audio.setLevels(levels, muted), [audio, levels, muted]);

  // 通常の BGM：ゲームの選択からのタイトルコールと白・黒の幕が終わり、ゲーム画面が出たら流し始めます（開始待ちから、プレイ中もくり返し）。
  // 1つの画面につき1回だけ始めます（再描画・連打で重なりません）。URL で直接開いたときは、開始の操作で音が出るようになります
  const { phase: curtain } = useTitleCall();
  const bgmBegun = useRef(false);
  useEffect(() => {
    if (curtain !== 'idle' || bgmBegun.current) return;
    bgmBegun.current = true;
    audio.unlock();
    audio.startBgm();
  }, [audio, curtain]);

  const gameRef = useRef<BowieGame | null>(null);
  /** 演出の世代（再挑戦・ホームへ戻るときに増やし、前のゲームの演出を止めます） */
  const gen = useRef(0);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((n) => n + 1), []);
  const [heroFace, setHeroFace] = useState<HeroFace>('hero_idle');
  const [bowieMood, setBowieMood] = useState<BowieMood>('bowie_idle');
  const [throwFrame, setThrowFrame] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [banner, setBanner] = useState<{ key: number; text: string; sub: string } | null>(null);
  /** 段階アップ（第2〜4段階の始まり）の表示中（key：表示し直すため） */
  const [levelUp, setLevelUp] = useState<{ key: number; stage: 2 | 3 | 4 } | null>(null);
  /** 段階アップのボイス：まだ流していないか（1回だけ流します） */
  const levelUpVoice = useRef<{ stage: 2 | 3 | 4; played: boolean } | null>(null);
  /** 表示中のカットイン（key：表示し直すため、no：何回目か） */
  const [cutin, setCutin] = useState<{ key: number; no: number } | null>(null);
  const [danger, setDanger] = useState(false);
  const [typo, setTypo] = useState(0);
  const [pops, setPops] = useState<{ key: number; text: string; x: number; y: number }[]>([]);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [imeHint, setImeHint] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [shake, setShake] = useState(0);
  const disarmUntil = useRef(0);
  const cutinSounds = useRef<{ rumble: Playing | null; line: boolean; no: number }>({ rumble: null, line: false, no: 0 });
  const finished = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const bombRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<StageGeometry | null>(null);
  const geoRef = useRef<StageGeometry | null>(null);
  geoRef.current = geo;

  // ステージの大きさ（CSS の px）。変わると配置を計算し直します（進み具合は時間で決まるので変わりません）
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setGeo(stageGeometry(r.width, r.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, result]);

  const game = gameRef.current;

  // ---------------------------------------------------------------- 出来事に合わせた演出
  const handle = useCallback(
    (events: BowieEvent[]) => {
      const g = gameRef.current;
      if (!g || events.length === 0) return;
      for (const e of events) {
        switch (e.type) {
          case 'stage': {
            setBowieMood(e.stage === 1 ? 'bowie_idle' : 'bowie_frustrated');
            setDanger(false);
            if (e.levelUp) {
              // 段階アップ：中央の帯と文字（金属音）。ボイスは文字が出たあと（毎フレームの更新の中）で1回だけ
              const stage = e.stage as 2 | 3 | 4;
              setBanner(null);
              setLevelUp({ key: Date.now(), stage });
              levelUpVoice.current = { stage, played: false };
              audio.metal();
            } else {
              // 第1段階の始まり：これまでどおりの表示（段階アップの表示・ボイスは使いません）
              const st = STAGES.find((s) => s.no === e.stage)!;
              setBanner({ key: Date.now(), text: `第${st.no}段階`, sub: st.name });
            }
            break;
          }
          case 'throw':
            if (levelUpVoice.current) {
              // 段階アップの終わり（ボイスは最後まで終わっています）：BGM の大きさを戻します
              levelUpVoice.current = null;
              setLevelUp(null);
              audio.setDuck(1, 300);
            }
            setBanner(null);
            setDanger(false);
            setBowieMood('bowie_idle');
            break;
          case 'release':
            audio.play('throw');
            setDanger(false);
            break;
          case 'typo':
            audio.typo(BOWIE_CONFIG.typoSoundGapMs);
            setTypo((n) => n + 1);
            break;
          case 'disarm': {
            // 解除の音（1回だけ。次の投球は音の終わりを待たずにすぐ始まります）
            audio.play('disarm_v2');
            disarmUntil.current = performance.now() + BOWIE_CONFIG.disarmFxMs;
            setHeroFace('hero_disarm');
            setDanger(false);
            const gg = geoRef.current;
            const c = gg ? bombCenter(gg, e.progress) : { x: 0, y: 0 };
            const key = Date.now() + Math.random();
            setPops((list) => [...list.slice(-3), { key, text: `+${e.points}`, x: c.x, y: c.y }]);
            window.setTimeout(() => setPops((list) => list.filter((p) => p.key !== key)), 900);
            window.setTimeout(() => {
              if (performance.now() >= disarmUntil.current) setHeroFace((f) => (f === 'hero_disarm' ? 'hero_idle' : f));
            }, BOWIE_CONFIG.disarmFxMs + 20);
            break;
          }
          case 'danger':
            audio.play('danger');
            setDanger(true);
            setHeroFace((f) => (f === 'hero_idle' ? 'hero_danger' : f));
            setBowieMood('bowie_laugh');
            break;
          case 'cutin':
            // 画像が入り始めると同時に「シャキーン」と地鳴り。セリフは画像が入りきったところで（毎フレームの更新の中）
            setCutin({ key: Date.now(), no: e.no });
            audio.play('cutin_shine');
            cutinSounds.current = { rumble: audio.play('cutin_rumble'), line: false, no: e.no };
            break;
          case 'cutinEnd':
            // セリフは最後まで終わっています（カットインの長さをセリフの長さに合わせているため）。地鳴りだけを止めます
            setCutin(null);
            cutinSounds.current.rumble?.stop();
            audio.setDuck(1, 300);
            cutinSounds.current = { rumble: null, line: false, no: 0 };
            break;
          case 'hit':
            void runLose();
            break;
          case 'won':
            void runWin();
            break;
          case 'correct':
            break;
        }
      }
      rerender();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audio, rerender],
  );

  const finish = (kind: 'lose' | 'win', g: BowieGame) => {
    if (finished.current) return null;
    finished.current = true;
    const saved = saveBowieResult(profile, { score: g.score, solved: g.solved, cleared: kind === 'win' });
    setRecord(saved.record);
    return { kind, score: g.score, solved: g.solved, total: g.total, record: saved.record, newBest: saved.newBest, saved: saved.saved };
  };

  /** 煽りの画面の声：笑い声が終わったら、主人公の鳴き声（どの画像でも同じ順番。再挑戦・ホームで止めると、あとから鳴りません） */
  async function tauntVoices(my: number) {
    await audio.play('laugh').ended;
    if (gen.current !== my) return;
    audio.play('hero_cry');
  }

  /**
   * 被弾：通常の BGM を止め、爆発の音と主人公の被弾の声を同時に → 両方が終わるまで被弾のリアクション →
   * DEFEAT の画像と音声 → ボウイの煽りの画像（10枚から1枚）と笑い声 → 主人公の鳴き声。点数は煽りの画面で出します
   */
  async function runLose() {
    const g = gameRef.current!;
    const my = gen.current;
    const finishedResult = finish('lose', g);
    if (!finishedResult) return;
    const base = { ...finishedResult, taunt: drawBowieTaunt() };
    audio.stopBgm();
    setHeroFace('hero_hit');
    setBowieMood('bowie_laugh');
    setDanger(false);
    setShake((n) => n + 1);
    await Promise.all([audio.play('explosion').ended, audio.play('hero_hit_voice').ended]);
    if (gen.current !== my) return;
    setResult({ ...base, step: 'defeat' });
    await audio.play('defeat').ended;
    if (gen.current !== my) return;
    setResult({ ...base, step: 'taunt' });
    void tauntVoices(my);
  }

  /**
   * 全問解除：通常の BGM を止め、クリアの曲（1回だけ）に合わせて主人公のダンス →
   * 曲が終わったら主人公の勝利（VICTORY の音声）→ ボウイの絶望（敗北のセリフ）→ クリアの表示
   */
  async function runWin() {
    const g = gameRef.current!;
    const my = gen.current;
    const base = finish('win', g);
    if (!base) return;
    audio.stopBgm();
    setHeroFace('hero_victory');
    setBowieMood('bowie_despair');
    setResult({ ...base, step: 'dance' });
    await audio.play('hero_clear_bgm').ended;
    if (gen.current !== my) return;
    setResult({ ...base, step: 'victory' });
    await audio.play('victory').ended;
    if (gen.current !== my) return;
    setResult({ ...base, step: 'despair' });
    audio.play('loss_line');
  }

  /**
   * 演出を飛ばします：飛ばした場面の音と動きを止めて、最後の表示へ（あとから前の音・画面の切り替えは起きません）。
   * 敗北：煽りの画像（選んだ1枚）と、笑い声 → 主人公の鳴き声を各1回。勝利（ダンス・VICTORY）：クリアの表示へ
   */
  const skip = () => {
    if (!result) return;
    gen.current++;
    audio.stopAll();
    setResult({ ...result, step: result.kind === 'lose' ? 'taunt' : 'despair' });
    if (result.kind === 'lose') void tauntVoices(gen.current);
  };

  // ---------------------------------------------------------------- 開始・再挑戦・終了
  const resetView = () => {
    setHeroFace('hero_idle');
    setBowieMood('bowie_idle');
    setThrowFrame(0);
    setBanner(null);
    setCutin(null);
    setDanger(false);
    setPops([]);
    setPaused(false);
    setCountdown(null);
    setImeHint(false);
    setSoundOpen(false);
    setHowtoOpen(false);
    setResult(null);
    finished.current = false;
    cutinSounds.current = { rumble: null, line: false, no: 0 };
    setLevelUp(null);
    levelUpVoice.current = null;
  };

  const startGame = useCallback(() => {
    gen.current++;
    audio.stopAll();
    audio.unlock();
    audio.resume();
    // 通常の BGM：タイトルから流れていればそのまま続け、終わったあとの再挑戦では最初から1回だけ流します
    if (!audio.bgmPlaying) audio.startBgm();
    resetView();
    const dev = devOptions();
    const perStage = dev.perStage ?? BOWIE_CONFIG.questionsPerStage;
    const g = new BowieGame(withFirst(drawPlay(perStage), dev.ids ?? [], perStage), settings.romajiStyle, {
      perStage,
      timeScale: dev.timeScale ?? 1,
      // セリフを読み込めていれば、その実際の長さでカットインの長さを決めます（セリフを途中で切らないため）
      cutinVoiceMs: (no) => audio.durationMs(BOWIE_CUTINS[Math.min(BOWIE_CUTINS.length, no) - 1]!.voice),
      // 段階アップも同じく、ボイスの実際の長さで演出の長さを決めます（ボイスが終わってから投球）
      levelUpVoiceMs: (stage) => audio.durationMs(BOWIE_LEVEL_UPS[stage].voice),
    });
    gameRef.current = g;
    if (mode !== 'play') navigate('/game/bowie/play');
    handle(g.start(performance.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio, handle, mode, settings.romajiStyle]);

  const leave = (to: string) => {
    gen.current++;
    audio.stopAll();
    if (to === '/game/bowie') {
      // 一時停止の「やめる」で開始前の画面へ：前のゲームの音は止め、BGM は大きさを戻して開始待ちのまま流します
      audio.resume(); // 一時停止で止めた音を戻します
      audio.setDuck(1, 0);
      if (!audio.bgmPlaying) audio.startBgm();
    } else audio.stopBgm();
    gameRef.current = null;
    resetView();
    navigate(to);
  };

  // プレイの画面を直接開いたとき（再読み込みなど）は、タイトルへ戻ります
  useEffect(() => {
    if (mode === 'play' && !gameRef.current) navigate('/game/bowie');
  }, [mode]);

  // ---------------------------------------------------------------- 一時停止
  const pause = useCallback(() => {
    const g = gameRef.current;
    if (!g || !g.pause(performance.now())) return;
    audio.suspend();
    setPaused(true);
    setCountdown(null);
    rerender();
  }, [audio, rerender]);

  const countdownTimer = useRef<number | undefined>(undefined);
  const resume = () => {
    if (!paused || countdown !== null) return;
    const steps = 3;
    const each = BOWIE_CONFIG.resumeCountMs / steps;
    setCountdown(steps);
    let n = steps;
    const tick = () => {
      n -= 1;
      if (n > 0) {
        setCountdown(n);
        countdownTimer.current = window.setTimeout(tick, each);
      } else {
        setCountdown(null);
        setPaused(false);
        audio.resume();
        gameRef.current?.resume(performance.now());
        rerender();
      }
    };
    countdownTimer.current = window.setTimeout(tick, each);
  };
  useEffect(() => () => window.clearTimeout(countdownTimer.current), []);

  // タブを切り替えた・ウィンドウから離れたときは自動で一時停止します（戻ったら「再開」で続けます）
  useEffect(() => {
    const onHide = () => {
      if (gameRef.current) {
        if (document.visibilityState === 'hidden') pause();
      } else if (document.visibilityState === 'hidden') audio.suspend();
      else audio.resume(); // タイトル（開始待ち）：見えない間は BGM も止め、戻ったら続きから
    };
    const onBlur = () => pause();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onBlur);
    };
  }, [audio, pause]);

  // ---------------------------------------------------------------- 毎フレームの更新（爆弾の位置・投球の絵・カットインの音）
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const g = gameRef.current;
      if (!g) return;
      const now = performance.now();
      handle(g.update(now));
      const gt = g.gameTime(now);
      const ph = g.activePhase;
      // 投球の動作：構える → 腕を出す → 放つ → （手を離れたら）空の手の余韻
      let frame: 0 | 1 | 2 | 3 | 4 = 0;
      if (ph === 'throwing') {
        const f = (gt - g.phaseStart) / g.throwMs;
        const [a, b] = BOWIE_CONFIG.throwFrames;
        frame = f < a ? 1 : f < a + b ? 2 : 3;
      } else if (ph === 'flying' && gt - g.releaseAt < g.scaled(BOWIE_CONFIG.followThroughMs)) frame = 4;
      setThrowFrame((cur) => (cur === frame ? cur : frame));
      // カットイン：入りきったところで、その回のセリフを1回だけ。セリフの間は地鳴りを小さく（セリフが聞き取れるように）
      if (ph === 'cutin' && !cutinSounds.current.line && gt - g.phaseStart >= g.scaled(BOWIE_CONFIG.cutin.entryMs)) {
        cutinSounds.current.line = true;
        cutinSounds.current.rumble?.setGain(0.18 / 0.4);
        audio.setDuck(BGM_DUCK);
        const spec = BOWIE_CUTINS[Math.min(BOWIE_CUTINS.length, Math.max(1, cutinSounds.current.no)) - 1]!;
        audio.play(spec.voice);
      }
      // 段階アップ：文字が出たあとに、その段階のボウイのボイスを1回だけ。ボイスの間は BGM を小さく
      const lu = levelUpVoice.current;
      if (ph === 'intro' && lu && !lu.played && gt - g.phaseStart >= g.scaled(BOWIE_CONFIG.levelUp.voiceDelayMs)) {
        lu.played = true;
        audio.setDuck(BGM_DUCK);
        audio.play(BOWIE_LEVEL_UPS[lu.stage].voice);
      }
      // 解除の笑顔の時間が過ぎたら、危険なら焦り顔、そうでなければ待機
      const p = g.progress(now);
      const el = bombRef.current;
      const gg = geoRef.current;
      if (el && gg) {
        const show = ph === 'flying' || ph === 'hit';
        el.style.display = show ? 'block' : 'none';
        if (show) {
          const c = bombCenter(gg, p);
          el.style.transform = `translate(${c.x - gg.bombW / 2}px, ${c.y - gg.bombH / 2}px)`;
          el.dataset.progress = p.toFixed(3);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [audio, handle]);

  // ---------------------------------------------------------------- キー
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (mode === 'title' || !g) {
        if (soundOpen || howtoOpen) return; // サウンド設定・遊び方を開いている間は始めません
        if ((e.key === ' ' || e.code === 'Space') && !isControl(e.target) && !e.repeat) {
          e.preventDefault();
          startGame();
        }
        return;
      }
      if (result) return;
      if (e.isComposing || e.key === 'Process' || e.keyCode === 229) {
        // 日本語入力の変換中は判定に混ぜません。英数入力の案内だけを出します
        setImeHint(true);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        pause();
        return;
      }
      if ([...e.key].length !== 1) return; // Enter・Backspace・Shift などは使いません（減点もしません）
      // 入力中のキーで、ボタンが押されたり画面が動いたりしないようにします
      e.preventDefault();
      if (e.repeat || paused || countdown !== null) return;
      if (e.key === ' ') return;
      setImeHint(false);
      handle(g.input(e.key, performance.now()));
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [countdown, handle, howtoOpen, mode, pause, paused, result, soundOpen, startGame]);

  // 解除の笑顔のあと、危険の状態に合わせて顔を戻します
  useEffect(() => {
    if (heroFace !== 'hero_idle' || !danger) return;
    setHeroFace('hero_danger');
  }, [danger, heroFace]);

  const setLevels = (l: BowieSoundLevels) => {
    setLevelsState(l);
    saveBowieSound(l);
  };
  const soundPanel = (
    <SoundSettings soundOn={!muted} levels={levels} onSoundOn={(on) => updateSettings({ sound: on })} onLevels={setLevels} onClose={() => setSoundOpen(false)} />
  );

  // ---------------------------------------------------------------- 表示
  if (mode === 'title' || !game) {
    return (
      <main className="bowie-title" data-testid="bowie-title" style={{ backgroundImage: `url(${SCENE.titleBackground})` }}>
        <div className="bowie-title-inner">
          <img className="bowie-title-logo" src={SCENE.logo} alt={BOWIE_TITLE} width={1100} height={550} />
          <button type="button" className="btn btn-primary bowie-start" onClick={startGame} data-testid="bowie-start">
            スタート<small>（スペースキーでも始まります）</small>
          </button>
          <div className="bowie-title-sub">
            <p className="bowie-best" data-testid="bowie-best">
              ハイスコア <strong>{record.best}</strong> 点
            </p>
            <SoundControls muted={muted} onMute={(m) => updateSettings({ sound: !m })} onSettings={() => setSoundOpen(true)} />
            <button type="button" className="btn btn-small" ref={howtoButton} onClick={() => setHowtoOpen(true)} aria-haspopup="dialog" data-testid="bowie-howto-open">
              遊び方
            </button>
            <button type="button" className="btn btn-small" onClick={() => leave('/game')}>
              ゲームの選択にもどる
            </button>
          </div>
          {muted && <p className="bowie-sound-hint">「音：OFF」を押して ON にすると、音楽・効果音・ボイスが流れます。</p>}
        </div>
        {howtoOpen && (
          <div className="bowie-overlay" onClick={(e) => e.target === e.currentTarget && closeHowto()}>
            <div
              className="bowie-dialog bowie-howto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bowie-howto-title"
              data-testid="bowie-howto"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  closeHowto();
                }
              }}
            >
              <h2 id="bowie-howto-title">遊び方</h2>
              <ul>
                <li>ボウイが爆弾を放ったら、表示された文字を入力して解除します。</li>
                <li>早く解除するほど高得点（単語は最大10点、文章は最大20点）。</li>
                <li>ミスしても減点はありません。正しいキーを打てば続けられます。</li>
                <li>爆弾が主人公に届くと、その場で終了です。</li>
                <li>短い単語・中くらいの単語・長い単語・文章の各20問、全80問を解除すれば勝利です。</li>
              </ul>
              <p className="hint">ローマ字は小文字のまま打てます（Shift は要りません）。日本語入力はオフ（英数）にしてください。Esc で一時停止します。</p>
              <div className="bowie-actions">
                <button type="button" className="btn btn-primary" ref={howtoClose} onClick={closeHowto} data-testid="bowie-howto-close">
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}
        {soundOpen && (
          <div className="bowie-overlay" role="dialog" aria-modal="true" aria-label="サウンド設定">
            <div className="bowie-dialog">{soundPanel}</div>
          </div>
        )}
      </main>
    );
  }

  const ph = game.activePhase;
  const q: BowieQuestion | null = ph === 'flying' ? game.question : null;
  const segs = q && game.matcher ? displaySegments(q, game.style, game.matcher.typedText) : [];
  const stage = STAGES[game.stageIndex]!;
  const M = game.maxPoints;
  const g = geo;
  const bowieKey = throwFrame === 0 ? bowieMood : (`bowie_release_${throwFrame}` as const);
  const progressNo = Math.min(game.total, game.solved + (ph === 'flying' ? 1 : 0));

  return (
    <main className={`bowie-main ${danger ? 'is-danger' : ''}`} data-testid="bowie-main" data-phase={paused ? 'paused' : ph}>
      <div className="bowie-bar">
        <img className="bowie-bar-logo" src={SCENE.logo} alt={BOWIE_TITLE} width={160} height={80} />
        <span className="bowie-stat">
          スコア <strong data-testid="bowie-score">{game.score}</strong>
        </span>
        <span className="bowie-stat" data-testid="bowie-stage">
          第{stage.no}段階 {stage.name}
        </span>
        <span className="bowie-stat">
          <strong data-testid="bowie-progress">
            {progressNo} / {game.total}
          </strong>
        </span>
        <span className="spacer" />
        <SoundControls muted={muted} onMute={(m) => updateSettings({ sound: !m })} compact />
        <button type="button" className="btn btn-small" onClick={(e) => (e.currentTarget.blur(), pause())} disabled={paused || !!result} data-testid="bowie-pause">
          一時停止（Esc）
        </button>
      </div>

      <div ref={stageRef} className={`bowie-stage ${shake > 0 ? `shake-${shake % 2}` : ''}`} style={{ backgroundImage: `url(${SCENE.background})` }} data-testid="bowie-stage-area">
        {g && (
          <>
            <ScoreGuide g={g} max={M} />
            {(['bowie_idle', 'bowie_release_1', 'bowie_release_2', 'bowie_release_3', 'bowie_release_4', 'bowie_frustrated', 'bowie_laugh', 'bowie_despair'] as const).map((k) => (
              <Figure key={k} src={url(BOWIE_SPRITES[k]!.file)} box={g.bowie[k]!} on={bowieKey === k} className={`bowie-figure is-${bowieMood === 'bowie_laugh' && throwFrame === 0 ? 'laugh' : 'idle'}`} testId={bowieKey === k ? 'bowie-villain' : undefined} />
            ))}
            {(['hero_idle', 'hero_disarm', 'hero_danger', 'hero_hit', 'hero_victory'] as const).map((k) => (
              <Figure key={k} src={url(HERO_SPRITES[k]!.file)} box={g.hero[k]!} on={heroFace === k} className={`hero-figure is-${heroFace.replace('hero_', '')}`} testId={heroFace === k ? 'bowie-hero' : undefined} />
            ))}
            {pops.map((p) => (
              <span key={p.key} className="bowie-pop" style={{ left: p.x, top: p.y }} aria-hidden="true">
                {p.text}
              </span>
            ))}
          </>
        )}
        <div ref={bombRef} className={`bowie-bomb ${ph === 'hit' ? 'is-exploding' : ''}`} style={{ width: g?.bombW, height: g?.bombH, display: 'none' }} data-testid="bowie-bomb" aria-hidden="true">
          <span className="bowie-bomb-trail" />
          <img src={SCENE.bomb} alt="" />
        </div>
        {levelUp && <LevelUp key={levelUp.key} stage={levelUp.stage} paused={paused} />}
        {banner && (
          <div key={banner.key} className="bowie-banner" data-testid="bowie-banner">
            <strong>{banner.text}</strong>
            <span>{banner.sub}</span>
          </div>
        )}
      </div>

      <section className={`bowie-panel ${typo % 2 ? 'typo-a' : typo ? 'typo-b' : ''}`} aria-live="off" data-testid="bowie-panel">
        {q ? (
          <>
            <div className="bowie-text" lang="ja" data-testid="bowie-text">
              {q.text}
            </div>
            <div className="bowie-segs" data-testid="bowie-romaji" data-remaining={game.matcher?.remaining() ?? ''}>
              {segs.map((s, i) => (
                <span key={i} className="bowie-seg">
                  <span className="bowie-kana">
                    {s.units.map((u) => (
                      <span key={u.index} className={u.state === 'done' ? 'k-done' : u.state === 'current' ? 'k-cur' : ''}>
                        {u.kana}
                      </span>
                    ))}
                  </span>
                  <span className="bowie-romaji">
                    {s.units.map((u) => (
                      <span key={u.index}>
                        {u.typed && <span className="r-done">{shown(u.typed)}</span>}
                        {u.next && <span className="r-next">{shown(u.next)}</span>}
                        {u.rest && <span className="r-rest">{shown(u.rest)}</span>}
                      </span>
                    ))}
                  </span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="bowie-wait" data-testid="bowie-wait">
            {ph === 'cutin' ? '' : ph === 'intro' ? (levelUp ? 'ボウイがレベルアップしました' : `第${stage.no}段階：${stage.name}`) : 'ボウイが爆弾を構えている…'}
          </p>
        )}
        {imeHint && (
          <p className="bowie-ime" role="status">
            日本語入力がオンになっているようです。「半角/全角」キーで英数入力にしてください。
          </p>
        )}
      </section>

      {cutin !== null && <Cutin key={cutin.key} no={cutin.no} paused={paused} totalMs={game.cutinMs} entryMs={game.scaled(BOWIE_CONFIG.cutin.entryMs)} exitMs={game.scaled(BOWIE_CONFIG.cutin.exitMs)} />}

      {paused && !result && (
        <div className="bowie-overlay" role="dialog" aria-modal="true" aria-label="一時停止" data-testid="bowie-paused">
          {countdown !== null ? (
            <p className="bowie-count" data-testid="bowie-countdown">
              {countdown}
            </p>
          ) : soundOpen ? (
            <div className="bowie-dialog">{soundPanel}</div>
          ) : (
            <div className="bowie-dialog">
              <h2>一時停止中</h2>
              <p>再開すると、短いカウントのあとに続きから始まります。</p>
              <div className="bowie-actions">
                <button type="button" className="btn btn-primary" autoFocus onClick={resume} data-testid="bowie-resume">
                  再開する
                </button>
                <button type="button" className="btn" onClick={() => setSoundOpen(true)} data-testid="bowie-sound-open">
                  サウンド設定
                </button>
                <button type="button" className="btn" onClick={() => leave('/game/bowie')} data-testid="bowie-quit">
                  やめる
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {result && (
        <ResultView
          result={result}
          onRetry={startGame}
          onHome={() => leave('/home')}
          onSkip={skip}
          defeatImage={SCENE.defeat}
          background={SCENE.background}
          danceUp={SCENE.danceUp}
          danceDown={SCENE.danceDown}
          heroVictory={url(HERO_SPRITES.hero_victory!.file)}
          bowieDespair={url(BOWIE_SPRITES.bowie_despair!.file)}
        />
      )}
    </main>
  );
}

function Figure({ src, box, on, className, testId }: { src: string; box: Box; on: boolean; className: string; testId?: string }) {
  return (
    <div className={`bowie-fig ${className} ${on ? 'is-on' : ''}`} style={{ left: box.left, top: box.top, width: box.width, height: box.height }} data-testid={testId}>
      <img src={src} alt="" draggable={false} />
    </div>
  );
}

/** 得点のめやす（淡く表示）。単語は10段階、文章は20段階。数字は混み合わないように間引きます */
function ScoreGuide({ g, max }: { g: StageGeometry; max: number }) {
  const x0 = g.release.x;
  const x1 = g.collision.x;
  const y = g.groundY - g.h * 0.03;
  const labelEvery = max > 10 ? 5 : 1;
  const ticks = Array.from({ length: max + 1 }, (_, i) => x0 + ((x1 - x0) * i) / max);
  const danger = x0 + (x1 - x0) * (1 - BOWIE_CONFIG.dangerRemaining);
  return (
    <div className="bowie-guide" aria-hidden="true" data-testid="bowie-guide">
      {ticks.map((x, i) => (
        <span key={i} className="bowie-tick" style={{ left: x, top: y - 18, height: 18 }} />
      ))}
      {Array.from({ length: max }, (_, i) => max - i)
        .filter((pts) => pts === max || pts === 1 || pts % labelEvery === 0)
        .map((pts) => {
          const i = max - pts;
          const x = (ticks[i]! + ticks[i + 1]!) / 2;
          return (
            <span key={pts} className="bowie-tick-label" style={{ left: x, top: y - 42 }}>
              {pts}
            </span>
          );
        })}
      <span className="bowie-danger-line" style={{ left: danger, top: g.h * 0.08, height: y - g.h * 0.08 }}>
        <span>危険</span>
      </span>
      <span className="bowie-hit-line" style={{ left: x1, top: g.h * 0.08, height: y - g.h * 0.08 }} />
    </div>
  );
}

/** 全体の音の ON／OFF（すぐに切り替え）と、サウンド設定を開くボタン（タイトルだけ。プレイ中は一時停止の画面から開きます） */
function SoundControls({ muted, onMute, onSettings, compact }: { muted: boolean; onMute: (m: boolean) => void; onSettings?: () => void; compact?: boolean }) {
  return (
    <span className={`bowie-sound ${compact ? 'is-compact' : ''}`}>
      <button type="button" className="btn btn-small" aria-pressed={!muted} onClick={(e) => (e.currentTarget.blur(), onMute(!muted))} data-testid="bowie-mute">
        {muted ? '音：OFF' : '音：ON'}
      </button>
      {onSettings && (
        <button type="button" className="btn btn-small" onClick={onSettings} data-testid="bowie-sound-open">
          サウンド設定
        </button>
      )}
    </span>
  );
}

/**
 * 段階アップ（第2〜4段階の始まり）：ステージの中央に横長の黒い帯が走り、赤と金の光とともに大きな文字と小さなレベル表示が出ます。
 * 文字は一瞬大きくなって収まります。帯は半透明で、後ろのゲーム画面は見えたままです。ボイスのセリフは字幕にしません。
 */
function LevelUp({ stage, paused }: { stage: 2 | 3 | 4; paused: boolean }) {
  const spec = BOWIE_LEVEL_UPS[stage];
  return (
    <div className={`bowie-levelup ${paused ? 'is-paused' : ''}`} role="status" aria-label={`${spec.title}　${spec.level}`} data-testid="bowie-levelup" data-stage={stage}>
      <div className="blu-band">
        <span className="blu-flare" aria-hidden="true" />
        <strong className="blu-title" data-testid="bowie-levelup-title">
          {spec.title}
        </strong>
        <span className="blu-level" data-testid="bowie-levelup-level">
          {spec.level}
        </span>
      </div>
    </div>
  );
}

/**
 * 加速のカットイン：画面全体を右から左へ流れます。横長の画像は縦横比を保ったまま全体を見せ（キャラクターを切らない）、
 * 画面との縦横比の差の部分は、同じ画像をぼかして敷きます。入る（entryMs）→ セリフの間は止まる → 抜ける（exitMs）。
 */
function Cutin({ no, paused, totalMs, entryMs, exitMs }: { no: number; paused: boolean; totalMs: number; entryMs: number; exitMs: number }) {
  const spec = BOWIE_CUTINS[Math.min(BOWIE_CUTINS.length, Math.max(1, no)) - 1]!;
  const src = url(spec.image);
  const style = { ['--cutin-in' as string]: `${entryMs}ms`, ['--cutin-out' as string]: `${exitMs}ms`, ['--cutin-out-at' as string]: `${Math.max(0, totalMs - exitMs)}ms` } as CSSProperties;
  return (
    <div className={`bowie-cutin ${paused ? 'is-paused' : ''}`} style={style} data-testid="bowie-cutin" data-cutin={no} aria-label={spec.line ? `ボウイ「${spec.line}」` : 'ボウイの加速のカットイン'}>
      <div className="bowie-cutin-strip">
        <img className="bowie-cutin-back" src={src} alt="" />
        <img className="bowie-cutin-img" src={src} alt="" data-testid="bowie-cutin-img" />
      </div>
    </div>
  );
}

function ResultView({
  result,
  onRetry,
  onHome,
  onSkip,
  defeatImage,
  background,
  danceUp,
  danceDown,
  heroVictory,
  bowieDespair,
}: {
  result: Result;
  onRetry: () => void;
  onHome: () => void;
  onSkip: () => void;
  defeatImage: string;
  background: string;
  danceUp: string;
  danceDown: string;
  heroVictory: string;
  bowieDespair: string;
}) {
  const lose = result.kind === 'lose';
  const playing = result.step === 'explode' || result.step === 'defeat' || result.step === 'dance' || result.step === 'victory';
  const busy = useRef(false);
  const once = (fn: () => void) => () => {
    if (busy.current) return;
    busy.current = true;
    fn();
  };
  // 敗北の音声の間：DEFEAT の画像だけを画面全体に（セリフ・点数・操作の案内は重ねません）。音声が終わると自動で煽りの画面へ。
  // 「演出を飛ばす」だけは、画像に重ならないよう画像の外（下の帯）に置きます
  if (lose && result.step === 'defeat') {
    return (
      <div className="bowie-result is-lose step-defeat" data-testid="bowie-result" data-kind="lose" data-step="defeat">
        <div className="bowie-defeat">
          <img className="bowie-defeat-back" src={defeatImage} alt="" />
          <img className="bowie-defeat-img" src={defeatImage} alt="DEFEAT" data-testid="bowie-defeat" />
        </div>
        <div className="bowie-defeat-bar">
          <button type="button" className="btn bowie-skip-quiet" onClick={onSkip} data-testid="bowie-skip">
            演出を飛ばす
          </button>
        </div>
      </div>
    );
  }
  // 全問クリアの直後：クリアの曲が流れている間、ステージの背景で主人公が踊ります（曲が終わると勝利の表示へ）。
  // 両手を上げた姿・下げた姿を半拍ずつ切り替え、1拍ごとに小さく跳ね、2拍で左右に揺れます（2枚は同じ範囲・大きさで切り出してあり、体はずれません）
  if (!lose && result.step === 'dance') {
    return (
      <div className="bowie-result is-win step-dance" data-testid="bowie-result" data-kind="win" data-step="dance">
        <div className="bowie-dance" style={{ backgroundImage: `url(${background})`, ['--beat' as string]: `${DANCE_BEAT_MS}ms` } as CSSProperties} data-testid="bowie-dance">
          <div className="bowie-dance-sway">
            <div className="bowie-dance-jump">
              <img className="bowie-dance-frame is-up" src={danceUp} alt="両手を上げて喜ぶ主人公" data-testid="bowie-dance-up" draggable={false} />
              <img className="bowie-dance-frame is-down" src={danceDown} alt="" data-testid="bowie-dance-down" draggable={false} />
            </div>
          </div>
        </div>
        <div className="bowie-defeat-bar">
          <button type="button" className="btn bowie-skip-quiet" onClick={onSkip} data-testid="bowie-skip">
            演出を飛ばす
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={`bowie-result is-${result.kind} step-${result.step}`} data-testid="bowie-result" data-kind={result.kind} data-step={result.step}>
      <div className="bowie-result-art">
        {lose ? (
          result.step === 'taunt' && result.taunt ? <img src={result.taunt.src} alt={`ボウイ「${result.taunt.line}」`} data-testid="bowie-taunt" data-taunt-id={result.taunt.id} /> : null
        ) : result.step === 'victory' ? (
          <img className="bowie-result-figure" src={heroVictory} alt="勝利した主人公" />
        ) : (
          <img className="bowie-result-figure" src={bowieDespair} alt="絶望するボウイ" />
        )}
      </div>
      <div className="bowie-result-panel">
        <h2>{lose ? 'ゲームオーバー' : '全問クリア！'}</h2>
        <p className="bowie-result-score">
          最終得点 <strong data-testid="bowie-final-score">{result.score}</strong> 点
        </p>
        <p>
          解除 <strong data-testid="bowie-solved">{result.solved}</strong> / {result.total}
        </p>
        <p data-testid="bowie-result-best">
          ハイスコア <strong>{result.record.best}</strong> 点{result.newBest && <span className="bowie-new">新記録！</span>}
        </p>
        {!result.saved && <p className="hint">記録をこの端末に保存できませんでした（ゲームは続けられます）。</p>}
        <div className="bowie-actions">
          {playing && (
            <button type="button" className="btn" onClick={onSkip} data-testid="bowie-skip">
              演出を飛ばす
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={once(onRetry)} data-testid="bowie-retry">
            再挑戦
          </button>
          <button type="button" className="btn" onClick={once(onHome)} data-testid="bowie-home">
            ホームへ
          </button>
        </div>
      </div>
    </div>
  );
}
