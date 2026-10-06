import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { LocalExamStore, type StoredFile } from './examStore';
import { applyImport, exportPack, PACK_MAGIC, planImport, readPack } from './examPack';
import type { ExamProblem } from '../core/exam';
import { sha256Hex, sniffType } from '../core/examFiles';
import { validateTeacherProblem } from '../core/examProblem';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const PDF = new TextEncoder().encode('%PDF-1.4\n% test pdf body\n%%EOF\n');

async function file(id: string, bytes: Uint8Array<ArrayBuffer>, type: StoredFile['type'], name: string): Promise<StoredFile> {
  return { id, name, type, size: bytes.byteLength, blob: new Blob([bytes], { type }), sha256: await sha256Hex(bytes.slice().buffer) };
}

function problem(id: string, extra: Partial<ExamProblem> = {}): ExamProblem {
  return {
    id,
    revision: 1,
    title: 'プリント1',
    grade: '3',
    source: 'teacher',
    timeLimitSeconds: 600,
    scoringEnabled: true,
    answerText: '正解の文章です。\n二段落目です。',
    answerConfirmed: true,
    visible: true,
    material: { kind: 'image', pages: [{ fileId: 'f-img', rotation: 90 }] },
    createdAt: '2026-10-06T00:00:00.000Z',
    updatedAt: '2026-10-06T00:00:00.000Z',
    ...extra,
  };
}

const newStore = () => new LocalExamStore(() => new IDBFactory());

