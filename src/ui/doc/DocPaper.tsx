/**
 * A4 縦の文書（文書作成モード）：タイトルと、本人が入力した全文だけを表示します（見本・問題番号・印は入れません）。
 * 本人が入力した改行・空白はそのまま表示します（white-space: pre-wrap）。印刷にもこの表示を使います。
 */
export function DocPaper({ title, text, testId, className }: { title: string; text: string; testId?: string; className?: string }) {
  return (
    <article className={`doc-paper ${className ?? ''}`} data-testid={testId ?? 'doc-paper'} aria-label={`${title}（入力した文書）`}>
      <h1 className="doc-paper-title">{title}</h1>
      <div className="doc-paper-body" data-testid="doc-paper-body">
        {text}
      </div>
    </article>
  );
}
