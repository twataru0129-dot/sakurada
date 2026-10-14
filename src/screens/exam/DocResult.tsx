import { useState } from 'react';
import { docxFileName, formatElapsed, sampleParagraphs } from '../../core/document';
import { buildDocx, DOCX_MIME } from '../../core/docx';
import { useApp } from '../../state/AppContext';
import { navigate } from '../../state/router';
import { CheckedText } from '../../ui/doc/CheckedText';
import { DocPaper } from '../../ui/doc/DocPaper';

/**
 * 文書作成モードの完成画面（v2.0.0）。
 * - 中心は、本人が入力した文書（タイトル＋全文。改行・空白はそのまま。赤い波線なし。誤字も本人の入力どおり）
 * - 「印刷する」：A4 縦で、タイトルと本人の全文だけを印刷します（ボタン・見本・印・所要時間は印刷しません）
 * - 「Word で保存する」：本物の .docx を、この端末の中で作ってダウンロードします（本文を外部へ送りません）
 * - 間違いの確認は、別の領域に切り替えて表示します（作品として眺める文書には印を付けません）
 */
export function DocResult() {
  const { currentDoc, saves, saveFailures, retryDocSave, setDocSession, account } = useApp();
  const [showCheck, setShowCheck] = useState(false);
  const [wordMsg, setWordMsg] = useState<string | null>(null);
  if (!currentDoc) {
    return (
      <main>
        <p>表示できる文書がありません。</p>
        <button type="button" className="btn" onClick={() => navigate('/exam')}>
          問題をえらぶ
        </button>
      </main>
    );
  }
  const o = currentDoc;
  const r = o.record;
  const completed = r.status === 'completed';
  const save = o.preview ? null : saves[r.id];
  const why = saveFailures[r.id];
  const paras = sampleParagraphs(o.sample);

  const saveWord = () => {
    try {
      const bytes = buildDocx(r.problemTitle, o.text);
      const blob = new Blob([bytes as BlobPart], { type: DOCX_MIME });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = docxFileName(r.problemTitle);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setWordMsg(`「${docxFileName(r.problemTitle)}」を保存しました（この端末のダウンロードの場所）。`);
    } catch {
      setWordMsg('Word のファイルを作れませんでした。もう一度押してください。');
    }
  };

  return (
    <main className="doc-result" data-testid="doc-result" data-status={r.status}>
      <div className="no-print doc-result-head">
        <h1 data-testid="doc-result-title">{completed ? '文書が完成しました' : '途中で終了しました'}</h1>
        <p className="doc-result-time">
          {completed ? '完成までの時間' : '終了までの時間'} <strong data-testid="doc-elapsed">{formatElapsed(r.elapsedMs)}</strong>
          <span className="hint">（入力 {r.inputChars}文字・{r.paragraphCount}段落）</span>
        </p>
        {o.preview ? (
          <p className="hint">先生のプレビューです。記録は保存していません。</p>
        ) : (
          <p className="hint" data-testid="doc-save-state">
            {save === 'saved'
              ? `✓ 記録を保存しました（${account?.kind === 'user' ? 'アカウント' : 'この端末'}の文書作成の記録。本文は保存していません）`
              : save === 'failed'
                ? why === 'missing_table'
                  ? '記録は未保存です：クラウドの記録の表がまだありません（データベースの更新が必要です。先生に知らせてください）。文書の印刷・Word の保存はできます。'
                  : why === 'device'
                    ? '記録は未保存です：この端末に保存できませんでした。文書の印刷・Word の保存はできます。'
                    : '記録は未保存です：通信できませんでした。文書の印刷・Word の保存はできます。'
                : save === 'saving'
                  ? '記録を保存しています…'
                  : ''}
            {save === 'failed' && (
              <button type="button" className="btn btn-small" style={{ marginLeft: 8 }} onClick={() => retryDocSave(r.id)} data-testid="doc-save-retry">
                もう一度保存する
              </button>
            )}
          </p>
        )}
        <div className="btn-row doc-result-actions">
          <button type="button" className="btn btn-primary" onClick={() => window.print()} data-testid="doc-print">
            印刷する
          </button>
          <button type="button" className="btn btn-primary" onClick={saveWord} data-testid="doc-word">
            Wordで保存する
          </button>
          <button type="button" className="btn" aria-pressed={showCheck} onClick={() => setShowCheck((v) => !v)} data-testid="doc-show-check">
            {showCheck ? '完成した文書を見る' : '見本と比べて確認する'}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setDocSession({ problem: o.problem, preview: o.preview });
              navigate('/exam/practice');
            }}
            data-testid="doc-again"
          >
            同じ問題をもう一度
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => navigate('/exam')} data-testid="doc-back">
            問題をえらぶ
          </button>
        </div>
        {wordMsg && (
          <p className="msg msg-info" role="status" data-testid="doc-word-msg">
            {wordMsg}
          </p>
        )}
      </div>

      {showCheck ? (
        <section className="panel no-print doc-review" aria-labelledby="doc-review-title" data-testid="doc-review">
          <h2 id="doc-review-title">見本と比べた確認</h2>
          <p data-testid="doc-review-summary">
            文字の違い <strong>{r.textErrors}</strong>か所（違う字 {r.wrongChars}・余分な字 {r.extraChars}・抜けた字 {r.missingChars}）／ 空白の違い <strong>{r.spaceErrors}</strong>か所 ／ 改行の違い <strong>{r.breakErrors}</strong>か所
          </p>
          <p className="hint">誤りがあっても、文書は本人が入力したとおりです（正しい文字に置き換えていません）。</p>
          {paras.map((para, i) => {
            const c = o.check.paragraphs[i];
            const input = o.inputs[i] ?? { text: '', endBreak: false };
            return (
              <div key={i} className="doc-review-para" data-testid="doc-review-para">
                <h3>段落 {i + 1}</h3>
                <p className="doc-sample">{para}</p>
                <p className="doc-review-input">
                  <CheckedText text={input.text} marks={c?.marks ?? []} mode="visible" />
                  {input.endBreak && <span className="doc-break-done">↵</span>}
                </p>
                {c && c.marks.length > 0 ? (
                  <ul className="doc-notes">
                    {c.marks.map((m, k) => (
                      <li key={k} className={`doc-note doc-mk-${m.kind}`}>
                        {m.note}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="doc-check-ok">✓ 見本と同じです</p>
                )}
              </div>
            );
          })}
        </section>
      ) : null}
      <DocPaper title={r.problemTitle} text={o.text} className={`doc-print ${showCheck ? 'print-only' : ''}`} testId="doc-result-paper" />
    </main>
  );
}
