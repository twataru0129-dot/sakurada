import { useRef, useState } from 'react';
import { gradeInfo } from '../../core/exam';
import { applyImport, PACK_EXTENSION, PackError, planImport, readPack, type ImportPlanItem, type PackContents } from '../../data/examPack';
import { examStore, StoreError } from '../../data/examStore';

/** 教材パックの読み込み（この端末に問題を追加します。既存の問題は上書きしません） */
export function ImportPack({ onImported }: { onImported: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pack, setPack] = useState<PackContents | null>(null);
  const [plan, setPlan] = useState<ImportPlanItem[] | null>(null);
  const [copy, setCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const choose = async (file: File | undefined) => {
    setMsg(null);
    setPack(null);
    setPlan(null);
    if (!file) return;
    setBusy(true);
    try {
      const p = await readPack(file);
      setPack(p);
      setPlan(await planImport(examStore(), p));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof PackError || e instanceof StoreError ? e.message : '教材パックを読み込めませんでした。' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const apply = async () => {
    if (!pack || !plan) return;
    setBusy(true);
    try {
      const r = await applyImport(examStore(), pack, plan, copy);
      setMsg({ ok: true, text: `${r.added}問をこの端末に追加しました。${r.skipped > 0 ? `${r.skipped}問は追加しませんでした（読み込み済み、または同じIDの問題があるため）。` : ''}` });
      setPack(null);
      setPlan(null);
      onImported();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof StoreError ? e.message : '読み込みの途中で保存できませんでした。' });
    } finally {
      setBusy(false);
    }
  };

  const conflicts = plan?.filter((x) => x.status === 'conflict').length ?? 0;
  return (
    <div className="import-pack">
      <label className="btn btn-small file-btn">
        教材パックを読み込む（{PACK_EXTENSION}）
        <input ref={input} type="file" className="sr-only" data-testid="pack-input" onChange={(e) => void choose(e.target.files?.[0])} disabled={busy} />
      </label>
      {busy && <span className="hint">　読み込んでいます…</span>}
      {msg && (
        <p className={`msg ${msg.ok ? 'msg-ok' : 'msg-ng'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      {plan && pack && (
        <div className="panel import-plan" data-testid="import-plan">
          <h3>読み込む問題の確認</h3>
          <ul>
            {plan.map((x) => (
              <li key={x.problem.id}>
                {x.problem.title}（{gradeInfo(x.problem.grade).label}・{x.problem.scoringEnabled ? '自動採点あり' : '採点なし'}）：
                {x.status === 'new' && <strong>新しく追加</strong>}
                {x.status === 'same' && <span>この端末に同じ内容があります（追加しません）</span>}
                {x.status === 'conflict' && <span className="error-text">同じIDで内容が違う問題がこの端末にあります（上書きしません）</span>}
              </li>
            ))}
          </ul>
          {conflicts > 0 && (
            <label className="switch">
              <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
              内容が違う{conflicts}問を、別の問題として追加する（この端末の問題はそのまま残ります）
            </label>
          )}
          <p className="hint">教材パックには、問題の設定・採点用の正解文・お手本のファイルだけが入っています。生徒の成績やログイン情報は入っていません。</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => void apply()} disabled={busy}>
              この端末に追加する
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setPack(null);
                setPlan(null);
              }}
            >
              やめる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
