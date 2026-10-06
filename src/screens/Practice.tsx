import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PracticeClock } from '../core/clock';
import { Deck } from '../core/deck';
import { deckModeFor, selectQuestions } from '../core/questionSource';
import { themeLabel, type Question } from '../core/questions';
import { buildResult, endLabel, newResultId, type PracticeConfig, type PracticeTotals, type QuestionAttempt } from '../core/result';
import { BUILTIN_QUESTIONS } from '../data/builtinQuestions';
import { useApp } from '../state/AppContext';
import { navigate } from '../state/router';
import { sound } from '../sound';
import { teacherMaterialCache } from './TypingSetup';
import { RomajiRunner } from './RomajiRunner';
import { SentenceRunner } from './SentenceRunner';

export interface RunnerTotals extends Omit<PracticeTotals, 'elapsedMs' | 'finished'> {
  /** 出題回ごとの記録（ローマ字入力。ミス詳細に使います） */
  attempts?: QuestionAttempt[];
}

export interface RunnerProps {
  deck: Deck;
  config: PracticeConfig;
  /** 練習中か（時間切れ後の入力を受け付けないため、入力のたびに確認します） */
  isActive: () => boolean;
  /** 練習開始からの経過時間（ミリ秒）。開始待ちの時間は含みません */
  elapsedMs: () => number;
  /** 集計値を返す関数を登録します */
  registerTotals: (get: () => RunnerTotals) => void;
  /** 問題数制：目標の問題数（時間制は null） */
  targetCount: number | null;
  /** 問題数制で目標の問題数を完成したとき（次の問題を取り出す前に呼びます） */
  onGoalReached: () => void;
}

type Phase = 'ready' | 'running' | 'confirmQuit';
type FinishReason = 'time' | 'goal' | 'quit';

/** 開始に使えるスペースキーか（長押しのくり返し・変換中・修飾キー付きは使いません） */
export function isStartKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'repeat' | 'isComposing' | 'keyCode' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>): boolean {
  if (e.key !== ' ' && e.code !== 'Space') return false;
  if (e.repeat || e.isComposing || e.keyCode === 229) return false;
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
  return true;
}

