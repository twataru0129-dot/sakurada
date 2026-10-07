import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { keyForChar } from '../../core/keyboardLayout';
import { newResultId } from '../../core/result';
import { buildGameResult } from '../../core/game/result';
import { completionYearFor, formatGameTime, GameClock, penaltyMsFor, recordTimeMsFor, SakuradaGame, type GameSnapshot } from '../../core/game/sakurada';
import { COURSE_LABEL, findStory } from '../../data/gameStories';
import { useApp } from '../../state/AppContext';
import { navigate } from '../../state/router';
import { sound } from '../../sound';
import { Hands } from '../../ui/Hands';
import { GameKeyboard } from '../../ui/game/GameKeyboard';
import { displayLines, wordBreaks, wrapLines } from '../../core/game/romajiDisplay';
import { BuildingView } from '../../ui/game/BuildingView';
import { ProgressGauge } from '../../ui/game/ProgressGauge';
import { usePreloadStages } from '../../ui/game/stageImages';
import { isStartKey } from '../Practice';

type Phase = 'ready' | 'running' | 'paused' | 'confirmQuit' | 'finished';

/** 工程が変わったときに短く表示する言葉 */
const STAGE_START_MESSAGE: Record<number, string> = {
  1: '基礎工事が始まった！',
  2: '壁の建築が始まった！',
  3: '本体の建築が始まった！',
  4: '塔の工事が始まった！',
};

/**
 * 文の枠の高さは画面の配置で決まります（文が変わっても枠は動きません）。
 * 長い文で枠に入りきらないときだけ、その文の間は文字を少し小さくします（最小 0.75 倍。入力中には変えません）。
 */
function useFitScale(panel: RefObject<HTMLElement | null>, body: RefObject<HTMLElement | null>, key: string): number {
  const [state, setState] = useState({ key: '', fit: 1 });
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(el.clientWidth * 10000 + el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [panel]);
  const fullKey = `${key}|${size}`;
  // 文や枠の大きさが変わったら、等倍から測り直します
  const fit = state.key === fullKey ? state.fit : 1;
  useLayoutEffect(() => {
    const p = panel.current;
    const b = body.current;
    if (!p || !b) return;
    const cs = getComputedStyle(p);
    const over = b.scrollHeight > p.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) + 1;
    // 収まらなければ 0.05 ずつ縮めます（行の分け方もその大きさで作り直すため、描画ごとに1段ずつ。画面に出る前に終わります）
    const next = over && fit > 0.75 ? Math.round((fit - 0.05) * 100) / 100 : fit;
    if (state.key !== fullKey || next !== state.fit) setState({ key: fullKey, fit: next });
  }, [panel, body, fullKey, fit, state]);
  return fit;
}

/** 文の幅を測るためのキャンバス（表示はしません） */
let measureCtx: CanvasRenderingContext2D | null | undefined;
const measureCache = new Map<string, number>();
function textWidth(font: string, spacing: number, text: string): number {
  const key = `${font}|${text}`;
  let w = measureCache.get(key);
  if (w === undefined) {
    if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
    if (!measureCtx) return text.length * 16;
    measureCtx.font = font;
    w = measureCtx.measureText(text).width;
    measureCache.set(key, w);
  }
  return w + spacing * text.length;
}

interface WrapMetrics { max: number; kanaFont: string; kanaSpacing: number; romajiFont: string; romajiSpacing: number }

/**
 * 読み・ローマ字の行を、枠の幅に合わせて分けるための寸法（等倍の文字の大きさで測ります）。
 * 縮小（--fit）より前の大きさで測るため、縮小しても改行の位置は変わりません。
 */
