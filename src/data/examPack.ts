/**
 * 教材パック（先生の追加問題の書き出し・読み込み）。
 *
 * 1つのファイルに、問題の設定・採点用の正解文・お手本の画像／PDF 本体をまとめます。
 * 生徒の成績・入力本文・ログイン情報・認証情報は含めません。
 *
 * 形式（拡張子 .sakuraexam）：
 *   "SAKURA-EXAM-PACK\n"（17バイト） + 目録の長さ（4バイト・ビッグエンディアン） + 目録（UTF-8 の JSON） + ファイル本体を順に連結
 *   目録の files[].offset / size は、ファイル本体の部分の先頭からの位置です。sha256 で中身を照合します。
 */
import { APP_VERSION } from '../config';
import type { ExamProblem } from '../core/exam';
import { ALLOWED_TYPES, MAX_FILE_BYTES, MAX_PACK_BYTES, MAX_TEACHER_PROBLEMS, sha256Hex, sniffType, type MaterialFileType } from '../core/examFiles';
import { isFileId, materialFileIds, newFileId, newTeacherProblemId, validateTeacherProblem } from '../core/examProblem';
import type { ExamProblemStore, StoredFile } from './examStore';

export const PACK_MAGIC = 'SAKURA-EXAM-PACK\n';
export const PACK_FORMAT = 'sakura-type-exam-pack';
export const PACK_VERSION = 1;
export const PACK_EXTENSION = '.sakuraexam';

interface PackFileEntry {
  id: string;
  name: string;
  type: MaterialFileType;
  size: number;
  offset: number;
  sha256: string | null;
}

interface PackManifest {
  format: typeof PACK_FORMAT;
  version: number;
  appVersion: string;
  exportedAt: string;
  problems: PackProblem[];
  files: PackFileEntry[];
}

/** 教材パックに入れる問題の項目（決められた項目だけを書き出します） */
type PackProblem = Pick<
  ExamProblem,
  'id' | 'revision' | 'title' | 'grade' | 'timeLimitSeconds' | 'scoringEnabled' | 'answerText' | 'answerConfirmed' | 'visible' | 'material' | 'createdAt' | 'updatedAt'
>;

