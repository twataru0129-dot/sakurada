import { useCallback, useEffect, useState } from 'react';
import { deleteMaterial, listMaterials, listMyClasses, saveMaterial, type ClassRow, type MaterialRow } from '../../data/cloud';
import { validateQuestion } from '../../core/validateQuestions';
import { RomajiMatcher } from '../../core/romaji';
import { DIFFICULTY_LABEL } from '../../core/questions';

type Draft = Omit<MaterialRow, 'id' | 'ownerId'> & { id?: string };

const EMPTY: Draft = { kind: 'romaji', text: '', reading: '', theme: '', difficulty: 1, isPublished: true, classIds: [] };

/** 教材の入力内容を確かめます（実行できない教材は登録できません。データベース側でも同じ確認をします） */
export function validateDraft(d: Draft): string[] {
  const errors: string[] = [];
  const text = d.text.trim();
  const reading = d.reading.trim();
  if (!d.theme.trim()) errors.push('テーマを入力してください');
  if ([...d.theme.trim()].length > 30) errors.push('テーマは30文字までです');
  if (/[<>]/.test(d.theme)) errors.push('テーマに < > は使えません');
  if (/[<>]/.test(text)) errors.push('本文に < > は使えません');
  if (d.kind === 'romaji') {
    if ([...text].length > 60) errors.push('ローマ字の問題の本文は60文字までです');
    if (reading && !/^[ぁ-ゖー、。！？「」・〜0-9]+$/u.test(reading)) errors.push('読みはひらがなで入力してください（カタカナや漢字は使えません）');
  } else if ([...text].length > 300) {
    errors.push('文章は300文字までです');
  }
  errors.push(
    ...validateQuestion(
      { id: 'draft', kind: d.kind, category: 'teacher', theme: d.theme, difficulty: d.difficulty, text, reading },
      { builtin: false },
    ),
  );
  return [...new Set(errors)];
}

export function MaterialsPanel({ teacherId }: { teacherId: string }) {
  const [items, setItems] = useState<MaterialRow[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([listMaterials(), listMyClasses(teacherId)]);
      setItems(m);
      setClasses(c);
    } catch {
      setItems([]);
      setMsg({ ok: false, text: '教材を読み込めませんでした。' });
    }
  }, [teacherId]);
  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const d = { ...draft, text: draft.text.trim(), reading: draft.reading.trim(), theme: draft.theme.trim() };
    const errs = validateDraft(d);
    setErrors(errs);
    if (errs.length) return;
    try {
      await saveMaterial(d);
      setMsg({ ok: true, text: d.id ? '教材を更新しました' : '教材を登録しました' });
      setDraft({ ...EMPTY, kind: d.kind, theme: d.theme, classIds: d.classIds });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '保存できませんでした' });
    }
  };

  let preview = '';
  if (draft.kind === 'romaji' && draft.reading && validateDraft(draft).length === 0) {
    try {
      preview = new RomajiMatcher(draft.reading.trim()).remaining();
    } catch {
      preview = '';
    }
  }

  return (
    <>
      {msg && (
        <p className={`msg ${msg.ok ? 'msg-ok' : 'msg-ng'}`} role="status">
          {msg.text}
        </p>
      )}
      <section className="panel">
        <h2>{draft.id ? '教材を編集' : '教材を登録'}</h2>
        <div className="field-inline" style={{ marginBottom: 12 }}>
          <label className="choice">
            <input type="radio" name="mk" checked={draft.kind === 'romaji'} onChange={() => setDraft({ ...draft, kind: 'romaji' })} />
            ローマ字入力（単語・短文）
          </label>
          <label className="choice">
            <input type="radio" name="mk" checked={draft.kind === 'sentence'} onChange={() => setDraft({ ...draft, kind: 'sentence' })} />
            文章入力（変換あり）
          </label>
        </div>
        <div className="field">
          <label htmlFor="m-text">本文（画面に表示する文）</label>
          {draft.kind === 'romaji' ? (
            <input id="m-text" type="text" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          ) : (
            <textarea id="m-text" rows={4} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          )}
        </div>
        <div className="field">
          <label htmlFor="m-reading">読み（ひらがな）{draft.kind === 'romaji' ? '【必須】' : '【任意・読みガイドに使います】'}</label>
          <textarea id="m-reading" rows={draft.kind === 'romaji' ? 1 : 3} value={draft.reading} onChange={(e) => setDraft({ ...draft, reading: e.target.value })} />
          {preview && <span className="hint">ローマ字の例：<span className="mono">{preview}</span></span>}
        </div>
        <div className="grid grid-3">
          <div className="field">
            <label htmlFor="m-theme">テーマ</label>
            <input id="m-theme" type="text" maxLength={30} value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })} placeholder="例：職場実習" />
          </div>
          <div className="field">
            <label htmlFor="m-diff">難易度</label>
            <select id="m-diff" value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: Number(e.target.value) as 1 | 2 | 3 })}>
              {([1, 2, 3] as const).map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABEL[draft.kind][d]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span style={{ fontWeight: 600 }}>公開</span>
            <label className="switch">
              <input type="checkbox" checked={draft.isPublished} onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })} />
              {draft.isPublished ? '公開（生徒が使える）' : '非公開'}
            </label>
          </div>
        </div>
        <fieldset>
          <legend>使えるクラス</legend>
          {classes.length === 0 && <p className="hint">担当クラスがありません。</p>}
          {classes.map((c) => (
            <label key={c.id} className="switch" style={{ marginRight: 16 }}>
              <input
                type="checkbox"
                checked={draft.classIds.includes(c.id)}
                onChange={(e) =>
                  setDraft({ ...draft, classIds: e.target.checked ? [...draft.classIds, c.id] : draft.classIds.filter((x) => x !== c.id) })
                }
              />
              {c.name}
            </label>
          ))}
        </fieldset>
        {errors.length > 0 && (
          <ul className="msg msg-ng" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => void submit()}>
            {draft.id ? '更新する' : '登録する'}
          </button>
          {draft.id && (
            <button type="button" className="btn btn-quiet" onClick={() => setDraft(EMPTY)}>
              編集をやめる
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>登録した教材</h2>
        {items === null && <p>読み込んでいます…</p>}
        {items && items.length === 0 && <p>まだ教材はありません。</p>}
        {items && items.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>種類</th>
                  <th>本文</th>
                  <th>テーマ</th>
                  <th>難易度</th>
                  <th>公開</th>
                  <th>クラス</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id}>
                    <td>{m.kind === 'romaji' ? 'ローマ字' : '文章'}</td>
                    <td style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>{m.text}</td>
                    <td>{m.theme}</td>
                    <td>{m.difficulty}</td>
                    <td>{m.isPublished ? '公開' : '非公開'}</td>
                    <td>{m.classIds.map((id) => classes.find((c) => c.id === id)?.name ?? '（他の先生のクラス）').join('、') || '—'}</td>
                    <td>
                      {m.ownerId === teacherId ? (
                        <div className="btn-row">
                          <button type="button" className="btn btn-small" onClick={() => setDraft({ ...m })}>
                            編集
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-small"
                            onClick={() => {
                              if (window.confirm('この教材を削除しますか？')) void deleteMaterial(m.id).then(load);
                            }}
                          >
                            削除
                          </button>
                        </div>
                      ) : (
                        <span className="hint">ほかの先生の教材</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
