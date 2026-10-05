import { useEffect, useRef, useState, type CompositionEvent, type FormEvent, type KeyboardEvent } from 'react';
import { ImeInputController } from '../core/imeInput';
import { keyForSentenceChar } from '../core/keyboardLayout';
import { countTargetChars, SentenceJudge, splitChars, type SentenceEvaluation } from '../core/sentence';
import type { Question } from '../core/questions';
import { useApp } from '../state/AppContext';
import { sound } from '../sound';
import { Hands } from '../ui/Hands';
import { Keyboard } from '../ui/Keyboard';
import type { RunnerProps } from './Practice';

/** カーソル位置（UTF-16 の位置）を文字数に直します */
function caretInChars(el: HTMLTextAreaElement): number {
  return [...el.value.slice(0, el.selectionStart ?? el.value.length)].length;
}

export function SentenceRunner({ deck, config, isActive, registerTotals }: RunnerProps) {
  const { settings } = useApp();
  const activeRef = useRef(isActive);
  activeRef.current = isActive;
  const [question, setQuestion] = useState<Question>(() => deck.next());
  const judge = useRef(new SentenceJudge(question.text));
  const ctl = useRef(new ImeInputController(judge.current));
  const [ev, setEv] = useState<SentenceEvaluation>(judge.current.current);
  const [committed, setCommitted] = useState('');
  const totals = useRef({ completedChars: 0, miss: 0, completedQuestions: 0 });
  const [missCount, setMissCount] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // 時間切れのときは、確定済みで正しい途中入力だけを数えます（変換中の文字は含めません）
    registerTotals(() => ({
      correct: totals.current.completedChars + judge.current.current.correctChars,
      miss: totals.current.miss,
      completedQuestions: totals.current.completedQuestions,
    }));
  }, [registerTotals]);

  useEffect(() => {
    area.current?.focus();
  }, []);

  useEffect(() => {
    cursorRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [ev, question]);

  const apply = (e: SentenceEvaluation | null) => {
    if (!e) return;
    if (e.newMisses > 0) {
      totals.current.miss += e.newMisses;
      setMissCount(totals.current.miss);
      if (settings.sound) sound.miss();
    }
    if (e.complete) {
      totals.current.completedChars += judge.current.target.filter((c) => c !== '\n').length;
      totals.current.completedQuestions++;
      if (settings.sound) sound.complete();
      const next = deck.next();
      judge.current = new SentenceJudge(next.text);
      ctl.current.setJudge(judge.current);
      if (area.current) area.current.value = '';
      setCommitted('');
      setQuestion(next);
      setEv(judge.current.current);
      setMessage({ ok: true, text: '○ できました！ 次の問題です。' });
      return;
    }
    setCommitted(area.current?.value ?? '');
    setEv(e);
    if (e.errorIndexes.length > 0 || e.omissionBefore.length > 0) {
      setMessage({
        ok: false,
        text:
          e.errorIndexes.length > 0
            ? '× 赤い文字が見本とちがいます。Backspace などで消して、直してください。'
            : '× ▲ のところに文字が抜けています。',
      });
    } else {
      setMessage(null);
    }
  };

  // 時間切れの後の入力は採点に渡しません（入力のたびに確認します）
  const onCompositionStart = () => ctl.current.compositionStart();
  const onCompositionEnd = (e: CompositionEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (!activeRef.current()) return;
    apply(ctl.current.compositionEnd(el.value));
    // 端末によっては確定後に input イベントが続きます（同じ値なら二重に数えません）
    window.setTimeout(() => {
      if (area.current && activeRef.current()) apply(ctl.current.input(area.current.value, false));
    }, 0);
  };
  const onInput = (e: FormEvent<HTMLTextAreaElement>) => {
    if (!activeRef.current()) return;
    const native = e.nativeEvent as InputEvent;
    apply(ctl.current.input(e.currentTarget.value, native.isComposing ?? false));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeRef.current()) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      const decision = ctl.current.enterKey(e.nativeEvent.isComposing, e.keyCode, caretInChars(e.currentTarget));
      if (decision === 'block') e.preventDefault();
    }
  };

  const target = splitChars(question.text);
  const ok = ev.errorIndexes.length === 0 && ev.omissionBefore.length === 0;
  const pos = ev.correctPrefix;
  const nextChar = ok ? (target[pos] ?? null) : null;
  const keyTarget = config.inputMethod === 'keyboard' ? keyForSentenceChar(nextChar) : null;
  const typedChars = splitChars(committed);
  const errorSet = new Set(ev.errorIndexes);
  const omitSet = new Set(ev.omissionBefore);
  const showGuides = config.inputMethod === 'keyboard' && (settings.keyboardGuide || settings.fingerGuide);

  return (
    <>
      <div className="practice-bar" style={{ gap: 24 }}>
        <span className="stat">
          完成 <b>{totals.current.completedQuestions}</b> 問
        </span>
        <span className="stat">
          この問題 <b>{ev.correctChars}</b> / {countTargetChars(question.text)} 文字
        </span>
        <span className="stat">
          ミス <b>{missCount}</b> 文字
        </span>
      </div>
      <section className="problem" aria-label="見本">
        <div className="model-box" lang="ja">
          {target.map((ch, i) => {
            const cls = i < pos && ok ? 'model-done' : i === pos ? 'model-cursor' : '';
            return (
              <span key={i} className={cls} ref={i === pos ? cursorRef : undefined}>
                {ch === '\n' ? <span className="model-nl">↵{'\n'}</span> : ch}
              </span>
            );
          })}
          {pos >= target.length && <span ref={cursorRef} />}
        </div>
        {settings.romajiGuide && question.reading && <div className="reading-hint">読み：{question.reading}</div>}
      </section>

      <label htmlFor="sentence-input" className="sr-only">
        ここに見本の文章を入力します
      </label>
      <textarea
        id="sentence-input"
        ref={area}
        className="sentence-input"
        lang="ja"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="ここに入力します（変換して確定すると判定します）"
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      />
      <div className="judge-line" aria-label="確定した文字の判定">
        {typedChars.length === 0 && <span className="hint">確定した文字がここに表示されます。</span>}
        {typedChars.map((ch, i) => (
          <span key={i}>
            {omitSet.has(i) && <span className="ch-omit" aria-label="抜けている文字">▲</span>}
            <span className={errorSet.has(i) ? 'ch-ng' : undefined}>{ch === '\n' ? '↵\n' : ch}</span>
          </span>
        ))}
      </div>
      <div className={`feedback ${message?.ok ? 'feedback-ok' : 'feedback-ng'}`} role="status" aria-live="polite">
        {message?.text}
      </div>
      <p className="hint">
        変換中の文字は判定しません。確定したときに見本と比べます。{target.includes('\n') && '見本の「↵」のところで Enter を押して改行します。'}
      </p>

      {showGuides && (
        <div className="guides">
          {settings.keyboardGuide && <Keyboard target={keyTarget} colored={settings.fingerGuide} />}
          {settings.fingerGuide && <Hands target={keyTarget} />}
        </div>
      )}
      {showGuides && !keyTarget && <p className="hint" style={{ textAlign: 'center' }}>漢字やかなは変換のしかたによって押すキーが変わるため、キーの案内はしません。</p>}
    </>
  );
}