function toPackProblem(p: ExamProblem): PackProblem {
  return {
    id: p.id,
    revision: p.revision,
    title: p.title,
    grade: p.grade,
    timeLimitSeconds: p.timeLimitSeconds,
    scoringEnabled: p.scoringEnabled,
    answerText: p.answerText,
    answerConfirmed: p.answerConfirmed,
    visible: p.visible,
    material: p.material,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** 選んだ問題を教材パックにします */
export async function exportPack(store: ExamProblemStore, problemIds: string[], now = new Date()): Promise<Blob> {
  const problems: ExamProblem[] = [];
  for (const id of problemIds) {
    const p = await store.getProblem(id);
    if (p && p.source === 'teacher') problems.push(p);
  }
  if (problems.length === 0) throw new Error('書き出す問題を選んでください');
  const files: PackFileEntry[] = [];
  const blobs: Blob[] = [];
  let offset = 0;
  for (const fid of [...new Set(problems.flatMap((p) => materialFileIds(p.material)))]) {
    const f = await store.getFile(fid);
    if (!f) throw new Error('お手本のファイルが見つからない問題があります。問題を開き直して、お手本を選び直してください。');
    const buf = await f.blob.arrayBuffer();
    files.push({ id: f.id, name: f.name, type: f.type, size: buf.byteLength, offset, sha256: f.sha256 ?? (await sha256Hex(buf)) });
    blobs.push(new Blob([buf]));
    offset += buf.byteLength;
  }
  const manifest: PackManifest = {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now.toISOString(),
    problems: problems.map(toPackProblem),
    files,
  };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, json.byteLength, false);
  return new Blob([new TextEncoder().encode(PACK_MAGIC), len, json, ...blobs], { type: 'application/octet-stream' });
}

export class PackError extends Error {}

export interface PackContents {
  exportedAt: string;
  appVersion: string;
  problems: ExamProblem[];
  files: StoredFile[];
}

/** 教材パックを読み、形式・容量・ファイル参照・重複 ID・中身の一致を確かめます（まだ保存はしません） */
export async function readPack(file: Blob): Promise<PackContents> {
  if (file.size > MAX_PACK_BYTES) throw new PackError('教材パックの容量が大きすぎます。問題を分けて書き出してください。');
  const buf = new Uint8Array(await file.arrayBuffer());
  const magic = new TextEncoder().encode(PACK_MAGIC);
  if (buf.length < magic.length + 4 || !magic.every((b, i) => buf[i] === b)) {
    throw new PackError('桜打の教材パック（.sakuraexam）ではないか、ファイルが壊れています。');
  }
  const len = new DataView(buf.buffer, buf.byteOffset + magic.length, 4).getUint32(0, false);
  const start = magic.length + 4;
  if (len === 0 || start + len > buf.length || len > 20 * 1024 * 1024) throw new PackError('教材パックの目録が壊れています。');
  let manifest: PackManifest;
  try {
    manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(start, start + len))) as PackManifest;
  } catch {
    throw new PackError('教材パックの目録を読めません（ファイルが壊れている可能性があります）。');
  }
  if (!manifest || manifest.format !== PACK_FORMAT) throw new PackError('桜打の教材パックではありません。');
  if (typeof manifest.version !== 'number' || manifest.version > PACK_VERSION) {
    throw new PackError('新しい版のアプリで作られた教材パックです。アプリを更新してから読み込んでください。');
  }
  if (!Array.isArray(manifest.problems) || !Array.isArray(manifest.files)) throw new PackError('教材パックの目録が壊れています。');
  if (manifest.problems.length === 0) throw new PackError('教材パックに問題が入っていません。');
  if (manifest.problems.length > MAX_TEACHER_PROBLEMS) throw new PackError('教材パックの問題の数が多すぎます。');
  const dataStart = start + len;
  const dataLen = buf.length - dataStart;

  // ファイル
  const files: StoredFile[] = [];
  const fileIds = new Set<string>();
  let expectedOffset = 0;
  for (const f of manifest.files) {
    if (!f || !isFileId(f.id) || fileIds.has(f.id)) throw new PackError('教材パックのファイルの情報が正しくありません（IDの重複など）。');
    fileIds.add(f.id);
    if (!ALLOWED_TYPES.includes(f.type)) throw new PackError('教材パックに対応していない形式のファイルが含まれています。');
    if (!Number.isInteger(f.size) || f.size <= 0 || f.size > MAX_FILE_BYTES) throw new PackError('教材パックに容量の上限を超えるファイルが含まれています。');
    if (f.offset !== expectedOffset || f.offset + f.size > dataLen) throw new PackError('教材パックのファイルの位置が正しくありません（ファイルが途中で切れている可能性があります）。');
    expectedOffset += f.size;
    const bytes = buf.slice(dataStart + f.offset, dataStart + f.offset + f.size);
    const sniff = sniffType(bytes.subarray(0, 1024));
    if (!sniff.ok || sniff.type !== f.type) throw new PackError('教材パックのファイルの中身が、申告された形式と一致しません。');
    const hash = await sha256Hex(bytes.buffer);
    if (f.sha256 && hash && hash !== f.sha256) throw new PackError('教材パックのファイルの中身が壊れています（照合値が一致しません）。');
    const name = typeof f.name === 'string' ? f.name.slice(0, 120) : 'file';
    files.push({ id: f.id, name, type: f.type, size: f.size, blob: new Blob([bytes], { type: f.type }), sha256: hash ?? f.sha256 ?? null });
  }
  if (expectedOffset !== dataLen) throw new PackError('教材パックに余分なデータがあります（ファイルが壊れている可能性があります）。');

  // 問題
  const problems: ExamProblem[] = [];
  const problemIds = new Set<string>();
  for (const raw of manifest.problems) {
    const p = { ...(raw as object), source: 'teacher' } as ExamProblem;
    const errs = validateTeacherProblem(p);
    if (errs.length > 0) throw new PackError(`教材パックの問題「${String((raw as { title?: unknown })?.title ?? '')}」の内容が正しくありません：${errs[0]}`);
    if (problemIds.has(p.id)) throw new PackError('教材パックの中に、同じIDの問題が2つあります。');
    problemIds.add(p.id);
    for (const fid of materialFileIds(p.material)) {
      if (!fileIds.has(fid)) throw new PackError(`教材パックの問題「${p.title}」のお手本のファイルが入っていません。`);
      const f = files.find((x) => x.id === fid)!;
      if ((p.material.kind === 'pdf') !== (f.type === 'application/pdf')) throw new PackError(`教材パックの問題「${p.title}」のお手本の形式が正しくありません。`);
    }
    problems.push(p);
  }
  return { exportedAt: String(manifest.exportedAt ?? ''), appVersion: String(manifest.appVersion ?? ''), problems, files };
}

