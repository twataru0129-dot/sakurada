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
  const [feedback, setFeedback] = useState<string | null>(null);
  /** 何問目か（問題が変わったら表示を作り直し、前の問題の強調などを残さないため） */
  const [seq, setSeq] = useState(0);
  /** 読み上げ用の通知（画面には表示しません） */
  const [announce, setAnnounce] = useState('');
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
        setFeedback(`× ミス：「${ch}」ではありません。${expected ? `次は「${expected.toUpperCase()}」です。` : ''}`);
        if (settings.sound) sound.miss();
        setSnap(matcher.current.snapshot());
        return;
      }
      totals.current.correct++;
      setFeedback(null);
      if (matcher.current.done) {
        totals.current.completedQuestions++;
        if (settings.sound) sound.complete();
        // 待ち時間なしで、すぐ次の問題へ（達成状況は上部の「完成 ○問」で伝えます）
        const next = deck.next();
        matcher.current = new RomajiMatcher(next.reading);
        setQuestion(next);
        setSeq((n) => n + 1);
        setAnnounce(`${totals.current.completedQuestions}問完成。次の問題：${next.text}`);
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
  const keyLabel = nextKey === null ? '' : nextKey === '-' ? 'ー（-）' : nextKey.toUpperCase();
  const showKeyboard = settings.keyboardGuide || touch;

  return (
    <>
      <div className="practice-stats">
        <span className="stat">
          完成 <b>{totals.current.completedQuestions}</b> 問
        </span>
        <span className="stat">
          正しく打ったキー <b>{totals.current.correct}</b> 回
        </span>
        <span className="stat">
          ミス <b>{missCount}</b> 回
        </span>
      </div>
      <section className="problem problem-romaji" aria-label="問題" key={seq} data-seq={seq}>
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
        {settings.romajiGuide ? (
          <div className="romaji-line" aria-label={`ローマ字ガイド：入力済み ${snap.typed}、次に ${nextKey ?? ''}`}>
            <span className="romaji-typed">{snap.typed}</span>
            {!snap.done && nextKey !== null && (
              <>
                <span className={`romaji-next ${target ? `f-${target.key.finger}` : ''}`}>{nextKey}</span>
                <span className="romaji-rest">{snap.remaining.slice(1)}</span>
              </>
            )}
          </div>
        ) : (
          <div className="romaji-line romaji-line-off">
            <span className="romaji-typed" aria-label="入力済み">{snap.typed}</span>
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
