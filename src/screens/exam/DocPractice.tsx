import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { checkParagraph, composeDocument, countDocChars, expectedParagraph, firstEmptyParagraph, formatElapsed, hasContent, MAX_PARAGRAPH_INPUT_CHARS, paragraphFinished, sampleParagraphs, type ParagraphCheck, type ParagraphInput } from '../../core/document';
import { docSampleOf } from '../../core/documentProblem';
import { buildDocOutcome, type DocStatus } from '../../core/documentResult';
import { newResultId } from '../../core/result';
import { useApp } from '../../state/AppContext';
import { navigate } from '../../state/router';
import { CheckedText } from '../../ui/doc/CheckedText';
import { DocPaper } from '../../ui/doc/DocPaper';

type Phase = 'ready' | 'running' | 'full' | 'confirmDone' | 'confirmQuit';

const FONT_STEPS = [1, 1.15, 1.3, 1.5, 1.75];
/** 段落の下に文章で書き出す指摘の数の上限（多いときは、波線と印で見てもらいます） */
const MAX_NOTES = 6;
/** 変換の確定（compositionend）の直後に来る Enter を、改行の操作として二重に扱わないための間隔 */
const AFTER_COMPOSE_MS = 60;

/** チェックしたときの段落の内容（そのあと直したら、その段落のチェックの表示を外します） */
interface CheckSnap {
  text: string;
  endBreak: boolean;
  result: ParagraphCheck;
}

/**
 * 文書作成モードの練習画面（v2.0.0）。
 * 中央の A4 縦の用紙に、段落ごとに「段落の番号 → 見本の文章 → その下に自分の入力欄」を縦に並べます。
 *
 * 入力について
 * - 入力欄は textarea で、日本語入力（IME）の変換・確定・削除・カーソル移動・範囲選択・元に戻すはブラウザのままです。
 *   入力中に文字を消したり、正しい文字に置き換えたりはしません。間違っていても次へ進めます。
 * - 段落の終わり（カーソルが本文の終わり）で、変換中ではない Enter を押すと、本人の改行として記録し、次の段落の入力欄へ移ります。
 *   変換の確定の Enter（変換中・確定の直後）では改行も移動もしません。文の途中の Enter は、その位置に改行を入れます（移りません）。
 *   押しっぱなしの Enter・空の段落での Enter では先へ進みません。最後の段落の終わりの改行は必須ではありません。
 * - 段落の先頭の Backspace は、前の段落の終わりの改行（記録したもの）を消して前の段落へ戻ります（文字は消しません・復活しません）。
 *   段落の終わりの Delete は、記録した改行を消します。
 * - 変換中（未確定）の文字は、入力済みにも、チェックにも数えません。
 */
export function DocPractice() {
  const { docSession } = useApp();
  const sample = docSession ? docSampleOf(docSession.problem) : null;
  if (!docSession || sample === null) {
    return (
      <main>
        <p>{docSession ? 'この問題は見本の文章が確認されていないため、使えません。' : '練習の設定がありません。'}</p>
        <button type="button" className="btn" onClick={() => navigate('/exam')}>
          問題をえらぶ
        </button>
      </main>
    );
  }
  return <DocRunner key={`${docSession.problem.id}:${docSession.problem.revision}`} sample={sample} />;
}