/** お手本の比較用の値（ファイル ID ではなく、ファイルの中身の照合値で比べます） */
async function materialSignature(p: ExamProblem, sha: (fid: string) => Promise<string>): Promise<string> {
  const m = p.material;
  if (m.kind === 'pdf') return JSON.stringify(['pdf', await sha(m.fileId), m.pages]);
  if (m.kind === 'image') return JSON.stringify(['image', await Promise.all(m.pages.map(async (pg) => [await sha(pg.fileId), pg.rotation]))]);
  return 'text';
}

export type ImportStatus = 'new' | 'same' | 'conflict';

export interface ImportPlanItem {
  problem: ExamProblem;
  status: ImportStatus;
  /** 同じ ID の問題がこの端末にあるとき、その問題 */
  existing: ExamProblem | null;
}

/** この端末の問題と照らし合わせます（同じ ID：内容も同じなら same、違えば conflict） */
export async function planImport(store: ExamProblemStore, pack: PackContents): Promise<ImportPlanItem[]> {
  const out: ImportPlanItem[] = [];
  for (const p of pack.problems) {
    const existing = await store.getProblem(p.id);
    if (!existing) out.push({ problem: p, status: 'new', existing: null });
    else {
      const localSha = async (fid: string) => (await store.getFile(fid))?.sha256 ?? `missing:${fid}`;
      const packSha = async (fid: string) => pack.files.find((f) => f.id === fid)?.sha256 ?? `missing:${fid}`;
      const same =
        existing.revision === p.revision &&
        existing.title === p.title &&
        existing.grade === p.grade &&
        existing.timeLimitSeconds === p.timeLimitSeconds &&
        existing.scoringEnabled === p.scoringEnabled &&
        existing.answerConfirmed === p.answerConfirmed &&
        existing.answerText === p.answerText &&
        (await materialSignature(existing, localSha)) === (await materialSignature(p, packSha));
      out.push({ problem: p, status: same ? 'same' : 'conflict', existing });
    }
  }
  return out;
}

/**
 * 読み込みます。既存の問題は上書きしません。
 * - new：そのまま追加
 * - same：何もしない（読み込み済み）
 * - conflict：copyConflicts が true なら「別の問題（新しい ID）」として追加、false なら読み込まない
 * ファイルは、この端末の既存のファイルと混ざらないよう、新しい ID を付けて保存します。
 */
export async function applyImport(
  store: ExamProblemStore,
  pack: PackContents,
  plan: ImportPlanItem[],
  copyConflicts: boolean,
  now = new Date(),
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const item of plan) {
    if (item.status === 'same' || (item.status === 'conflict' && !copyConflicts)) {
      skipped++;
      continue;
    }
    const remap = new Map<string, string>();
    const newFiles: StoredFile[] = [];
    for (const fid of materialFileIds(item.problem.material)) {
      const f = pack.files.find((x) => x.id === fid)!;
      const nid = newFileId();
      remap.set(fid, nid);
      newFiles.push({ ...f, id: nid });
    }
    const m = item.problem.material;
    const material =
      m.kind === 'pdf'
        ? { ...m, fileId: remap.get(m.fileId)! }
        : m.kind === 'image'
          ? { ...m, pages: m.pages.map((pg) => ({ ...pg, fileId: remap.get(pg.fileId)! })) }
          : m;
    const p: ExamProblem =
      item.status === 'conflict'
        ? { ...item.problem, id: newTeacherProblemId(), revision: 1, title: item.problem.title, material, createdAt: now.toISOString(), updatedAt: now.toISOString() }
        : { ...item.problem, material };
    await store.saveProblem(p, newFiles);
    added++;
  }
  return { added, skipped };
}

export function packFileName(now = new Date()): string {
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `sakura-exam-pack-${d}${PACK_EXTENSION}`;
}
