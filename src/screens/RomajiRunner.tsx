import { useCallback, useEffect, useRef, useState } from 'react';
import { keyForChar } from '../core/keyboardLayout';
import { RomajiMatcher, type RomajiSnapshot } from '../core/romaji';
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

function useCompact(): boolean {
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

export function RomajiRunner({ deck, config, isActive, registerTotals }: RunnerProps) {
  const { settings } = useApp();
  const activeRef = useRef(isActive);
  activeRef.current = isActive;
  const [question, setQuestion] = useState<Question>(() => deck.next());
  const matcher = useRef(new RomajiMatcher(question.reading));
  const [snap, setSnap] = useState<RomajiSnapshot>(() => matcher.current.snapshot());
  const totals = useRef({ correct: 0, miss: 0, completedQuestions: 0 });
  const [missCount, setMissCount] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [imeWarning, setImeWarning] = useState(false);
  const [touchNote, setTouchNote] = useState(false);
  const compact = useCompact();
  const touch = config.inputMethod === 'touch';

  useEffect(() => {
    registerTotals(() => ({ ...totals.current }));
  }, [registerTotals]);

  const feed = useCallback(
    (ch: string) => {
      if (!activeRef.current()) return;
      const expected = matcher.current.nextKey();
      const r = matcher.current.input(ch);
      if (r === 'ignored') return;
      if (r === 'miss') {
        totals.current.miss++;
        setMissCount(totals.current.miss);
        setFeedback({ ok: false, text: `× ミス：「${ch}」ではありません。${expected ? `次は「${expected.toUpperCase()}」です。` : ''}` });
        if (settings.sound) sound.miss();
        setSnap(matcher.current.snapshot());
        return;
      }
      totals.current.correct++;
      setFeedback(null);
      if (matcher.current.done) {
        totals.current.completedQuestions++;
        if (settings.sound) sound.complete();
        const next = deck.next();
        matcher.current = new RomajiMatcher(next.reading);
        setQuestion(next);
        setFeedback({ ok: true, text: '○ できました！' });
      }
      setSnap(matcher.current.snapshot());
    },
    [deck, settings.sound],
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

  return (
    <>
      <div className="practice-bar" style={{ gap: 24 }}>
        <span className="stat">
          完成 <b>{totals.current.completedQuestions}</b> 問
        </span>
        <span className="stat">
          正しく打った数 <b>{totals.current.correct}</b>
        </span>
        <span className="stat">
          ミス <b>{missCount}</b>
        </span>
      </div>
      <section className="problem" aria-label="問題">
        <div className="problem-text" lang="ja">
          {question.text}
        </div>
        <div className="problem-kana" aria-label={`読み ${question.reading}`}>
          {snap.units.map((u, i) => (
            <span
              key={i}
              className={`kana-unit ${i < snap.index ? 'kana-done' : ''} ${i === snap.index ? 'kana-current' : ''} ${snap.missAt[i] ? 'kana-miss' : ''}`}
            >
              {u.kana}
              {snap.missAt[i] && <span className="miss-mark" aria-label="ミスした場所">×</span>}
            </span>
          ))}
        </div>
        <div className="romaji-line" aria-label="ローマ字">
          <span className="romaji-typed">{snap.typed}</span>
          {settings.romajiGuide && !snap.done && (
            <>
              <span className="romaji-next">{snap.remaining[0]}</span>
              <span className="romaji-rest">{snap.remaining.slice(1)}</span>
            </>
          )}
          {!settings.romajiGuide && <span className="romaji-next">&nbsp;</span>}
        </div>
        <div className={`feedback ${feedback?.ok ? 'feedback-ok' : 'feedback-ng'}`} role="status" aria-live="polite">
          {feedback?.text}
        </div>
        {imeWarning && (
          <p className="msg msg-warn" role="alert">
            日本語入力がオンになっているようです。キーボードの「半角/全角」キーを押して、英字の入力にしてください。（ミスには数えていません）
          </p>
        )}
        {touchNote && <p className="msg msg-info">この練習は「画面のキーをタップ」です。画面のキーを押してください。</p>}
      </section>

      {(settings.keyboardGuide || settings.fingerGuide || touch) && (
        <div className="guides">
          {(settings.keyboardGuide || touch) && (
            <div>
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
          {settings.fingerGuide && <Hands target={target} />}
        </div>
      )}
    </>
  );
}
