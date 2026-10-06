import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PracticeClock } from '../core/clock';
import { Deck } from '../core/deck';
import { deckModeFor, selectQuestions } from '../core/questionSource';
import { themeLabel, type Question } from '../core/questions';
import { buildResult, newResultId, type PracticeConfig, type PracticeTotals } from '../core/result';
import { BUILTIN_QUESTIONS } from '../data/builtinQuestions';
import { useApp } from '../state/AppContext';
import { navigate } from '../state/router';
import { sound } from '../sound';
import { teacherMaterialCache } from './TypingSetup';
import { RomajiRunner } from './RomajiRunner';
import { SentenceRunner } from './SentenceRunner';

export interface RunnerProps {
  deck: Deck;
  config: PracticeConfig;
  /** 練習中か（時間切れ後の入力を受け付けないため、入力のたびに確認します） */
  isActive: () => boolean;
  /** 集計値を返す関数を登録します */
  registerTotals: (get: () => Omit<PracticeTotals, 'elapsedMs' | 'finished'>) => void;
  onTimeUp: () => void;
}

type Phase = 'countdown' | 'running' | 'confirmQuit';

export function Practice() {
  const { lastConfig, recordResult, settings } = useApp();
  const config = lastConfig;
  const questions = useMemo<Question[]>(() => (config ? selectQuestions(BUILTIN_QUESTIONS, config, teacherMaterialCache) : []), [config]);
  const deck = useMemo(() => (questions.length > 0 && config ? new Deck(questions, deckModeFor(config)) : null), [questions, config]);
  const clock = useMemo(() => new PracticeClock((config?.minutes ?? 3) * 60_000), [config]);
  const [phase, setPhase] = useState<Phase>('countdown');
  const [count, setCount] = useState(3);
  const [remaining, setRemaining] = useState(clock.durationMs);
  const totalsRef = useRef<() => Omit<PracticeTotals, 'elapsedMs' | 'finished'>>(() => ({ correct: 0, miss: 0, completedQuestions: 0 }));
  const startedAt = useRef<Date>(new Date());
  const finishedRef = useRef(false);

  const finish = useCallback(
    (completedFullTime: boolean) => {
      if (finishedRef.current || !config) return;
      finishedRef.current = true;
      clock.stop();
      const totals = totalsRef.current();
      const elapsedMs = completedFullTime ? clock.durationMs : Math.round(clock.elapsedMs());
      const result = buildResult(newResultId(), startedAt.current, config, { ...totals, elapsedMs, finished: completedFullTime });
      if (settings.sound) sound.finish();
      (document.activeElement as HTMLElement | null)?.blur?.();
      recordResult(result);
      navigate('/result');
    },
    [clock, config, recordResult, settings.sound],
  );

  // 3秒のカウントダウン
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) {
      startedAt.current = new Date();
      clock.start();
      setPhase('running');
      return;
    }
    const t = window.setTimeout(() => setCount((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [phase, count, clock]);

  // 残り時間（開始時刻からの経過で計算するため、画面が非表示の間も時間は進みます）
  useEffect(() => {
    if (!clock.started) return;
    const tick = () => {
      setRemaining(clock.remainingMs());
      if (clock.isOver()) finish(true);
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

  // 練習中に画面を離れたら（ブラウザの戻るボタンなど）途中終了として扱います
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(
    () => () => {
      if (clock.started && !finishedRef.current) finishRef.current(false);
    },
    [clock],
  );

  const isActive = useCallback(() => {
    if (!clock.started || finishedRef.current) return false;
    if (clock.isOver()) {
      finish(true);
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

  const sec = Math.ceil(remaining / 1000);
  const mm = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, '0');
  const label = `${config.kind === 'romaji' ? 'ローマ字入力' : '文章入力〈変換あり〉'}・${config.minutes}分・${
    config.setType === 'standard'
      ? '標準問題'
      : config.setType === 'sakura'
        ? `🌸桜モード（${config.theme === 'all' ? 'すべて' : themeLabel('sakura', config.theme)}）`
        : config.setType === 'teacher'
          ? '先生の追加教材'
          : '一般問題'
  }・${config.inputMethod === 'keyboard' ? '実物キーボード' : '画面入力'}`;

  return (
    <main className="practice-main">
      <div className="practice-bar">
        <span className={`timer ${sec <= 10 && phase !== 'countdown' ? 'timer-low' : ''}`} aria-label={`残り時間 ${mm}分${ss}秒`}>
          残り {mm}:{ss}
        </span>
        <span className="hint practice-label">{label}</span>
        {phase === 'running' && (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setPhase('confirmQuit')}>
            途中で終わる
          </button>
        )}
      </div>

      {phase === 'countdown' && (
        <div className="countdown" role="timer" aria-live="assertive">
          <p>まもなく始まります。{config.kind === 'romaji' && config.inputMethod === 'keyboard' && '日本語入力はオフ（半角英数）にしてください。'}</p>
          <div className="countdown-num">{count > 0 ? count : 'スタート'}</div>
        </div>
      )}

      {phase !== 'countdown' && (
        <>
          {config.kind === 'romaji' ? (
            <RomajiRunner
              deck={deck}
              config={config}
              isActive={() => phase === 'running' && isActive()}
              registerTotals={(g) => (totalsRef.current = g)}
              onTimeUp={() => finish(true)}
            />
          ) : (
            <SentenceRunner
              deck={deck}
              config={config}
              isActive={() => phase === 'running' && isActive()}
              registerTotals={(g) => (totalsRef.current = g)}
              onTimeUp={() => finish(true)}
            />
          )}
        </>
      )}

      {phase === 'confirmQuit' && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="quit-title">
          <div className="modal">
            <h2 id="quit-title">途中で終わりますか？</h2>
            <p>時間は止まりません。途中で終わった記録は、完走の記録や正式ランクには使われません。</p>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => finish(false)}>
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
