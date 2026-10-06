import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { countExamChars, GRADES, gradeInfo, isScorable, TIME_OPTIONS, timeLabel, type ExamGrade, type ExamMaterial, type ExamProblem, type Rotation } from '../../core/exam';
import { checkMaterialFile, formatBytes, MAX_FILE_BYTES, MAX_IMAGE_FILES, MAX_PDF_PAGES, sha256Hex } from '../../core/examFiles';
import { MAX_TITLE_CHARS, newFileId, newTeacherProblemId, shortAnswerNotice, validateTeacherProblem } from '../../core/examProblem';
import { MAX_ANSWER_CHARS } from '../../core/examScoring';
import { exportPack, packFileName } from '../../data/examPack';
import { examStore, StoreError, type StoredFile } from '../../data/examStore';
import { extractPdfText, openPdf, PdfError } from '../../data/pdf';
import { useApp } from '../../state/AppContext';
import { canManageExamProblems } from '../../state/examAccess';
import { navigate } from '../../state/router';
import { BackLink, formatDate } from '../../ui/common';
import { ImportPack } from '../../ui/exam/ImportPack';
import { MaterialViewer, type BlobResolver } from '../../ui/exam/MaterialViewer';
import { isCloudConfigured } from '../../config';

export function ExamManage() {
  const { account } = useApp();
  if (!canManageExamProblems(account)) {
    return (
      <main>
        <BackLink to="/exam">検定モードにもどる</BackLink>
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
  const { setExamSession } = useApp();
  const [items, setItems] = useState<ExamProblem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [usage, setUsage] = useState<string | null>(null);
  const editorTop = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setItems(await examStore().listProblems());
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
    setExamSession({ problem: p, timeLimitSeconds: p.timeLimitSeconds, preview: true });
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
    }, `${ids.length}問を教材パックに書き出しました（${packFileName()}）。生徒の端末の「検定モード → 先生の追加問題 → 教材パックを読み込む」で読み込んでください。`);
  };

  return (
    <main>
      <BackLink to="/exam">検定モードにもどる</BackLink>
      <h1 style={{ marginTop: 12 }}>先生の追加問題（検定モード）</h1>
      <div className="grid grid-2 store-explain">
        <div className="msg msg-info">
          <strong>この端末に保存</strong>：追加した問題は、この端末のこのブラウザだけに保存されます（画像・PDF のファイルごと保存し、再読み込みしても使えます）。ほかの端末やほかのブラウザには届きません。
          {isCloudConfigured && ' ログインしていても、クラウドには保存されません。'}
        </div>
        <div className="msg msg-info">
          <strong>教材パックで配布</strong>：問題を選んで「教材パックで書き出す」と、問題の設定・採点用の正解文・お手本のファイルを1つのファイルにまとめます。生徒の端末で読み込むと使えるようになります。成績やログイン情報は入りません。
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
            ＋ 問題を追加する
          </button>
        </div>
      )}

      <section className="panel" style={{ marginTop: 20 }}>
        <h2>この端末の追加問題</h2>
        {items === null && <p>読み込んでいます…</p>}
        {items && items.length === 0 && <p className="hint">まだ問題はありません。「問題を追加する」から、画像や PDF のお手本で問題を作れます。</p>}
        {items && items.length > 0 && (
          <div className="table-wrap">
            <table className="manage-table">
              <thead>
                <tr>
                  <th>
                    <span className="sr-only">書き出す問題として選ぶ</span>
                  </th>
                  <th>問題名</th>
                  <th>段階</th>
                  <th>制限時間</th>
                  <th>自動採点</th>
                  <th>お手本</th>
                  <th>生徒向け</th>
                  <th>改訂</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} data-testid="manage-row">
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
                    <td>{p.title}</td>
                    <td>{gradeInfo(p.grade).label}</td>
                    <td>{timeLabel(p.timeLimitSeconds)}</td>
                    <td>{isScorable(p) ? `あり（${countExamChars(p.answerText!)}文字）` : '採点なし'}</td>
                    <td>
                      {p.material.kind === 'pdf' ? 'PDF' : '画像'} {p.material.kind !== 'text' && `${p.material.pages.length}ページ`}
                    </td>
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
                        <button type="button" className="btn btn-small" onClick={() => preview(p)}>
                          生徒用プレビュー
                        </button>
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => {
                            setEditing({ problem: p });
                            editorTop.current?.scrollIntoView({ block: 'start' });
                          }}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => {
                            const now = new Date().toISOString();
                            const title = [...`${p.title}（コピー）`].slice(0, MAX_TITLE_CHARS).join('');
                            void run(() => examStore().saveProblem({ ...p, id: newTeacherProblemId(), title, revision: 1, createdAt: now, updatedAt: now }, []), `「${p.title}」を複製しました`);
                          }}
                        >
                          複製
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-small"
                          onClick={() => {
                            if (!window.confirm(`「${p.title}」をこの端末から削除しますか？ お手本のファイルも削除されます（ほかの端末に配布した教材パックや、これまでの記録は消えません）。`)) return;
                            void run(() => examStore().deleteProblem(p.id), `「${p.title}」を削除しました`);
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

type DraftFile = StoredFile;
type PdfInfo = { fileId: string; numPages: number };

interface Draft {
  title: string;
  grade: ExamGrade;
  timeLimitSeconds: number | null;
  scoringEnabled: boolean;
  answerText: string;
  answerConfirmed: boolean;
  visible: boolean;
  material: ExamMaterial | null;
}

function Editor({ initial, onCancel, onSaved }: { initial: ExamProblem | null; onCancel: () => void; onSaved: (p: ExamProblem) => void }) {
  const [d, setD] = useState<Draft>(() => ({
    title: initial?.title ?? '',
    grade: initial?.grade ?? '3',
    timeLimitSeconds: initial ? initial.timeLimitSeconds : 600,
    scoringEnabled: initial?.scoringEnabled ?? true,
    answerText: initial?.answerText ?? '',
    answerConfirmed: initial?.answerConfirmed ?? false,
    visible: initial?.visible ?? true,
    material: initial?.material ?? null,
  }));
  const [newFiles, setNewFiles] = useState<Map<string, DraftFile>>(new Map());
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const resolve = useCallback<BlobResolver>(
    async (id) => newFiles.get(id)?.blob ?? (await examStore().getFile(id))?.blob ?? null,
    [newFiles],
  );

  // 編集のとき：PDF のページ数を調べます
  useEffect(() => {
    const m = d.material;
    if (m?.kind !== 'pdf' || pdfInfo?.fileId === m.fileId) return;
    let cancelled = false;
    void (async () => {
      const blob = await resolve(m.fileId);
      if (!blob || cancelled) return;
      try {
        const doc = await openPdf(blob);
        if (!cancelled) setPdfInfo({ fileId: m.fileId, numPages: doc.numPages });
        void doc.loadingTask.destroy();
      } catch (e) {
        if (!cancelled) setFileMsg(e instanceof PdfError ? e.message : 'PDF を読み込めませんでした。');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [d.material, pdfInfo?.fileId, resolve]);

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const chooseFiles = async (list: FileList | null) => {
    setFileMsg(null);
    if (!list || list.length === 0) return;
    const files = [...list];
    setBusy(true);
    try {
      const checks = await Promise.all(files.map((f) => checkMaterialFile(f)));
      const bad = checks.find((c): c is { ok: false; message: string } => !c.ok);
      if (bad) return setFileMsg(bad.message);
      const types = checks.map((c) => (c.ok ? c.type : null));
      const pdfCount = types.filter((t) => t === 'application/pdf').length;
      if (pdfCount > 0 && files.length > 1) return setFileMsg('PDF は1つだけ選んでください（画像と PDF を一緒には使えません）。');
      const stored: DraftFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        const buf = await f.arrayBuffer();
        stored.push({ id: newFileId(), name: f.name.slice(0, 120), type: types[i]!, size: f.size, blob: new Blob([buf], { type: types[i]! }), sha256: await sha256Hex(buf) });
      }
      if (pdfCount === 1) {
        const f = stored[0]!;
        let numPages = 0;
        try {
          const doc = await openPdf(f.blob);
          numPages = doc.numPages;
          void doc.loadingTask.destroy();
        } catch (e) {
          return setFileMsg(e instanceof PdfError ? e.message : 'PDF を読み込めませんでした。');
        }
        if (numPages > MAX_PDF_PAGES) return setFileMsg(`この PDF は${numPages}ページあります。1つの問題で使える PDF は${MAX_PDF_PAGES}ページまでです。必要なページだけの PDF に分けてください。`);
        setNewFiles(new Map([[f.id, f]]));
        setPdfInfo({ fileId: f.id, numPages });
        set({ material: { kind: 'pdf', fileId: f.id, pages: Array.from({ length: numPages }, (_, i) => ({ page: i + 1, rotation: 0 as Rotation })) } });
      } else {
        const current = d.material?.kind === 'image' ? d.material.pages : [];
        if (current.length + stored.length > MAX_IMAGE_FILES) return setFileMsg(`画像は1つの問題で${MAX_IMAGE_FILES}枚までです。`);
        const map = new Map(d.material?.kind === 'image' ? newFiles : []);
        for (const f of stored) map.set(f.id, f);
        setNewFiles(map);
        setPdfInfo(null);
        set({ material: { kind: 'image', pages: [...current, ...stored.map((f) => ({ fileId: f.id, rotation: 0 as Rotation }))] } });
      }
    } catch {
      setFileMsg('ファイルを読み込めませんでした。もう一度選んでください。');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const extract = async () => {
    const m = d.material;
    if (m?.kind !== 'pdf') return;
    setBusy(true);
    setExtractNote(null);
    try {
      const blob = await resolve(m.fileId);
      if (!blob) throw new Error();
      const doc = await openPdf(blob);
      const text = await extractPdfText(doc, m.pages.map((p) => p.page));
      void doc.loadingTask.destroy();
      if (!text.trim()) {
        setExtractNote('この PDF からは文字を取り出せませんでした（スキャンした PDF など、文字の情報がない PDF です）。正解文を入力するか、貼り付けてください。');
      } else {
        set({ answerText: text, answerConfirmed: false });
        setExtractNote('PDF から文字を取り出しました（補助機能）。読み順・改行・タイトル・ページ番号・余分な空白などを、お手本と見比べて確認・修正してから「正解文を確認済み」にしてください。');
      }
    } catch (e) {
      setExtractNote(e instanceof PdfError ? e.message : '文字を取り出せませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const movePage = (i: number, dir: -1 | 1) => {
    const m = d.material;
    if (!m || m.kind === 'text') return;
    const pages = [...m.pages] as typeof m.pages;
    const j = i + dir;
    if (j < 0 || j >= pages.length) return;
    [pages[i], pages[j]] = [pages[j]!, pages[i]!];
    set({ material: { ...m, pages } as ExamMaterial });
  };
  const rotatePage = (i: number) => {
    const m = d.material;
    if (!m || m.kind === 'text') return;
    const pages = m.pages.map((p, k) => (k === i ? { ...p, rotation: ((p.rotation + 90) % 360) as Rotation } : p));
    set({ material: { ...m, pages } as ExamMaterial });
  };
  const removePage = (i: number) => {
    const m = d.material;
    if (!m || m.kind === 'text') return;
    const pages = m.pages.filter((_, k) => k !== i);
    set({ material: pages.length === 0 && m.kind === 'image' ? null : ({ ...m, pages } as ExamMaterial) });
  };
  const togglePdfPage = (page: number, on: boolean) => {
    const m = d.material;
    if (m?.kind !== 'pdf') return;
    const pages = on ? [...m.pages, { page, rotation: 0 as Rotation }] : m.pages.filter((p) => p.page !== page);
    set({ material: { ...m, pages } });
  };

  const problem = useMemo<ExamProblem | null>(() => {
    if (!d.material) return null;
    const now = new Date().toISOString();
    const text = d.answerText.replace(/\r\n?/g, '\n');
    return {
      id: initial?.id ?? 'draft',
      revision: initial ? initial.revision + 1 : 1,
      title: d.title.trim(),
      grade: d.grade,
      source: 'teacher',
      timeLimitSeconds: d.timeLimitSeconds,
      scoringEnabled: d.scoringEnabled,
      answerText: d.scoringEnabled ? text : text.trim() ? text : null,
      answerConfirmed: d.scoringEnabled ? d.answerConfirmed : false,
      visible: d.visible,
      material: d.material,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
  }, [d, initial]);

  const save = async () => {
    if (!problem) return setErrors(['お手本の画像または PDF を選んでください']);
    const p: ExamProblem = { ...problem, id: initial?.id ?? newTeacherProblemId() };
    const errs = validateTeacherProblem(p);
    setErrors(errs);
    if (errs.length > 0) return;
    // 使われているファイルのうち、まだ保存していないものだけを保存します
    const used = new Set(p.material.kind === 'pdf' ? [p.material.fileId] : p.material.kind === 'image' ? p.material.pages.map((x) => x.fileId) : []);
    const files = [...newFiles.values()].filter((f) => used.has(f.id));
    setBusy(true);
    try {
      await examStore().saveProblem(p, files);
      onSaved(p);
    } catch (e) {
      setErrors([e instanceof StoreError ? e.message : '保存できませんでした。']);
    } finally {
      setBusy(false);
    }
  };

  const answerChars = countExamChars(d.answerText);
  const shortNote = d.scoringEnabled && answerChars > 0 ? shortAnswerNotice({ grade: d.grade, answerText: d.answerText }) : null;
  const m = d.material;

  return (
    <section className="panel editor" aria-labelledby="editor-title" data-testid="exam-editor">
      <h2 id="editor-title">{initial ? `問題を編集（改訂 ${initial.revision} → ${initial.revision + 1}）` : '問題を追加'}</h2>
      {initial && <p className="hint">保存すると改訂番号が1つ上がります。これまでの記録は、記録したときの改訂番号と成績のまま残し、あとから再採点しません。</p>}

      <h3>1. 問題名</h3>
      <div className="field">
        <label htmlFor="ep-title">問題名</label>
        <input id="ep-title" type="text" maxLength={MAX_TITLE_CHARS} value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="例：職場実習の報告（プリント）" />
      </div>

      <h3>2. 段階と制限時間</h3>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="ep-grade">級相当の段階</label>
          <select id="ep-grade" value={d.grade} onChange={(e) => set({ grade: e.target.value as ExamGrade })}>
            {GRADES.map((g) => (
              <option key={g.grade} value={g.grade}>
                {g.label}（目安 {g.targetCharacters}文字・1ミス {g.penaltyPerError}文字減点）
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ep-time">制限時間（生徒が開始前に変えることもできます）</label>
          <select id="ep-time" value={String(d.timeLimitSeconds)} onChange={(e) => set({ timeLimitSeconds: e.target.value === 'null' ? null : Number(e.target.value) })}>
            {TIME_OPTIONS.map((t) => (
              <option key={String(t)} value={String(t)}>
                {t === 600 ? '10分（標準）' : timeLabel(t)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h3>3. お手本（画像または PDF）</h3>
      <p className="hint">
        使えるのは PNG・JPEG・WebP の画像（スマートフォンで撮影したプリントの写真も可）と PDF です。1ファイル {formatBytes(MAX_FILE_BYTES)}・PDF は{MAX_PDF_PAGES}ページ・画像は{MAX_IMAGE_FILES}枚までです。
      </p>
      <label className="btn file-btn">
        {m ? 'お手本を選び直す／画像を追加する' : '画像または PDF を選ぶ'}
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          data-testid="material-input"
          accept="image/png,image/jpeg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf,.heic,.heif"
          multiple
          disabled={busy}
          onChange={(e) => void chooseFiles(e.target.files)}
        />
      </label>
      {busy && <span className="hint">　処理しています…</span>}
      {fileMsg && (
        <p className="msg msg-ng" role="alert" data-testid="file-msg">
          {fileMsg}
        </p>
      )}

      {m && m.kind === 'pdf' && pdfInfo && (
        <div className="page-picker" data-testid="pdf-pages">
          <h4>使うページと順番</h4>
          <p className="hint">PDF は全{pdfInfo.numPages}ページです。使うページに印を付け、下の一覧で順番と向きを決めてください。</p>
          <div className="choice-row">
            {Array.from({ length: pdfInfo.numPages }, (_, i) => i + 1).map((n) => (
              <label key={n} className="choice">
                <input type="checkbox" checked={m.pages.some((p) => p.page === n)} onChange={(e) => togglePdfPage(n, e.target.checked)} />
                {n}ページ
              </label>
            ))}
          </div>
        </div>
      )}
      {m && m.kind !== 'text' && m.pages.length > 0 && (
        <ol className="page-order" data-testid="page-order">
          {m.pages.map((p, i) => (
            <li key={`${'page' in p ? p.page : p.fileId}-${i}`}>
              <span>{'page' in p ? `PDF の ${p.page}ページ` : `画像：${newFiles.get(p.fileId)?.name ?? '保存済みの画像'}`}</span>
              <span className="hint">　向き {p.rotation}°</span>
              <span className="btn-row inline">
                <button type="button" className="btn btn-small" onClick={() => movePage(i, -1)} disabled={i === 0} aria-label={`${i + 1}番目を前へ`}>
                  ↑
                </button>
                <button type="button" className="btn btn-small" onClick={() => movePage(i, 1)} disabled={i === m.pages.length - 1} aria-label={`${i + 1}番目を後ろへ`}>
                  ↓
                </button>
                <button type="button" className="btn btn-small" onClick={() => rotatePage(i)}>
                  ↻ 回転
                </button>
                <button type="button" className="btn btn-small btn-quiet" onClick={() => removePage(i)}>
                  外す
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <h3>4. お手本のプレビュー</h3>
      {problem && problem.material.kind !== 'text' && problem.material.pages.length > 0 ? (
        <div className="editor-preview" data-testid="editor-preview">
          <MaterialViewer problem={problem} resolve={resolve} fontScale={1} />
        </div>
      ) : (
        <p className="hint">お手本を選ぶと、ここに表示されます。</p>
      )}

      <h3>5. 採点用の正解文</h3>
      <div className="choice-row">
        <label className="choice">
          <input type="radio" name="ep-scoring" checked={d.scoringEnabled} onChange={() => set({ scoringEnabled: true })} />
          正解文を登録して自動採点する
        </label>
        <label className="choice">
          <input type="radio" name="ep-scoring" checked={!d.scoringEnabled} onChange={() => set({ scoringEnabled: false })} data-testid="no-scoring" />
          採点なし
        </label>
      </div>
      {!d.scoringEnabled && <p className="hint">採点なしの問題は、入力文字数・経過時間・入力した文章だけを表示します。ミス数や目安達成は出しません。開始前に「採点なし」と表示します。</p>}
      {d.scoringEnabled && (
        <>
          <p className="hint">
            お手本の画像・PDF とは別に、採点に使う正しい文章を登録します。直接入力・貼り付け・修正ができます。段落の終わりは改行してください（採点では改行・空白は比べません）。
            {m?.kind === 'image' && ' 画像の文字は自動では読み取りません。お手本を見ながら入力するか、貼り付けてください。'}
          </p>
          {m?.kind === 'pdf' && (
            <button type="button" className="btn btn-small" onClick={() => void extract()} disabled={busy} data-testid="extract-text">
              PDF から文字を取り出す（補助）
            </button>
          )}
          {extractNote && (
            <p className="msg msg-info" role="status" data-testid="extract-note">
              {extractNote}
            </p>
          )}
          <div className="field">
            <label htmlFor="ep-answer">採点用の正解文</label>
            <textarea
              id="ep-answer"
              rows={10}
              value={d.answerText}
              onChange={(e) => set({ answerText: e.target.value, answerConfirmed: false })}
              data-testid="answer-text"
              lang="ja"
            />
            <span className="hint" data-testid="answer-count">
              {answerChars}文字（改行・空白を除く）・{gradeInfo(d.grade).label}の目安 {gradeInfo(d.grade).targetCharacters}文字
              {answerChars > MAX_ANSWER_CHARS && <span className="error-text">　{MAX_ANSWER_CHARS}文字までです</span>}
            </span>
          </div>
          {shortNote && (
            <p className="msg msg-info" data-testid="short-note">
              {shortNote}
            </p>
          )}
          <label className="switch">
            <input type="checkbox" checked={d.answerConfirmed} onChange={(e) => set({ answerConfirmed: e.target.checked })} data-testid="answer-confirmed" />
            正解文を確認済み（お手本と見比べ、読み順・タイトル・ページ番号・誤字などを確認しました）
          </label>
          {!d.answerConfirmed && <p className="hint">確認済みにするまで、自動採点の問題としては保存できません。正解文を書き換えると、確認済みの印は外れます。</p>}
        </>
      )}

      <h3>6. 保存</h3>
      <label className="switch">
        <input type="checkbox" checked={d.visible} onChange={(e) => set({ visible: e.target.checked })} />
        生徒向けに表示する（「検定モード → 先生の追加問題」に出します）
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
          この端末に保存する
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          やめる
        </button>
      </div>
    </section>
  );
}