export function Practice() {
  const { lastConfig, recordResult, settings } = useApp();
  const config = lastConfig;
  const questions = useMemo<Question[]>(() => (config ? selectQuestions(BUILTIN_QUESTIONS, config, teacherMaterialCache) : []), [config]);
  const deck = useMemo(() => (questions.length > 0 && config ? new Deck(questions, deckModeFor(config)) : null), [questions, config]);
  const countMode = config?.endMode === 'count';
  // 問題数制は制限時間なし（経過時間だけを測ります）
  const clock = useMemo(
    () => new PracticeClock(config?.endMode === 'count' ? Number.POSITIVE_INFINITY : (config?.minutes ?? 3) * 60_000),
    [config],
  );
  const [phase, setPhase] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  phaseRef.current = phase;
  const [now, setNow] = useState(0);
  const totalsRef = useRef<() => RunnerTotals>(() => ({ correct: 0, miss: 0, completedQuestions: 0 }));
  const startedAt = useRef<Date>(new Date());
  const finishedRef = useRef(false);
  const startedRef = useRef(false);

  const finish = useCallback(
    (reason: FinishReason) => {
      if (finishedRef.current || !config || !clock.started) return;
      finishedRef.current = true;
      clock.stop();
      const { attempts, ...totals } = totalsRef.current();
      const elapsedMs = reason === 'time' ? clock.durationMs : Math.round(clock.elapsedMs());
      const result = buildResult(newResultId(), startedAt.current, config, { ...totals, elapsedMs, finished: reason !== 'quit' }, attempts ?? []);
      if (settings.sound) sound.finish();
      (document.activeElement as HTMLElement | null)?.blur?.();
      recordResult(result);
      navigate('/result');
    },
    [clock, config, recordResult, settings.sound],
  );

  /** 練習を始めます。開始時刻はこの瞬間です（開始待ちの時間は計測に含めません） */
  const start = useCallback(() => {
    if (startedRef.current || !deck) return;
    startedRef.current = true;
    startedAt.current = new Date();
    clock.start();
    setPhase('running');
  }, [clock, deck]);

  // 開始待ち：スペースキーで開始。開始に使ったキーは問題の入力に渡しません
  useEffect(() => {
    if (phase !== 'ready') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.code !== 'Space') return;
      // ページのスクロールやボタンの押下を防ぎます
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isStartKey(e)) start();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [phase, start]);

  // 残り時間・経過時間（開始時刻からの経過で計算するため、画面が非表示の間も時間は進みます）
  useEffect(() => {
    if (!clock.started) return;
    const tick = () => {
      setNow(clock.elapsedMs());
      if (clock.isOver()) finish('time');
    };
    const t = window.setInterval(tick, 200);
    const onVis = () => tick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [clock, clock.started, phase, finish]);

  // 練習中に画面を離れたら（ブラウザの戻るボタンなど）途中終了として扱います。開始前なら記録は作りません
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(
    () => () => {
      if (clock.started && !finishedRef.current) finishRef.current('quit');
    },
    [clock],
  );

  const isActive = useCallback(() => {
    if (!clock.started || finishedRef.current) return false;
    if (clock.isOver()) {
      finish('time');
      return false;
    }
    return true;
  }, [clock, finish]);

  if (!config || !deck) {
    return (
      <main>
        <p>練習の設定がありません。</p>
        <button type="button" className="btn" onClick={() => navigate('/typing')}>
          練習の設定へ
        </button>
      </main>
    );
  }

  const shownMs = countMode ? now : clock.durationMs - now;
  const sec = countMode ? Math.floor(shownMs / 1000) : Math.ceil(shownMs / 1000);
  const mm = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, '0');
  const label = `${config.kind === 'romaji' ? 'ローマ字入力' : '文章入力〈変換あり〉'}・${endLabel(config)}・${
    config.setType === 'standard'
      ? '標準問題'
      : config.setType === 'sakura'
        ? `🌸桜モード（${config.theme === 'all' ? 'すべて' : themeLabel('sakura', config.theme)}）`
        : config.setType === 'teacher'
          ? '先生の追加教材'
          : '一般問題'
  }・${config.inputMethod === 'keyboard' ? '実物キーボード' : '画面入力'}`;
  const runnerProps: RunnerProps = {
    deck,
    config,
    isActive: () => phaseRef.current === 'running' && isActive(),
    elapsedMs: () => clock.elapsedMs(),
    registerTotals: (g) => (totalsRef.current = g),
    targetCount: countMode ? config.targetCount : null,
    onGoalReached: () => finish('goal'),
  };

  return (
    <main className="practice-main">
      <div className="practice-bar">
        {countMode ? (
          <span className="timer" aria-label={`経過時間 ${mm}分${ss}秒`}>
            経過 {mm}:{ss}
          </span>
        ) : (
          <span className={`timer ${sec <= 10 && phase !== 'ready' ? 'timer-low' : ''}`} aria-label={`残り時間 ${mm}分${ss}秒`}>
            残り {mm}:{ss}
          </span>
        )}
        <span className="hint practice-label">{label}</span>
        {phase === 'running' && (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setPhase('confirmQuit')}>
            途中で終わる
          </button>
        )}
      </div>

      {phase === 'ready' && (
        <div className="ready-screen">
          <p className="ready-message">準備ができたら、スペースキーを押してスタート</p>
          {config.kind === 'romaji' && config.inputMethod === 'keyboard' && <p className="hint">日本語入力はオフ（半角英数）にしてください。</p>}
          <button
            type="button"
            className="btn btn-primary ready-button"
            onClick={start}
            // スペースキーでの開始は上の処理で行うため、ボタンのキー操作による二重の開始を防ぎます
            onKeyDown={(e) => {
              if (e.key === ' ') e.preventDefault();
            }}
          >
            スタート
          </button>
          <p className="hint">{countMode ? `${config.targetCount}問を完成したら終わります。時間の制限はありません。` : 'スタートすると時間が進み始めます。'}</p>
        </div>
      )}

      {phase !== 'ready' && (config.kind === 'romaji' ? <RomajiRunner {...runnerProps} /> : <SentenceRunner {...runnerProps} />)}

      {phase === 'confirmQuit' && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="quit-title">
          <div className="modal">
            <h2 id="quit-title">途中で終わりますか？</h2>
            <p>{countMode ? '途中で終わった記録は、問題数の完了として扱いません。' : '時間は止まりません。途中で終わった記録は、完走の記録や正式ランクには使われません。'}</p>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => finish('quit')}>
                終わる
              </button>
              <button type="button" className="btn btn-quiet" autoFocus onClick={() => setPhase('running')}>
                続ける
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