function useWrapMetrics(panel: RefObject<HTMLElement | null>, body: RefObject<HTMLElement | null>): WrapMetrics | null {
  const [m, setM] = useState<WrapMetrics | null>(null);
  useEffect(() => {
    const p = panel.current;
    if (!p) return;
    const update = () => {
      const b = body.current;
      if (!b) return;
      const fit = Number(b.dataset.fit) || 1;
      const font = (el: Element | null) => {
        if (!el) return { font: '', spacing: 0, px: 0 };
        const cs = getComputedStyle(el);
        const px = parseFloat(cs.fontSize) / fit;
        const ls = parseFloat(cs.letterSpacing);
        return { font: `${cs.fontWeight} ${px}px ${cs.fontFamily}`, spacing: Number.isFinite(ls) ? ls / fit : 0, px };
      };
      const k = font(b.querySelector('.game-kana'));
      const r = font(b.querySelector('.game-romaji'));
      // 入力した打ち方（nn など）で少し長くなっても収まるよう、ローマ字2文字分の余裕をとります
      const max = Math.floor(b.clientWidth - 2 * r.px * 0.62);
      setM((old) =>
        old && old.max === max && old.kanaFont === k.font && old.romajiFont === r.font
          ? old
          : { max, kanaFont: k.font, kanaSpacing: k.spacing, romajiFont: r.font, romajiSpacing: r.spacing },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(p);
    return () => ro.disconnect();
  }, [panel, body]);
  return m;
}

/** 開始のスペースを、ボタンや入力欄の操作から奪わないための判定 */
function isControl(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return !!t?.closest?.('button, input, select, textarea, a, [contenteditable="true"], label');
}

export function SakuradaPlay() {
  const { gameSession } = useApp();
  const story = gameSession ? findStory(gameSession.storyId) : null;
  if (!gameSession || !story) {
    return (
      <main>
        <p>ゲームの設定がありません。</p>
        <button type="button" className="btn" onClick={() => navigate('/game/sakurada')}>
          ゲームの紹介へ
        </button>
      </main>
    );
  }
  return <Play key={`${story.id}:${gameSession.courseId}`} />;
}

function Play() {
  const { gameSession, settings, recordGame } = useApp();
  const session = gameSession!;
  const story = findStory(session.storyId)!;
  const touch = session.inputMethod === 'touch';
  // 開始したときのローマ字のお手本で最後まで続けます
  const [style] = useState(settings.romajiStyle);
  const game = useMemo(() => new SakuradaGame(story, style), [story, style]);
  const clock = useMemo(() => new GameClock(), []);
  const resultId = useRef(newResultId());
  const startedAt = useRef(new Date());
  const [phase, setPhase] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  phaseRef.current = phase;
  const [snap, setSnap] = useState<GameSnapshot>(() => game.snapshot());
  const [now, setNow] = useState(0);
  const [penaltyPop, setPenaltyPop] = useState(0);
  /** ミスの軽い強調（入力枠・ミスの表示）。続けてミスしても、表示は1つだけで重なりません */
  const [missFx, setMissFx] = useState(false);
  const missFxTimer = useRef<number | undefined>(undefined);
  /** 工程が変わったときの短い表示（入力文は覆いません） */
  const [stageToast, setStageToast] = useState<{ key: number; text: string } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [sparkle, setSparkle] = useState(0);
  const [imeWarning, setImeWarning] = useState(false);
  const [touchNote, setTouchNote] = useState(false);
  const loadState = usePreloadStages();
  const finished = useRef(false);
  const sentenceRef = useRef<HTMLElement>(null);
  const sentenceBodyRef = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      window.clearTimeout(missFxTimer.current);
      window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    clock.stop();
    setPhase('finished');
    if (settings.sound) sound.finish();
    recordGame(
      buildGameResult({
        id: resultId.current,
        storySetVersion: story.storySetVersion,
        storyId: story.id,
        courseId: story.courseId,
        inputMethod: session.inputMethod,
        romajiStyle: style,
        startedAt: startedAt.current,
        finishedAt: new Date(),
        elapsedMs: clock.elapsedMs(),
        missCount: game.missCount,
        correctKeystrokes: game.correctKeystrokes,
        completedReadingCharacters: game.completedReadingCharacters,
        totalReadingCharacters: game.totalReadingCharacters,
        pauseCount: clock.pauseCount,
        finished: true,
      }),
    );
    navigate('/game/sakurada/result');
  }, [clock, game, recordGame, session.inputMethod, settings.sound, story, style]);

  const start = useCallback(() => {
    if (clock.started) return;
    startedAt.current = new Date();
    clock.start();
    setPhase('running');
  }, [clock]);

  const feed = useCallback(
    (ch: string) => {
      if (phaseRef.current !== 'running' || finished.current) return;
      const before = game.snapshot().stage.index;
      const r = game.input(ch);
      if (r === 'ignored') return;
      // ミスの判定と5秒の加算は game.input の中で1回だけ行います（ここからは表示と音だけ）
      if (r === 'miss') {
        setPenaltyPop((n) => n + 1);
        setMissFx(true);
        window.clearTimeout(missFxTimer.current);
        missFxTimer.current = window.setTimeout(() => setMissFx(false), 800);
        if (settings.sound) sound.gameMiss();
      } else {
        setSparkle((n) => n + 1);
        const after = game.snapshot().stage.index;
        if (after > before && !game.done) {
          if (settings.sound) sound.complete();
          setStageToast({ key: after, text: STAGE_START_MESSAGE[after] ?? '' });
          window.clearTimeout(toastTimer.current);
          toastTimer.current = window.setTimeout(() => setStageToast(null), 2600);
        }
      }
      setSnap(game.snapshot());
      if (game.done) finish();
    },
    [finish, game, settings.sound],
  );

  // キーの受け付け
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = phaseRef.current;
      if (p === 'ready') {
        if (e.key !== ' ' && e.code !== 'Space') return;
        // ボタン・入力欄などを操作しているときのスペースは、その操作に使います
        if (isControl(e.target)) return;
        e.preventDefault();
        if (isStartKey(e)) start();
        return;
      }
      if (p !== 'running') return;
      // 日本語入力（IME）の変換中・修飾キーつき・押しっぱなしのくり返しはミスに数えません
      if (e.isComposing || e.key === 'Process' || e.keyCode === 229) {
        if (!touch) setImeWarning(true);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        pause();
        return;
      }
      if ([...e.key].length !== 1) return; // Shift・Enter・Tab・矢印・ファンクションキーなど
      if (e.key === ' ') {
        if (!isControl(e.target)) e.preventDefault();
        return;
      }
      if ((e.target as HTMLElement)?.closest?.('.modal')) return;
      e.preventDefault();
      if (e.repeat) return;
      if (touch) {
        setTouchNote(true);
        return;
      }
      setImeWarning(false);
      feed(e.key);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, start, touch]);

  // 時間の表示（計測そのものは時計で行い、表示の更新回数は時間に使いません）
  useEffect(() => {
    if (phase !== 'running') return;
    const t = window.setInterval(() => setNow(clock.elapsedMs()), 200);
    return () => window.clearInterval(t);
  }, [phase, clock]);

  const pause = () => {
    if (phaseRef.current !== 'running') return;
    clock.pause();
    setNow(clock.elapsedMs());
    setPhase('paused');
  };
  const resume = () => {
    clock.resume();
    setPhase('running');
  };

  const elapsed = phase === 'ready' ? 0 : now;
  const penalty = penaltyMsFor(snap.missCount);
  const nextKey = snap.done ? null : snap.matcher.nextKey();
  const target = nextKey ? keyForChar(nextKey) : null;
  const keyLabel = nextKey === null ? '' : nextKey === '-' ? 'ー（-）' : nextKey.toUpperCase();
  const showKeyboard = settings.keyboardGuide || touch;
  const ms = snap.matcher.snapshot();
  // 表示上の改行（「、」「。」のあと）。判定・文字数には関係しません
  const wrap = useWrapMetrics(sentenceRef, sentenceBodyRef);
  const fit = useFitScale(sentenceRef, sentenceBodyRef, String(snap.sentenceIndex));
  const breaks = useMemo(() => wordBreaks(snap.sentence.text, snap.sentence.reading), [snap.sentence.text, snap.sentence.reading]);
  const lines = useMemo(() => {
    const base = displayLines(snap.sentence.reading, style, ms.typed);
    if (!wrap) return base;
    return wrapLines(
      base,
      (t) => textWidth(wrap.kanaFont, wrap.kanaSpacing, t),
      (t) => (wrap.romajiFont ? textWidth(wrap.romajiFont, wrap.romajiSpacing, t) : 0),
      // 縮小した分だけ、1行に入る量が増えます（寸法は等倍で測っています）
      wrap.max / fit,
      breaks,
    );
  }, [snap.sentence.reading, style, ms.typed, wrap, fit, breaks]);

  return (
    <main className="game-main game-fit" data-testid="game-main">
      <div className="game-top">
        <div className="game-bar">
          <span className="game-title-small">サクラダファミリアを完成させよ・{COURSE_LABEL[story.courseId]}</span>
          <span className="game-time" data-testid="game-time">
            入力時間 <strong>{formatGameTime(elapsed)}</strong>
          </span>
          <span className={`game-penalty ${missFx ? 'is-miss' : ''}`} data-testid="game-penalty">
            ミス {snap.missCount}回（＋{penalty / 1000}秒）
            {missFx && (
              <span key={penaltyPop} className="penalty-pop" aria-hidden="true" data-testid="penalty-pop">
                ＋5秒
              </span>
            )}
          </span>
          <span className="game-year hint" data-testid="game-year">
            ゲーム内の年：{completionYearFor(recordTimeMsFor(elapsed, snap.missCount))}年
          </span>
          <span className="spacer" />
          {phase === 'running' && (
            <button type="button" className="btn btn-small" onClick={pause} data-testid="game-pause">
              一時停止
            </button>
          )}
          {(phase === 'ready' || phase === 'running') && (
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setPhase('confirmQuit')}>
              やめる
            </button>
          )}
        </div>
        <ProgressGauge completed={snap.completedReadingCharacters} total={snap.totalReadingCharacters} stage={snap.stage} inline />
      </div>

      <div className="game-stage">
        <div className="game-panels">
          <section className="game-panel game-panel-image" aria-label="建物">
            <div className="building-wrap">
              <BuildingView stage={snap.stage.index} loadState={loadState} sparkle={sparkle} toast={stageToast} />
            </div>
          </section>

          <section ref={sentenceRef} className={`game-panel game-sentence ${missFx ? 'is-miss' : ''}`} aria-label="入力する文" data-testid="game-sentence">
            <div ref={sentenceBodyRef} className="game-sentence-body" style={{ ['--fit' as string]: String(fit) } as CSSProperties} data-fit={fit}>
              <p className="hint game-count">
                {Math.min(snap.sentenceIndex + 1, story.sentences.length)} / {story.sentences.length} 文目・{story.title}
              </p>
              <div className="game-text" lang="ja" data-testid="game-text">
                {snap.sentence.text}
              </div>
              <div className="game-kana" aria-label={`読み ${snap.sentence.reading}`} data-testid="game-kana">
                {lines.map((line, li) => (
                  <div className="game-line" key={`${snap.sentenceIndex}-k${li}`}>
                    {line.map((u) => (
                      <span key={u.index} className={`kana-unit ${u.state === 'done' ? 'kana-done' : ''} ${u.state === 'current' ? 'kana-current' : ''}`}>
                        {u.kana}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              {settings.romajiGuide ? (
                <div className="romaji-line game-romaji" data-testid="game-romaji" data-remaining={ms.remaining} aria-label={`ローマ字ガイド：入力済み ${ms.typed}、次に ${nextKey ?? ''}`}>
                  {lines.map((line, li) => (
                    <div className="game-line" key={`${snap.sentenceIndex}-r${li}`}>
                      {line.map((u) => (
                        <span key={u.index} className="romaji-unit">
                          {u.typed && <span className="romaji-typed">{u.typed}</span>}
                          {u.next && <span className="romaji-next">{u.next}</span>}
                          {u.rest && <span className="romaji-rest">{u.rest}</span>}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="romaji-line romaji-line-off game-romaji">
                  <span className="romaji-typed">{ms.typed}</span>
                  <span className="guide-off-note">（ローマ字ガイドは OFF です）</span>
                </div>
              )}
              {imeWarning && (
                <p className="msg msg-warn game-inline-msg" role="alert">
                  日本語入力がオンになっているようです。「半角/全角」キーで英字の入力にしてください。（ミスには数えていません）
                </p>
              )}
              {touchNote && <p className="msg msg-info game-inline-msg">「画面のキーをタップ」で遊んでいます。画面のキーを押してください。</p>}
            </div>
          </section>
        </div>

        {showKeyboard && (
          <div className="game-kb-wrap">
            <GameKeyboard
              nextKey={nextKey}
              highlight={settings.keyboardGuide}
              colored={settings.fingerGuide || settings.keyboardGuide}
              onType={touch ? feed : undefined}
            />
          </div>
        )}
        {settings.fingerGuide && (
          <div className="game-hands">
            <Hands target={target} keyLabel={keyLabel} />
          </div>
        )}
      </div>

      {phase === 'ready' && (
        <div className="game-ready" role="dialog" aria-modal="false" aria-labelledby="game-ready-title">
          <h2 id="game-ready-title">準備ができたら、スペースキーかスタートボタンで工事開始</h2>
          <p className="hint">
            物語：「{story.title}」（{COURSE_LABEL[story.courseId]}）。日本語入力はオフ（半角英数）にしてください。
          </p>
          <button
            type="button"
            className="btn btn-primary btn-large"
            onClick={start}
            onKeyDown={(e) => {
              if (e.key === ' ') e.preventDefault();
            }}
            data-testid="game-go"
          >
            スタート
          </button>
        </div>
      )}

      {phase === 'paused' && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <div className="modal">
            <h2 id="pause-title">一時停止中</h2>
            <p>時間は止まっています。入力も受け付けません。一時停止した記録は、一時停止しなかった記録とは別に比べます。</p>
            <button type="button" className="btn btn-primary" autoFocus onClick={resume} data-testid="game-resume">
              再開する
            </button>
          </div>
        </div>
      )}

      {phase === 'confirmQuit' && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="gquit-title">
          <div className="modal">
            <h2 id="gquit-title">ゲームをやめますか？</h2>
            <p>完成する前にやめると、このプレイは記録しません。{clock.started && '時間は止まりません。'}</p>
            <div className="btn-row">
              <button type="button" className="btn btn-danger" onClick={() => navigate('/game/sakurada')}>
                やめる
              </button>
              <button type="button" className="btn btn-primary" autoFocus onClick={() => setPhase(clock.started ? 'running' : 'ready')}>
                続ける
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
