/**
 * 桜ガーデンの練習（短い文章）。
 *
 * - 判定は既存のローマ字判定（RomajiMatcher）に読みを渡すだけです。お手本の表記は設定のローマ字の方式に従い、
 *   別の打ち方（si / shi など）もすべて正解です。間違えたら、正しいキーを打てばそのまま続けられます。
 * - 句読点・空白は読みに含まれないため、入力は必要ありません。時間制限はありません。
 * - 問題が完成したときだけ、その問題のごほうび（水・花びら・かなの文字数）を記録します（state.ts）。
 * - スペースでの開始は開始待ちのときだけです。入力中のキーは庭の操作に使いません。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RomajiMatcher } from '../../core/romaji';
import { COPY, fill, REWARD } from '../../core/garden/config';
import { kanaCount, problemById } from '../../core/garden/problems';
import { solveEventId, type GardenState, type PracticeSession } from '../../core/garden/state';
import { displayLines, wordBreaks, wrapLines } from '../../core/game/romajiDisplay';
import { isStartKey } from '../../screens/Practice';
import { sound } from '../../sound';
import { useApp } from '../../state/AppContext';
import { GameKeyboard } from '../game/GameKeyboard';
import { textWidth, useWrapMetrics } from '../game/romajiWrap';
import type { GardenEventType } from '../../core/garden/state';

type Phase = 'ready' | 'running' | 'paused' | 'finished';

export interface SittingSummary {
  solved: number;
  water: number;
  petals: number;
}

interface Props {
  state: GardenState;
  session: PracticeSession;
  act: (type: GardenEventType, data?: Record<string, unknown>, id?: string) => boolean;
  /** 画面のキーボードを表示するか（タッチ操作の端末） */
  touch: boolean;
  onExit: () => void;
}

const isControl = (el: EventTarget | null) => !!(el as HTMLElement | null)?.closest?.('button, input, select, textarea, a, [contenteditable="true"], label');

