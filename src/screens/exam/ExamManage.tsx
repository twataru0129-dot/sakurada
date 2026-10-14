import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExamProblem } from '../../core/exam';
import { countDocChars, MAX_SAMPLE_CHARS, normalizeText, removeBlankLines, sampleParagraphs, sampleProblems } from '../../core/document';
import { docUnavailableReason, sortTeacherProblems } from '../../core/documentProblem';
import { formatBytes } from '../../core/examFiles';
import { MAX_TITLE_CHARS, newTeacherProblemId, validateTeacherProblem } from '../../core/examProblem';
import { exportPack, packFileName } from '../../data/examPack';
import { examStore, StoreError } from '../../data/examStore';
import { extractPdfText, openPdf, PdfError } from '../../data/pdf';
import { useApp } from '../../state/AppContext';
import { canManageExamProblems } from '../../state/examAccess';
import { navigate } from '../../state/router';
import { BackLink, formatDate } from '../../ui/common';
import { ImportPack } from '../../ui/exam/ImportPack';
import { MaterialViewer, type BlobResolver } from '../../ui/exam/MaterialViewer';
import { isCloudConfigured } from '../../config';

/**
 * 先生の追加問題の管理（文書作成モード・v2.0.0）。
 * 新しい問題は「タイトル＋見本の文章」で作ります。級と制限時間の設定はありません（内部の値は残します）。
 * 旧検定モードの画像・PDF の問題は、原本のファイル・ID・改訂番号を消さずに残し、見本の文章を登録・確認すると使えます。
 */
export function ExamManage() {
  const { account } = useApp();
  if (!canManageExamProblems(account)) {
    return (
      <main>
        <BackLink to="/exam">文書作成モードにもどる</BackLink>
        <p className="msg msg-ng" style={{ marginTop: 12 }}>
          この画面は先生のアカウントでログインしたときだけ使えます。
        </p>
      </main>
    );
  }
  return <Manage />;
}

type Editing = { problem: ExamProblem | null } | null;