function DocRunner({ sample }: { sample: string }) {
  const { docSession, recordDocument } = useApp();
  const { problem, preview } = docSession!;
  const paras = useMemo(() => sampleParagraphs(sample), [sample]);
  const [phase, setPhase] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  phaseRef.current = phase;
  const inputs = useRef<ParagraphInput[]>(paras.map(() => ({ text: '', endBreak: false })));
  const composing = useRef<boolean[]>(paras.map(() => false));
  const lastComposeEnd = useRef(0);
  const areas = useRef<Array<HTMLTextAreaElement | null>>([]);
  const blocks = useRef<Array<HTMLElement | null>>([]);
  const [, setVer] = useState(0);
  const bump = () => setVer((n) => n + 1);
  const [checks, setChecks] = useState<Array<CheckSnap | null>>(() => paras.map(() => null));
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: 'info' | 'warn' | 'ok'; text: string } | null>(null);
  const [hint, setHint] = useState<{ index: number; text: string } | null>(null);
  const [fontIdx, setFontIdx] = useState(1);
  const startedAt = useRef<Date>(new Date());
  const startMs = useRef(0);
  const [now, setNow] = useState(0);
  const finished = useRef(false);
  const resultId = useRef(newResultId());
  const fontScale = FONT_STEPS[fontIdx] ?? 1.15;

  // 経過時間：開始した時刻からの実際の時間（別のタブに移っている間・全文の確認中も進みます）
  useEffect(() => {
    if (phase === 'ready') return;
    const tick = () => setNow(Date.now() - startMs.current);
    tick();
    const t = window.setInterval(tick, 500);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [phase]);

  const start = () => {
    if (startMs.current) return;
    startedAt.current = new Date();
    startMs.current = Date.now();
    setPhase('running');
    pendingFocus.current = { index: 0, at: 'start' };
  };

  const finish = useCallback(
    (status: DocStatus) => {
      if (finished.current || !startMs.current) return;
      finished.current = true;
      const elapsed = Date.now() - startMs.current;
      recordDocument(
        buildDocOutcome({
          id: resultId.current,
          startedAt: startedAt.current,
          finishedAt: new Date(),
          problem,
          sample,
          inputs: inputs.current.map((p) => ({ ...p })),
          elapsedMs: elapsed,
          status,
          preview,
        }),
      );
      navigate('/exam/result');
    },
    [problem, sample, preview, recordDocument],
  );
  // 練習中に画面を離れたとき（ブラウザの戻るなど）は、その時点の本文で「途中で終了」として記録します
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(
    () => () => {
      if (startMs.current && !finished.current) finishRef.current('quit');
    },
    [],
  );

  // 入力欄の高さを内容に合わせます（欄の中ではスクロールせず、用紙ごとスクロールします）
  const grow = (i: number) => {
    const el = areas.current[i];
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(() => {
    paras.forEach((_, i) => grow(i));
  }, [fontIdx, paras]);
  useEffect(() => {
    const onResize = () => paras.forEach((_, i) => grow(i));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [paras]);

  const setText = (i: number, text: string) => {
    inputs.current[i] = { ...inputs.current[i]!, text };
    if (hint?.index === i && hasContent(text)) setHint(null);
    bump();
  };
  const setBreak = (i: number, endBreak: boolean) => {
    inputs.current[i] = { ...inputs.current[i]!, endBreak };
    bump();
  };

  /** 段落の入力欄へ移ります（at：'start' 先頭、'end' 終わり）。段落の見本と入力欄が見えるように用紙をスクロールします */
  const focusPara = (i: number, at: 'start' | 'end') => {
    const el = areas.current[i];
    if (!el) return;
    el.focus({ preventScroll: true });
    const pos = at === 'start' ? 0 : el.value.length;
    el.setSelectionRange(pos, pos);
    blocks.current[i]?.scrollIntoView({ block: 'nearest' });
  };

  // 画面を描き直したあと（入力欄が入力できる状態になってから）に移す先
  const pendingFocus = useRef<{ index: number; at: 'start' | 'end' } | null>(null);
  useEffect(() => {
    const f = pendingFocus.current;
    if (!f || phaseRef.current !== 'running') return;
    pendingFocus.current = null;
    focusPara(f.index, f.at);
  });

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent;
    // 変換中のキー（変換・候補の選択・確定）は、すべてブラウザと IME に任せます
    if (native.isComposing || e.keyCode === 229 || composing.current[i]) return;
    const el = e.currentTarget;
    const collapsed = el.selectionStart === el.selectionEnd;
    const atEnd = collapsed && el.selectionEnd === el.value.length;
    const atStart = collapsed && el.selectionStart === 0;
    const plain = !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
    if (e.key === 'Enter' && plain) {
      // 確定の直後の Enter（ブラウザによっては変換中の印が付きません）は、改行として扱いません
      if (performance.now() - lastComposeEnd.current < AFTER_COMPOSE_MS) {
        e.preventDefault();
        return;
      }
      if (!atEnd) return; // 文の途中：その位置に改行（ブラウザのまま）。次の段落へは移りません
      e.preventDefault();
      if (e.repeat) return; // 押しっぱなしでは先へ進みません
      if (!hasContent(el.value)) {
        setHint({ index: i, text: 'この段落の文章を入力してから、段落の終わりで Enter を押しましょう。' });
        return;
      }
      if (!inputs.current[i]!.endBreak) setBreak(i, true);
      if (i + 1 < paras.length) focusPara(i + 1, 'start');
      else setHint({ index: i, text: '最後の段落です。「全文を確認」で、文書全体を見直せます。' });
      return;
    }
    if (e.key === 'Backspace' && plain && atStart && i > 0) {
      e.preventDefault();
      // 前の段落の終わりの改行（本人が記録したもの）を消して、前の段落の終わりへ
      if (inputs.current[i - 1]!.endBreak) setBreak(i - 1, false);
      focusPara(i - 1, 'end');
      return;
    }
    if (e.key === 'Delete' && plain && atEnd && inputs.current[i]!.endBreak) {
      e.preventDefault();
      setBreak(i, false);
      return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && plain && atStart && i > 0) {
      e.preventDefault();
      focusPara(i - 1, 'end');
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && plain && atEnd && i + 1 < paras.length) {
      e.preventDefault();
      focusPara(i + 1, 'start');
    }
  };

  const anyComposing = () => composing.current.some(Boolean);

  const runCheck = () => {
    if (anyComposing()) {
      setMsg({ kind: 'warn', text: '変換中の文字があります。Enter で確定してから、もう一度「チェック」を押してください。' });
      return;
    }
    const next = paras.map((_, i) => {
      const input = inputs.current[i]!;
      if (!hasContent(input.text) && !input.endBreak) return null;
      return { text: input.text, endBreak: input.endBreak, result: checkParagraph(expectedParagraph(paras, i), input, paragraphFinished(inputs.current, i)) };
    });
    setChecks(next);
    setCheckedAt(Date.now());
    const text = next.reduce((n, c) => n + (c ? c.result.wrong + c.result.extra + c.result.missing : 0), 0);
    const ws = next.reduce((n, c) => n + (c ? c.result.space + c.result.breaks : 0), 0);
    setMsg(
      text + ws === 0
        ? { kind: 'ok', text: 'チェックしました。入力したところに、見本と違うところは見つかりませんでした。' }
        : { kind: 'info', text: `チェックしました。文字の違い ${text}か所、空白・改行の違い ${ws}か所を、赤い波線と印で示しています。直したら、もう一度チェックできます。` },
    );
  };

  const tryDone = () => {
    if (anyComposing()) {
      setMsg({ kind: 'warn', text: '変換中の文字があります。Enter で確定してから、もう一度「完成！」を押してください（確定していない文字は捨てません）。' });
      return;
    }
    const empty = firstEmptyParagraph(inputs.current);
    if (empty !== null) {
      setPhase('running');
      setMsg({ kind: 'warn', text: `段落 ${empty + 1} がまだ空です。すべての段落に入力すると完成できます。` });
      setHint({ index: empty, text: 'この段落がまだ空です。' });
      pendingFocus.current = { index: empty, at: 'start' };
      bump();
      return;
    }
    setPhase('confirmDone');
  };

  const elapsedText = formatElapsed(now);
  const typedChars = countDocChars(composeDocument(inputs.current));

  return (
    <main className="doc-main" style={{ ['--doc-font' as string]: `${fontScale}rem` }}>
      <div className="doc-bar" role="region" aria-label="練習の状態と操作">
        <span className="doc-bar-title" data-testid="doc-title">
          {problem.title}
          {preview && <span className="badge badge-ref">プレビュー（記録しません）</span>}
        </span>
        <span className="timer" aria-label={`経過時間 ${elapsedText}`} data-testid="doc-timer">
          経過 {elapsedText}
        </span>
        <span className="hint doc-bar-count" data-testid="doc-count">
          入力 {typedChars}文字
        </span>
        <span className="font-tools" role="group" aria-label="文字の大きさ">
          <button type="button" className="btn btn-small" onClick={() => setFontIdx((i) => Math.max(0, i - 1))} disabled={fontIdx === 0} aria-label="文字を小さく">
            A−
          </button>
          <button type="button" className="btn btn-small" onClick={() => setFontIdx((i) => Math.min(FONT_STEPS.length - 1, i + 1))} disabled={fontIdx === FONT_STEPS.length - 1} aria-label="文字を大きく">
            A＋
          </button>
        </span>
        <span className="doc-bar-actions">
          <button type="button" className="btn" onClick={runCheck} disabled={phase === 'ready'} data-testid="doc-check">
            チェック
          </button>
          <button type="button" className="btn" onClick={() => setPhase('full')} disabled={phase === 'ready'} data-testid="doc-full">
            全文を確認
          </button>
          <button type="button" className="btn btn-primary" onClick={tryDone} disabled={phase === 'ready'} data-testid="doc-done">
            完成！
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setPhase('confirmQuit')} disabled={phase === 'ready'} data-testid="doc-quit">
            途中でやめる
          </button>
        </span>
      </div>

      {msg && (
        <p className={`msg ${msg.kind === 'warn' ? 'msg-ng' : msg.kind === 'ok' ? 'msg-ok' : 'msg-info'} doc-msg`} role="status" data-testid="doc-msg">
          {msg.text}
        </p>
      )}

      <div className="doc-sheet" data-testid="doc-sheet">
        <h1 className="doc-sheet-title">{problem.title}</h1>
        <p className="hint doc-sheet-hint">
          見本を見ながら、下の欄に入力します。段落の終わり（<span className="doc-break-mark">↵ 改行</span>）では Enter を押して改行すると、次の段落へ進みます。画面の幅で折り返されたところは、改行しなくてかまいません。
        </p>
        {paras.map((para, i) => {
          const input = inputs.current[i]!;
          const snap = checks[i];
          const fresh = snap && snap.text === input.text && snap.endBreak === input.endBreak ? snap : null;
          const stale = !!snap && !fresh;
          const notes = fresh?.result.marks ?? [];
          return (
            <section
              key={i}
              className="doc-para"
              ref={(el) => {
                blocks.current[i] = el;
              }}
              aria-labelledby={`doc-para-${i}`}
              data-testid="doc-para"
            >
              <h2 className="doc-para-no" id={`doc-para-${i}`}>
                段落 {i + 1}
                <span className="hint">（{paras.length}段落中）</span>
              </h2>
              <p className="doc-sample" lang="ja" data-testid="doc-sample">
                {para}
                {i < paras.length - 1 && (
                  <span className="doc-break-mark" aria-label="ここで改行">
                    ↵ 改行
                  </span>
                )}
              </p>
              <div className={`doc-input-wrap ${fresh && notes.length ? 'has-marks' : ''}`}>
                <textarea
                  ref={(el) => {
                    areas.current[i] = el;
                  }}
                  className="doc-input"
                  data-testid="doc-input"
                  aria-label={`段落 ${i + 1} の入力欄`}
                  lang="ja"
                  rows={2}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  autoComplete="off"
                  maxLength={MAX_PARAGRAPH_INPUT_CHARS}
                  readOnly={phase === 'ready'}
                  placeholder={phase === 'ready' ? 'スタートすると入力できます' : i === 0 ? 'ここに入力します' : ''}
                  onPaste={(e) => e.preventDefault()}
                  onDrop={(e) => e.preventDefault()}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onCompositionStart={() => {
                    composing.current[i] = true;
                  }}
                  onCompositionEnd={(e) => {
                    composing.current[i] = false;
                    lastComposeEnd.current = performance.now();
                    setText(i, e.currentTarget.value);
                    grow(i);
                  }}
                  onInput={(e) => {
                    grow(i);
                    const native = e.nativeEvent as InputEvent;
                    // 変換中の文字は、入力済みの本文に入れません
                    if (composing.current[i] || native.isComposing) return;
                    setText(i, e.currentTarget.value);
                  }}
                  onFocus={() => blocks.current[i]?.classList.add('is-current')}
                  onBlur={() => blocks.current[i]?.classList.remove('is-current')}
                />
                {fresh && notes.length > 0 && (
                  <div className="doc-mirror" aria-hidden="true" data-testid="doc-mirror">
                    <CheckedText text={input.text} marks={notes} mode="mirror" />
                  </div>
                )}
              </div>
              <div className="doc-para-foot">
                {input.endBreak && (
                  <span className="doc-break-done" data-testid="doc-break-done" title="段落の終わりで改行しました">
                    ↵ 改行しました
                  </span>
                )}
                {fresh && notes.length === 0 && <span className="doc-check-ok">✓ 見本と同じです{fresh.result.full ? '' : '（入力したところまで）'}</span>}
                {fresh && notes.length > 0 && (
                  <ul className="doc-notes" data-testid="doc-notes">
                    {notes.slice(0, MAX_NOTES).map((m, k) => (
                      <li key={k} className={`doc-note doc-mk-${m.kind}`}>
                        {m.note}
                      </li>
                    ))}
                    {notes.length > MAX_NOTES && <li className="doc-note doc-note-more">ほかに {notes.length - MAX_NOTES}か所（赤い波線と印のところ）</li>}
                  </ul>
                )}
                {stale && (
                  <span className="hint doc-stale" data-testid="doc-stale">
                    直したところがあります。もう一度「チェック」を押すと確かめられます。
                  </span>
                )}
                {hint?.index === i && (
                  <span className="msg msg-info doc-hint" role="status" data-testid="doc-hint">
                    {hint.text}
                  </span>
                )}
              </div>
            </section>
          );
        })}
        {checkedAt && <p className="hint">最後にチェックした時刻：{new Date(checkedAt).toLocaleTimeString('ja-JP')}</p>}
      </div>

      {phase === 'ready' && (
        <div className="exam-ready doc-ready" role="dialog" aria-modal="false" aria-labelledby="doc-ready-title">
          <h2 id="doc-ready-title">準備ができたら「スタート」</h2>
          <ul>
            <li>見本の文章を見ながら、段落ごとに日本語を入力して、一つの文書を完成させます。制限時間はありません。</li>
            <li>日本語入力（IME）をオンにして、自分で漢字に変換します。間違えても先へ進めます。前の段落に戻って直すこともできます。</li>
            <li>段落の終わりでは Enter を押して改行します。「チェック」で、見本と違うところを赤い波線で確かめられます。</li>
            <li>スタートから「完成！」を押すまでの時間を測ります。</li>
            {preview && <li>先生のプレビューです。記録は保存しません。</li>}
          </ul>
          <button type="button" className="btn btn-primary btn-large" onClick={start} data-testid="doc-go">
            スタート
          </button>
        </div>
      )}

      {phase === 'full' && (
        <div className="doc-full" role="dialog" aria-modal="true" aria-labelledby="doc-full-title" data-testid="doc-full-view">
          <div className="doc-full-bar">
            <h2 id="doc-full-title">全文を確認</h2>
            <span className="timer">経過 {elapsedText}</span>
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => setPhase('running')} autoFocus data-testid="doc-full-back">
              入力にもどる
            </button>
            <button type="button" className="btn btn-primary" onClick={tryDone} data-testid="doc-full-done">
              完成！
            </button>
          </div>
          <p className="hint">自分が入力した文章を、一つの文書としてつなげて表示しています（見本は入れていません）。直すときは「入力にもどる」を押します。時間は止まりません。</p>
          <DocPaper title={problem.title} text={composeDocument(inputs.current)} testId="doc-full-paper" />
        </div>
      )}

      {phase === 'confirmDone' && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="doc-done-title">
          <div className="modal">
            <h2 id="doc-done-title">文書を完成にしますか？</h2>
            <p>完成すると時間が止まり、入力した文書を印刷したり、Word で保存したりできます。完成したあとは直せません。</p>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => finish('completed')} data-testid="doc-done-confirm">
                完成！
              </button>
              <button type="button" className="btn btn-quiet" autoFocus onClick={() => setPhase('running')}>
                もう少し直す
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'confirmQuit' && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="doc-quit-title">
          <div className="modal">
            <h2 id="doc-quit-title">途中でやめますか？</h2>
            <p>ここまでの記録を「途中で終了」として残します。入力した文書は、次の画面で印刷・保存できます。</p>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => finish('quit')} data-testid="doc-quit-confirm">
                やめる
              </button>
              <button type="button" className="btn btn-primary" autoFocus onClick={() => setPhase('running')}>
                続ける
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
