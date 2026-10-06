import { useCallback, useEffect, useRef, useState } from 'react';
import { keyForChar } from '../core/keyboardLayout';
import { RomajiMatcher, type RomajiSnapshot } from '../core/romaji';
import type { QuestionAttempt } from '../core/result';
import type { Question } from '../core/questions';
import { useApp } from '../state/AppContext';
import { sound } from '../sound';
import { Hands } from '../ui/Hands';
import { Keyboard } from '../ui/Keyboard';
import type { RunnerProps } from './Practice';

/** 文字の入力ではないキー（ミスに数えません） */
function isTypingKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if ([...e.key].length !== 1) return false; // Shift, Enter, Tab, 矢印 などの名前つきのキー
  if (e.key === ' ') return false; // スペースは問題に使っていないため、ミスに数えません
  return true;
}

export function useCompact(): boolean {
  const q = '(max-width: 600px)';
  const [c, setC] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setC(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return c;
}

function newAttempt(seq: number, q: Question, m: RomajiMatcher, startMs: number): QuestionAttempt {
  return {
    seq,
    questionId: q.id,
    text: q.text,
    reading: q.reading,
    units: m.units.map((u) => u.kana),
    startMs,
    endMs: startMs,
    completed: false,
    correct: 0,
    miss: 0,
    typed: '',
    remainingGuide: m.remaining(),
    misses: [],
  };
}

export function RomajiRunner({ deck, config, isActive, elapsedMs, registerTotals, targetCount, onGoalReached }: RunnerProps) {
  const { settings } = useApp();
  const style = config.romajiStyle ?? settings.romajiStyle;
  const activeRef = useRef(isActive);
  activeRef.current = isActive;
  const elapsedRef = useRef(elapsedMs);
  elapsedRef.current = elapsedMs;
  const goalRef = useRef(onGoalReached);
  goalRef.current = onGoalReached;
  const [question, setQuestion] = useState<Question>(() => deck.next());
  const matcher = useRef(new RomajiMatcher(question.reading, style));
  const [snap, setSnap] = useState<RomajiSnapshot>(() => matcher.current.snapshot());
  const totals = useRef({ correct: 0, miss: 0, completedQuestions: 0 });
  /** 出題回ごとの記録（判定したその場で記録します） */
  const attempts = useRef<QuestionAttempt[]>([]);
  const current = useRef<QuestionAttempt>(newAttempt(1, question, matcher.current, elapsedMs()));
  const [missCount, setMissCount] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  /** 何問目か（問題が変わったら表示を作り直し、前の問題の強調などを残さないため） */
  const [seq, setSeq] = useState(0);
  /** 読み上げ用の通知（画面には表示しません） */
  const [announce, setAnnounce] = useState('');
  const [imeWarning, setImeWarning] = useState(false);
  const [touchNote, setTouchNote] = useState(false);
  const compact = useCompact();
  const touch = config.inputMethod === 'touch';
  const finishedRef = useRef(false);

  useEffect(() => {
    registerTotals(() => {
      const list = [...attempts.current];
      const cur = current.current;
      // 時間切れ・途中終了の「入力途中」の問題も、入力があれば記録に含めます
      if (!cur.completed && cur.correct + cur.miss > 0) {
        list.push({ ...cur, endMs: elapsedRef.current(), typed: matcher.current.typedText, remainingGuide: matcher.current.remaining() });
      }
      return { ...totals.current, attempts: list };
    });
  }, [registerTotals]);

  const feed = useCallback(
    (ch: string) => {
      if (finishedRef.current || !activeRef.current()) return;
      const m = matcher.current;
      const typedBefore = m.typedText;
      const unitIndex = m.unitIndex;
      const guideChar = m.nextKey() ?? '';
      const r = m.input(ch);
      if (r === 'ignored') return;
      const cur = current.current;
      if (r === 'miss') {
        totals.current.miss++;
        cur.miss++;
        // ミスの時点の状態は変わらないので、ここで正しいキーの一覧（別の正しい打ち方も含む）を記録します
        cur.misses.push({
          position: typedBefore.length,
          unitIndex,
          kana: m.units[unitIndex]?.kana ?? '',
          typedBefore,
          guideChar,
          acceptable: m.acceptableKeys(),
          pressed: ch.toLowerCase(),
        });
        setMissCount(totals.current.miss);
        setFeedback(`× ミス：「${ch}」ではありません。${guideChar ? `次は「${guideChar.toUpperCase()}」です。` : ''}`);
        if (settings.sound) sound.miss();
        setSnap(m.snapshot());
        return;
      }
      totals.current.correct++;
      cur.correct++;
      setFeedback(null);
      if (m.done) {
        totals.current.completedQuestions++;
        cur.completed = true;
        cur.endMs = elapsedRef.current();
        cur.typed = m.typedText;
        cur.remainingGuide = '';
        attempts.current.push(cur);
        if (settings.sound) sound.complete();
        // 問題数制：最後の問題を完成したら、次の問題を取り出す前に終わります
        if (targetCount !== null && totals.current.completedQuestions >= targetCount) {
          finishedRef.current = true;
          goalRef.current();
          return;
        }
        // 待ち時間なしで、すぐ次の問題へ（達成状況は上部の「完成 ○問」で伝えます）
        const next = deck.next();
        matcher.current = new RomajiMatcher(next.reading, style);
        current.current = newAttempt(cur.seq + 1, next, matcher.current, elapsedRef.current());
        setQuestion(next);
        setSeq((n) => n + 1);
        setAnnounce(`${totals.current.completedQuestions}問完成。次の問題：${next.text}`);
      }
      setSnap(matcher.current.snapshot());
    },
    [deck, settings.sound, style, targetCount],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 日本語入力がオンのとき（ミスには数えません）
      if (e.isComposing || e.key === 'Process' || e.keyCode === 229) {
        if (!touch) setImeWarning(true);
        return;
      }
      if (!isTypingKey(e)) {
        if (e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'BUTTON') e.preventDefault();
        return;
      }
      if ((e.target as HTMLElement)?.closest?.('.modal')) return;
      e.preventDefault();
      if (touch) {
        // 画面タップの練習では、実物のキーボードの入力は使いません（記録を分けるため）
        setTouchNote(true);
        return;
      }
      setImeWarning(false);
      feed(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feed, touch]);

  const nextKey = snap.done ? null : (snap.remaining[0] ?? null);
  const target = nextKey ? keyForChar(nextKey) : null;
  const keyLabel = nextKey === null ? '' : nextKey === '-' ? 'ー（-）' : nextKey.toUpperCase();
  const showKeyboard = settings.keyboardGuide || touch;

  return (
    <>
      <div className="practice-stats">
        <span className="stat">
          完成 <b>{totals.current.completedQuestions}</b>
          {targetCount !== null ? `／${targetCount}` : ''} 問
        </span>
        <span className="stat">
          正しく打ったキー <b>{totals.current.correct}</b> 回
        </span>
        <span className="stat">
          ミス <b>{missCount}</b> 回
        </span>
      </div>
      <section className="problem problem-romaji" aria-label="問題" key={seq} data-seq={seq}>
        <div className="problem-kana" aria-label={`読み ${question.reading}`}>
          {snap.units.map((u, i) => (
            <span key={i} className={`kana-unit ${i < snap.index ? 'kana-done' : ''} ${snap.missAt[i] ? 'kana-miss' : ''}`}>
              {u.kana}
              {snap.missAt[i] && (
                <span className="miss-mark" aria-label="ミスした場所">
                  ×
                </span>
              )}
            </span>
          ))}
        </div>
        <div className="problem-text" lang="ja">
          {question.text}
        </div>
        {settings.romajiGuide ? (
          <div className="romaji-line" aria-label={`ローマ字ガイド：入力済み ${snap.typed}、次に ${nextKey ?? ''}`}>
            <span className="romaji-typed">{snap.typed}</span>
            {!snap.done && nextKey !== null && (
              <>
                <span className="romaji-next">{nextKey}</span>
                <span className="romaji-rest">{snap.remaining.slice(1)}</span>
              </>
            )}
          </div>
        ) : (
          <div className="romaji-line romaji-line-off">
            <span className="romaji-typed" aria-label="入力済み">
              {snap.typed}
            </span>
            <span className="guide-off-note">（ローマ字ガイドは OFF です）</span>
          </div>
        )}
        <div className="feedback feedback-ng" aria-live="polite">
          {feedback}
        </div>
        {imeWarning && (
          <p className="msg msg-warn" role="alert">
            日本語入力がオンになっているようです。キーボードの「半角/全角」キーを押して、英字の入力にしてください。（ミスには数えていません）
          </p>
        )}
        {touchNote && <p className="msg msg-info">この練習は「画面のキーをタップ」です。画面のキーを押してください。</p>}
      </section>
      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>

      {(showKeyboard || settings.fingerGuide) && (
        <div className="guides">
          {showKeyboard && (
            <div className="guide-keyboard">
              <Keyboard
                target={settings.keyboardGuide ? target : null}
                targetChar={settings.keyboardGuide ? nextKey : null}
                colored={settings.fingerGuide || settings.keyboardGuide}
                onType={touch ? feed : undefined}
                compact={touch && compact}
              />
              {!compact && <div className="kb-legend">F と J のキーには小さな出っぱり（─）があります。ここに人さし指を置きます。</div>}
            </div>
          )}
          {settings.fingerGuide && <Hands target={target} keyLabel={keyLabel} />}
        </div>
      )}
    </>
  );
}