export function GardenPractice({ state, session, act, touch, onExit }: Props) {
  const { settings } = useApp();
  const [style] = useState(settings.romajiStyle);
  const firstOpen = () => session.problems.findIndex((_, i) => !session.solved.has(i));
  const [index, setIndex] = useState(() => Math.max(0, firstOpen()));
  const problem = problemById(session.problems[index]!)!;
  const matcher = useMemo(() => new RomajiMatcher(problem.reading, style), [problem.reading, style]);
  const [, setTick] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  phaseRef.current = phase;
  const [sum, setSum] = useState<SittingSummary>({ solved: 0, water: 0, petals: 0 });
  const [reward, setReward] = useState<{ key: number; text: string } | null>(null);
  const rewardTimer = useRef<number | undefined>(undefined);
  const [miss, setMiss] = useState(false);
  const missTimer = useRef<number | undefined>(undefined);
  const [ime, setIme] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const busy = useRef(false);
  useEffect(
    () => () => {
      window.clearTimeout(rewardTimer.current);
      window.clearTimeout(missTimer.current);
    },
    [],
  );

  const finish = useCallback(() => {
    act('end', { session: session.id });
    setPhase('finished');
    if (settings.sound) sound.finish();
  }, [act, session.id, settings.sound]);

  const complete = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    const kana = kanaCount(problem);
    const water = REWARD.waterPerProblem + Math.floor((stateRef.current.kanaCarry + kana) / REWARD.kanaPerBonusWater);
    const ok = act('solve', { session: session.id, index }, solveEventId(session.id, index));
    if (ok) {
      setSum((s) => ({ solved: s.solved + 1, water: s.water + water, petals: s.petals + REWARD.petalsPerProblem }));
      setReward({ key: Date.now(), text: fill(COPY.practice.reward_small, { water, petals: REWARD.petalsPerProblem }) });
      window.clearTimeout(rewardTimer.current);
      rewardTimer.current = window.setTimeout(() => setReward(null), 1800);
      if (settings.sound) sound.complete();
    }
    const next = session.problems.findIndex((_, i) => i > index && !session.solved.has(i));
    busy.current = false;
    if (next < 0) finish();
    else setIndex(next);
  }, [act, finish, index, problem, session, settings.sound]);

  const feed = useCallback(
    (ch: string) => {
      if (phaseRef.current !== 'running' || matcher.done) return;
      const r = matcher.input(ch);
      if (r === 'ignored') return;
      if (r === 'miss') {
        setMiss(true);
        window.clearTimeout(missTimer.current);
        missTimer.current = window.setTimeout(() => setMiss(false), 500);
        if (settings.sound) sound.miss();
      }
      setTick((n) => n + 1);
      if (matcher.done) complete();
    },
    [complete, matcher, settings.sound],
  );

  const start = useCallback(() => {
    if (phaseRef.current === 'ready') setPhase('running');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = phaseRef.current;
      if (p === 'ready') {
        if (e.key !== ' ' && e.code !== 'Space') return;
        if (isControl(e.target)) return;
        e.preventDefault();
        if (isStartKey(e)) start();
        return;
      }
      if (p !== 'running') return;
      if (e.isComposing || e.key === 'Process' || e.keyCode === 229) {
        setIme(true);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setPhase('paused');
        return;
      }
      if ([...e.key].length !== 1) return;
      if (e.key === ' ') {
        if (!isControl(e.target)) e.preventDefault();
        return;
      }
      if ((e.target as HTMLElement)?.closest?.('.modal, input, textarea')) return;
      e.preventDefault();
      if (e.repeat) return;
      setIme(false);
      feed(e.key);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [feed, start]);

  // 読み・ローマ字の表示（改行は表示だけ。読みとローマ字は同じ位置で改行します）
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const wrap = useWrapMetrics(panelRef, bodyRef);
  const breaks = useMemo(() => wordBreaks(problem.text, problem.reading), [problem]);
  const typed = matcher.typedText;
  const lines = useMemo(() => {
    const base = displayLines(problem.reading, style, typed);
    if (!wrap) return base;
    return wrapLines(base, (t) => textWidth(wrap.kanaFont, wrap.kanaSpacing, t), (t) => (wrap.romajiFont ? textWidth(wrap.romajiFont, wrap.romajiSpacing, t) : 0), wrap.max, breaks);
  }, [problem.reading, style, typed, wrap, breaks]);
  const nextKey = matcher.done ? null : matcher.nextKey();

  if (phase === 'finished') {
    return (
      <section className="gpractice gpractice-done" aria-labelledby="gp-done-title" data-testid="garden-finished">
        <h2 id="gp-done-title">{COPY.practice.finished_title}</h2>
        <p>{fill(COPY.practice.finished_body, { count: sum.solved })}</p>
        <p className="gpractice-sum" data-testid="garden-summary">
          {fill(COPY.practice.reward_summary, { water: sum.water, petals: sum.petals })}
        </p>
        <p className="hint">{COPY.practice.next_action}</p>
        <button type="button" className="btn btn-primary gbtn" onClick={onExit} autoFocus data-testid="garden-back-to-garden">
          庭へもどる
        </button>
      </section>
    );
  }

  return (
    <section ref={panelRef} className={`gpractice ${miss ? 'is-miss' : ''}`} aria-label="練習" data-testid="garden-practice">
      <div className="gpractice-head">
        <span className="gpractice-count" data-testid="garden-progress" aria-label={`${index + 1}問目（全${session.problems.length}問）`}>
          {fill(COPY.practice.progress, { current: index + 1, total: session.problems.length })}
        </span>
        <span className="gpractice-reward" aria-live="polite" data-testid="garden-reward">
          {reward && <span key={reward.key}>{reward.text}</span>}
        </span>
        {phase === 'running' && (
          <button type="button" className="btn btn-small gbtn" onClick={() => setPhase('paused')} data-testid="garden-pause">
            {COPY.buttons.pause}
          </button>
        )}
      </div>
      <div ref={bodyRef} className="gpractice-body">
        <div className="game-text gpractice-text" lang="ja" data-testid="garden-text">
          {problem.text}
        </div>
        <div className="game-kana gpractice-kana" aria-label={`読み ${problem.reading}`} data-testid="garden-kana">
          {lines.map((line, li) => (
            <div className="game-line" key={`${index}-k${li}`}>
              {line.map((u) => (
                <span key={u.index} className={`kana-unit ${u.state === 'done' ? 'kana-done' : ''} ${u.state === 'current' && phase === 'running' ? 'kana-current' : ''}`}>
                  {u.kana}
                </span>
              ))}
            </div>
          ))}
        </div>
        {settings.romajiGuide ? (
          <div className="game-romaji gpractice-romaji" data-testid="garden-romaji" data-remaining={matcher.remaining()} aria-label={`ローマ字：入力済み ${typed}、次に ${nextKey ?? ''}`}>
            {lines.map((line, li) => (
              <div className="game-line" key={`${index}-r${li}`}>
                {line.map((u) => (
                  <span key={u.index} className="romaji-unit">
                    {u.typed && <span className="romaji-typed">{u.typed}</span>}
                    {u.next && <span className={phase === 'running' ? 'romaji-next' : 'romaji-rest'}>{u.next}</span>}
                    {u.rest && <span className="romaji-rest">{u.rest}</span>}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="game-romaji gpractice-romaji" data-testid="garden-romaji" data-remaining={matcher.remaining()}>
            <span className="romaji-typed">{typed}</span>
            <span className="guide-off-note">（ローマ字ガイドは OFF です）</span>
          </div>
        )}
        {ime && <p className="msg msg-warn gpractice-msg" role="alert">日本語入力がオンになっているようです。「半角/全角」キーで英字の入力にしてください。（ミスには数えていません）</p>}
      </div>
      {phase === 'ready' && (
        <div className="gpractice-ready">
          <p>{COPY.practice.ready}</p>
          <button type="button" className="btn btn-primary gbtn" onClick={start} data-testid="garden-go">
            {COPY.buttons.space_start}
          </button>
          <p className="hint">{COPY.practice.no_countdown_penalty}</p>
        </div>
      )}
      {touch && phase === 'running' && (
        <div className="gpractice-kb">
          <GameKeyboard nextKey={nextKey} highlight={settings.keyboardGuide} colored={settings.keyboardGuide || settings.fingerGuide} onType={feed} />
        </div>
      )}
      {phase === 'paused' && (
        <div className="modal-back" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="gp-pause-title" data-testid="garden-paused">
            <h2 id="gp-pause-title">{COPY.practice.interrupted_title}</h2>
            <p>{COPY.practice.interrupted_body}</p>
            <div className="row">
              <button type="button" className="btn btn-primary gbtn" autoFocus onClick={() => setPhase('running')} data-testid="garden-resume">
                {COPY.buttons.resume}
              </button>
              <button type="button" className="btn gbtn" onClick={finish} data-testid="garden-end">
                {COPY.buttons.end}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