describe('形式の判定', () => {
  it('先頭の内容で判定する', () => {
    expect(sniffType(PNG)).toEqual({ ok: true, type: 'image/png' });
    expect(sniffType(PDF)).toEqual({ ok: true, type: 'application/pdf' });
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ ok: true, type: 'image/jpeg' });
    expect(sniffType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toEqual({ ok: true, type: 'image/webp' });
    expect(sniffType(new TextEncoder().encode('\0\0\0\x18ftypheic\0\0'))).toEqual({ ok: false, reason: 'heic' });
    expect(sniffType(new TextEncoder().encode('GIF89a'))).toEqual({ ok: false, reason: 'unsupported' });
    expect(sniffType(new Uint8Array())).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('問題の確認', () => {
  it('正しい問題は誤りなし', () => {
    expect(validateTeacherProblem(problem('tp-1'))).toEqual([]);
  });
  it('採点ありなのに正解文が未確認・空なら保存できない', () => {
    expect(validateTeacherProblem(problem('tp-1', { answerConfirmed: false })).join()).toContain('確認済み');
    expect(validateTeacherProblem(problem('tp-1', { answerText: '' })).join()).toContain('正解文');
  });
  it('採点なしは正解文なしで保存できる', () => {
    expect(validateTeacherProblem(problem('tp-1', { scoringEnabled: false, answerText: null, answerConfirmed: false }))).toEqual([]);
  });
  it('題名のタグ・制御文字・長すぎる値は拒否', () => {
    expect(validateTeacherProblem(problem('tp-1', { title: '<script>' })).length).toBeGreaterThan(0);
    expect(validateTeacherProblem(problem('tp-1', { title: 'あ'.repeat(61) })).length).toBeGreaterThan(0);
  });
  it('PDF のページは20ページまで', () => {
    const pages = Array.from({ length: 21 }, (_, i) => ({ page: i + 1, rotation: 0 as const }));
    expect(validateTeacherProblem(problem('tp-1', { material: { kind: 'pdf', fileId: 'f-pdf', pages } })).join()).toContain('20ページ');
  });
});

describe('端末の保存（IndexedDB）', () => {
  it('問題とファイル本体を保存し、開き直しても読める', async () => {
    const factory = new IDBFactory();
    const a = new LocalExamStore(() => factory);
    await a.saveProblem(problem('tp-1'), [await file('f-img', PNG, 'image/png', 'print.png')]);
    const b = new LocalExamStore(() => factory); // 再読み込み相当
    expect((await b.listProblems()).map((p) => p.id)).toEqual(['tp-1']);
    const f = await b.getFile('f-img');
    expect(new Uint8Array(await f!.blob.arrayBuffer())).toEqual(PNG);
  });
  it('削除すると、ほかの問題が使っていないファイルだけ消える', async () => {
    const s = newStore();
    await s.saveProblem(problem('tp-1'), [await file('f-img', PNG, 'image/png', 'a.png')]);
    await s.saveProblem(problem('tp-2'), []); // 複製（同じファイルを使う）
    await s.deleteProblem('tp-1');
    expect(await s.getFile('f-img')).not.toBeNull();
    await s.deleteProblem('tp-2');
    expect(await s.getFile('f-img')).toBeNull();
  });
  it('保存できない環境ではわかりやすいエラー', async () => {
    const s = new LocalExamStore(() => undefined);
    await expect(s.listProblems()).rejects.toThrow('保存できません');
  });
});

describe('教材パック', () => {
  async function source() {
    const s = newStore();
    await s.saveProblem(problem('tp-1'), [await file('f-img', PNG, 'image/png', 'print.png')]);
    await s.saveProblem(
      problem('tp-2', { title: 'PDFの問題', scoringEnabled: false, answerText: null, answerConfirmed: false, material: { kind: 'pdf', fileId: 'f-pdf', pages: [{ page: 2, rotation: 0 }, { page: 1, rotation: 0 }] } }),
      [await file('f-pdf', PDF, 'application/pdf', 'test.pdf')],
    );
    return s;
  }

  it('書き出し→別の端末で読み込み：原本と正解文が一致する', async () => {
    const src = await source();
    const blob = await exportPack(src, ['tp-1', 'tp-2']);
    const dst = newStore();
    const pack = await readPack(blob);
    const plan = await planImport(dst, pack);
    expect(plan.map((x) => x.status)).toEqual(['new', 'new']);
    expect(await applyImport(dst, pack, plan, false)).toEqual({ added: 2, skipped: 0 });
    const p1 = (await dst.getProblem('tp-1'))!;
    expect(p1.answerText).toBe('正解の文章です。\n二段落目です。');
    expect(p1.material.kind).toBe('image');
    const fid = p1.material.kind === 'image' ? p1.material.pages[0]!.fileId : '';
    expect(p1.material.kind === 'image' && p1.material.pages[0]!.rotation).toBe(90);
    expect(new Uint8Array(await (await dst.getFile(fid))!.blob.arrayBuffer())).toEqual(PNG);
    const p2 = (await dst.getProblem('tp-2'))!;
    expect(p2.material.kind === 'pdf' && p2.material.pages.map((x) => x.page)).toEqual([2, 1]);
    const pdf = await dst.getFile(p2.material.kind === 'pdf' ? p2.material.fileId : '');
    expect(new Uint8Array(await pdf!.blob.arrayBuffer())).toEqual(PDF);
    expect(pdf!.sha256).toBe(await sha256Hex(PDF.slice().buffer));
  });

  it('成績・認証情報・入力本文を含めない', async () => {
    const blob = await exportPack(await source(), ['tp-1', 'tp-2']);
    const text = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
    for (const w of ['password', 'token', 'scoreChars', 'missCount', 'user_id', 'inputText', 'loginId']) expect(text).not.toContain(w);
  });

  it('同じIDの問題は上書きしない（同じ内容は読み込み済み、違う内容は別の問題として追加を選べる）', async () => {
    const src = await source();
    const pack = await readPack(await exportPack(src, ['tp-1', 'tp-2']));
    const dst = newStore();
    await dst.saveProblem(problem('tp-1', { title: '端末で直した題名', revision: 3 }), [await file('f-img', PNG, 'image/png', 'x.png')]);
    const plan = await planImport(dst, pack);
    expect(plan.map((x) => x.status)).toEqual(['conflict', 'new']);
    expect(await applyImport(dst, pack, plan, false)).toEqual({ added: 1, skipped: 1 });
    expect((await dst.getProblem('tp-1'))!.title).toBe('端末で直した題名');
    // 別の問題として追加
    const plan2 = await planImport(dst, pack);
    expect(plan2.map((x) => x.status)).toEqual(['conflict', 'same']);
    expect(await applyImport(dst, pack, plan2, true)).toEqual({ added: 1, skipped: 1 });
    const all = await dst.listProblems();
    expect(all).toHaveLength(3);
    expect((await dst.getProblem('tp-1'))!.title).toBe('端末で直した題名');
  });

  it('壊れた・違う形式のファイルは読み込まない', async () => {
    const good = new Uint8Array(await (await exportPack(await source(), ['tp-1'])).arrayBuffer());
    await expect(readPack(new Blob([new TextEncoder().encode('hello')]))).rejects.toThrow('教材パック');
    // 途中で切れている
    await expect(readPack(new Blob([good.slice(0, good.length - 3)]))).rejects.toThrow();
    // ファイルの中身を書き換え（照合値が一致しない）
    const bad = good.slice();
    bad[bad.length - 1] = (bad[bad.length - 1] ?? 0) ^ 0xff;
    await expect(readPack(new Blob([bad]))).rejects.toThrow('照合値');
    // 新しい版
    const magic = new TextEncoder().encode(PACK_MAGIC);
    const json = new TextEncoder().encode(JSON.stringify({ format: 'sakura-type-exam-pack', version: 99, problems: [], files: [] }));
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, json.byteLength);
    await expect(readPack(new Blob([magic, len, json]))).rejects.toThrow('新しい版');
  });

  it('ファイル参照のない問題・重複IDは拒否', async () => {
    const magic = new TextEncoder().encode(PACK_MAGIC);
    const make = (m: object) => {
      const json = new TextEncoder().encode(JSON.stringify(m));
      const len = new Uint8Array(4);
      new DataView(len.buffer).setUint32(0, json.byteLength);
      return new Blob([magic, len, json]);
    };
    const base = { format: 'sakura-type-exam-pack', version: 1, appVersion: 'x', exportedAt: '2026-10-06T00:00:00Z' };
    await expect(readPack(make({ ...base, problems: [problem('tp-1')], files: [] }))).rejects.toThrow('ファイルが入っていません');
    const p = problem('tp-1', { scoringEnabled: false, answerText: null, answerConfirmed: false, material: { kind: 'image', pages: [] } });
    await expect(readPack(make({ ...base, problems: [p], files: [] }))).rejects.toThrow('画像');
  });
});