function Manage() {
  const { setDocSession } = useApp();
  const [items, setItems] = useState<ExamProblem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [usage, setUsage] = useState<string | null>(null);
  const editorTop = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setItems(sortTeacherProblems(await examStore().listProblems()));
      setError(null);
    } catch (e) {
      setItems([]);
      setError(e instanceof StoreError ? e.message : 'この端末の問題を読み込めませんでした。');
    }
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage !== undefined && est.quota) setUsage(`この端末で使っている容量：約${formatBytes(est.usage)}（使える目安：約${formatBytes(est.quota)}）`);
    } catch {
      /* 表示しないだけです */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const preview = (p: ExamProblem) => {
    setDocSession({ problem: p, preview: true });
    navigate('/exam/practice');
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    setMsg(null);
    setError(null);
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (e) {
      setError(e instanceof StoreError ? e.message : e instanceof Error ? e.message : '操作できませんでした。');
    }
  };

  const doExport = async () => {
    const ids = [...checked];
    await run(async () => {
      const blob = await exportPack(examStore(), ids);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = packFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }, `${ids.length}問を教材パックに書き出しました（${packFileName()}）。生徒の端末の「文書作成モード → 先生の追加問題 → 教材パックを読み込む」で読み込んでください。`);
  };

  return (
    <main>
      <BackLink to="/exam">文書作成モードにもどる</BackLink>
      <h1 style={{ marginTop: 12 }}>先生の追加問題（文書作成モード）</h1>
      <div className="grid grid-2 store-explain">
        <div className="msg msg-info">
          <strong>この端末に保存</strong>：追加した問題は、この端末のこのブラウザだけに保存されます。ほかの端末やほかのブラウザには届きません。
          {isCloudConfigured && ' ログインしていても、クラウドには保存されません。'}
        </div>
        <div className="msg msg-info">
          <strong>教材パックで配布</strong>：問題を選んで「教材パックで書き出す」と、問題のタイトル・見本の文章（旧検定の問題は原本のファイルも）を1つのファイルにまとめます。生徒の端末で読み込むと使えるようになります。成績やログイン情報は入りません。
        </div>
      </div>
      {!isCloudConfigured && (
        <p className="hint">
          ログイン機能を設定していないため、この端末を使う人ならだれでも、この画面で問題を管理できます。この制限は画面の表示だけで、データを守る仕組みではありません。
        </p>
      )}
      {usage && <p className="hint">{usage}</p>}
      {msg && (
        <p className="msg msg-ok" role="status" data-testid="manage-msg">
          {msg}
        </p>
      )}
      {error && (
        <p className="msg msg-ng" role="alert">
          {error}
        </p>
      )}

      <div ref={editorTop} />
      {editing ? (
        <Editor
          key={editing.problem?.id ?? 'new'}
          initial={editing.problem}
          nextOrder={(items ?? []).reduce((n, p) => Math.max(n, (p.sortOrder ?? 0) + 10), 10)}
          onCancel={() => setEditing(null)}
          onSaved={async (p) => {
            setEditing(null);
            setMsg(`「${p.title}」を保存しました（この端末に保存）。下の一覧の「生徒用プレビュー」で、生徒の画面を確認できます。`);
            await load();
          }}
        />
      ) : (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="new-problem"
            onClick={() => {
              setMsg(null);
              setEditing({ problem: null });
            }}
          >
            ＋ 問題を追加する（タイトル＋見本の文章）
          </button>
        </div>
      )}

      <section className="panel" style={{ marginTop: 20 }}>
        <h2>この端末の追加問題</h2>
        {items === null && <p>読み込んでいます…</p>}
        {items && items.length === 0 && <p className="hint">まだ問題はありません。「問題を追加する」から、タイトルと見本の文章で問題を作れます。</p>}
        {items && items.length > 0 && (
          <div className="table-wrap">
            <table className="manage-table">
              <thead>
                <tr>
                  <th>
                    <span className="sr-only">書き出す問題として選ぶ</span>
                  </th>
                  <th>並び順</th>
                  <th>タイトル</th>
                  <th>見本の文章</th>
                  <th>種類</th>
                  <th>生徒向け</th>
                  <th>改訂</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const reason = docUnavailableReason(p);
                  return (
                    <tr key={p.id} data-testid="manage-row" data-problem-id={p.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${p.title} を書き出す`}
                          checked={checked.has(p.id)}
                          onChange={(e) => {
                            const next = new Set(checked);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            setChecked(next);
                          }}
                        />
                      </td>
                      <td className="num">{p.sortOrder ?? '—'}</td>
                      <td>{p.title}</td>
                      <td data-testid="manage-sample-state">
                        {reason ? (
                          <span className="msg msg-ng inline-msg">{reason}</span>
                        ) : (
                          `${countDocChars(p.answerText!)}文字・${sampleParagraphs(p.answerText!).length}段落`
                        )}
                      </td>
                      <td>{p.material.kind === 'text' ? '文章' : `${p.material.kind === 'pdf' ? 'PDF' : '画像'}（旧検定の原本あり）`}</td>
                      <td>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={p.visible}
                            onChange={(e) =>
                              void run(
                                () => examStore().saveProblem({ ...p, visible: e.target.checked, updatedAt: new Date().toISOString() }, []),
                                e.target.checked ? `「${p.title}」を生徒向けに表示します` : `「${p.title}」を生徒向けに表示しません`,
                              )
                            }
                            data-testid="manage-visible"
                          />
                          {p.visible ? '表示' : '非表示'}
                        </label>
                      </td>
                      <td>
                        {p.revision}
                        <div className="hint">{formatDate(p.updatedAt)}</div>
                      </td>
                      <td>
                        <div className="btn-row">
                          <button type="button" className="btn btn-small" onClick={() => preview(p)} disabled={!!reason} data-testid="manage-preview">
                            生徒用プレビュー
                          </button>
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => {
                              setEditing({ problem: p });
                              editorTop.current?.scrollIntoView({ block: 'start' });
                            }}
                            data-testid="manage-edit"
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => {
                              const now = new Date().toISOString();
                              const title = [...`${p.title}（コピー）`].slice(0, MAX_TITLE_CHARS).join('');
                              // 原本のファイルは同じものを共有します（どちらかを削除しても、使われているファイルは残ります）
                              void run(() => examStore().saveProblem({ ...p, id: newTeacherProblemId(), title, revision: 1, createdAt: now, updatedAt: now }, []), `「${p.title}」を複製しました`);
                            }}
                            data-testid="manage-copy"
                          >
                            複製
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-small"
                            onClick={() => {
                              if (!window.confirm(`「${p.title}」をこの端末から削除しますか？（ほかの端末に配布した教材パックや、これまでの記録は消えません）`)) return;
                              void run(() => examStore().deleteProblem(p.id), `「${p.title}」を削除しました`);
                            }}
                            data-testid="manage-delete"
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn" disabled={checked.size === 0} onClick={() => void doExport()} data-testid="export-pack">
            選んだ問題（{checked.size}問）を教材パックで書き出す
          </button>
          <ImportPack onImported={() => void load()} />
        </div>
      </section>
    </main>
  );
}

interface Draft {
  title: string;
  sample: string;
  confirmed: boolean;
  visible: boolean;
  sortOrder: string;
}

function Editor({ initial, nextOrder, onCancel, onSaved }: { initial: ExamProblem | null; nextOrder: number; onCancel: () => void; onSaved: (p: ExamProblem) => void }) {
  const [d, setD] = useState<Draft>(() => ({
    title: initial?.title ?? '',
    sample: initial?.answerText ?? '',
    confirmed: initial?.answerConfirmed ?? false,
    visible: initial?.visible ?? true,
    sortOrder: String(initial?.sortOrder ?? nextOrder),
  }));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const legacy = initial && initial.material.kind !== 'text' ? initial : null;
  const resolve = useCallback<BlobResolver>(async (id) => (await examStore().getFile(id))?.blob ?? null, []);
  // 見本の文章を変えたら、段落の区切りの確認はやり直します
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch, ...('sample' in patch && patch.sample !== x.sample ? { confirmed: false } : {}) }));

  const text = normalizeText(d.sample);
  const paras = text.trim() ? sampleParagraphs(text) : [];
  const issues = text.trim() ? sampleProblems(text) : [];
  const hasBlank = paras.some((l) => l.trim() === '');

  const problem = useMemo<ExamProblem>(() => {
    const now = new Date().toISOString();
    const order = d.sortOrder.trim() === '' ? undefined : Number(d.sortOrder);
    return {
      id: initial?.id ?? 'draft',
      revision: initial ? initial.revision + 1 : 1,
      title: d.title.trim(),
      // 級・制限時間は文書作成モードでは使いません（旧検定の問題は元の値のまま、新しい問題は内部の既定値）
      grade: initial?.grade ?? '4',
      source: 'teacher',
      timeLimitSeconds: initial ? initial.timeLimitSeconds : null,
      scoringEnabled: true,
      answerText: text,
      answerConfirmed: d.confirmed,
      visible: d.visible,
      sortOrder: order,
      material: initial?.material ?? { kind: 'text' },
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
  }, [d, initial, text]);

  const extract = async () => {
    const m = legacy?.material;
    if (m?.kind !== 'pdf') return;
    setBusy(true);
    setExtractNote(null);
    try {
      const blob = await resolve(m.fileId);
      if (!blob) throw new Error();
      const doc = await openPdf(blob);
      const t = await extractPdfText(doc, m.pages.map((p) => p.page));
      void doc.loadingTask.destroy();
      if (!t.trim()) setExtractNote('この PDF からは文字を取り出せませんでした（スキャンした PDF など）。見本の文章を入力するか、貼り付けてください。');
      else {
        set({ sample: t });
        setExtractNote('PDF から文字を取り出しました（補助機能）。読み順・改行・段落・余分な空白などを、原本と見比べて確認・修正してください。');
      }
    } catch (e) {
      setExtractNote(e instanceof PdfError ? e.message : '文字を取り出せませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const p: ExamProblem = { ...problem, id: initial?.id ?? newTeacherProblemId() };
    if (p.sortOrder !== undefined && !Number.isInteger(p.sortOrder)) return setErrors(['並び順は 0〜9999 の整数にしてください']);
    const errs = validateTeacherProblem(p);
    if (!d.confirmed && !errs.some((e) => e.includes('段落の区切り'))) errs.push('段落の区切りを確認して、「段落の区切りを確認しました」にしてください');
    setErrors(errs);
    if (errs.length > 0) return;
    setBusy(true);
    try {
      await examStore().saveProblem(p, []);
      onSaved(p);
    } catch (e) {
      setErrors([e instanceof StoreError ? e.message : '保存できませんでした。']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel editor" aria-labelledby="editor-title" data-testid="exam-editor">
      <h2 id="editor-title">{initial ? `問題を編集（改訂 ${initial.revision} → ${initial.revision + 1}）` : '問題を追加'}</h2>

      <h3>1. タイトル</h3>
      <div className="field">
        <label htmlFor="ep-title">タイトル</label>
        <input id="ep-title" type="text" value={d.title} maxLength={MAX_TITLE_CHARS} onChange={(e) => set({ title: e.target.value })} data-testid="ep-title" />
      </div>

      {legacy && (
        <>
          <h3>旧検定モードの原本（{legacy.material.kind === 'pdf' ? 'PDF' : '画像'}）</h3>
          <p className="hint">原本のファイルは消さずに残しています。文書作成モードでは、下の「見本の文章」を段落ごとに表示します（画像・PDF は生徒の画面には出しません）。</p>
          <div className="editor-preview" data-testid="legacy-original">
            <MaterialViewer problem={legacy} resolve={resolve} fontScale={1} />
          </div>
          {legacy.material.kind === 'pdf' && (
            <button type="button" className="btn btn-small" onClick={() => void extract()} disabled={busy} data-testid="extract-text">
              PDF から文字を取り出す（補助）
            </button>
          )}
          {extractNote && (
            <p className="msg msg-info" role="status" data-testid="extract-note">
              {extractNote}
            </p>
          )}
        </>
      )}

      <h3>2. 見本の文章</h3>
      <p className="hint">文章を入力するか、貼り付けてください。改行したところが段落の区切りになります（改行を勝手に消したり、句点ごとに改行したりはしません）。空の行は入れられません。</p>
      <div className="field">
        <label htmlFor="ep-sample">見本の文章</label>
        <textarea id="ep-sample" className="answer-input" rows={12} value={d.sample} onChange={(e) => set({ sample: e.target.value })} data-testid="ep-sample" lang="ja" />
        <span className="hint" data-testid="ep-count">
          {countDocChars(text)}文字（改行を除く）・{paras.length}段落（{MAX_SAMPLE_CHARS}文字まで）
        </span>
      </div>
      {issues.length > 0 && (
        <div className="msg msg-ng" role="alert" data-testid="ep-issues">
          <ul>
            {issues.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {hasBlank && (
            <button type="button" className="btn btn-small" onClick={() => set({ sample: removeBlankLines(d.sample) })} data-testid="ep-remove-blank">
              空の行を取り除く
            </button>
          )}
        </div>
      )}

      <h3>3. 段落の確認</h3>
      <p className="hint">生徒の画面では、この段落ごとに見本と入力欄を表示します。段落の区切りが意図どおりか確認してください。</p>
      <ol className="doc-para-preview" data-testid="ep-paragraphs">
        {paras.map((p, i) => (
          <li key={i} className={p.trim() === '' ? 'is-blank' : ''}>
            <span className="doc-para-preview-no">段落 {i + 1}</span>
            <span className="doc-para-preview-text">{p.trim() === '' ? '（空の行）' : p}</span>
            {i < paras.length - 1 && <span className="doc-break-mark">↵ 改行</span>}
          </li>
        ))}
      </ol>
      <label className="switch">
        <input type="checkbox" checked={d.confirmed} onChange={(e) => set({ confirmed: e.target.checked })} data-testid="ep-confirmed" />
        段落の区切りを確認しました
      </label>

      <h3>4. 並び順と表示</h3>
      <div className="field">
        <label htmlFor="ep-order">並び順（小さいほど先に表示します。0〜9999）</label>
        <input id="ep-order" type="number" min={0} max={9999} step={1} value={d.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} data-testid="ep-order" />
      </div>
      <label className="switch">
        <input type="checkbox" checked={d.visible} onChange={(e) => set({ visible: e.target.checked })} data-testid="ep-visible" />
        生徒向けに表示する
      </label>

      {errors.length > 0 && (
        <ul className="msg msg-ng" role="alert" data-testid="editor-errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy} data-testid="save-problem">
          保存する
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          やめる
        </button>
      </div>
    </section>
  );
}
