/**
 * 文書作成モードの記録（v2.0.0）。タイピング・ゲーム・旧検定モードの記録とは別に保存し、ランクの計算には使いません。
 * 記録には成績の数値と、問題の ID・タイトル・改訂番号だけを残します。本人が入力した本文は記録に入れません
 * （本文は練習・全文確認・印刷・Word の保存のために、この端末の画面の中だけで扱います）。
 */
import type { ExamProblem } from './exam';
import { checkDocument, composeDocument, countDocChars, DOC_RULES_VERSION, sampleParagraphs, type DocumentCheck, type ParagraphInput } from './document';

export type DocStatus = 'completed' | 'quit';

export interface DocRecord {
  id: string;
  /** 開始した日時（実施日時） */
  startedAt: string;
  /** 完成・終了した日時 */
  finishedAt: string;
  problemId: string;
  problemTitle: string;
  problemRevision: number;
  problemSource: 'builtin' | 'teacher';
  status: DocStatus;
  /** 開始から完成（または終了）までの時間 */
  elapsedMs: number;
  /** 入力文字数（改行を除く。空白は数えます） */
  inputChars: number;
  paragraphCount: number;
  /** 最終確認での文章の誤り（違う・余分・抜けの合計と内訳） */
  textErrors: number;
  wrongChars: number;
  extraChars: number;
  missingChars: number;
  /** 最終確認での空白の誤り・改行の誤り */
  spaceErrors: number;
  breakErrors: number;
  /** 判定の規則の版 */
  rulesVersion: string;
}

export const DOC_HISTORY_LIMIT = 100;

/** 完成画面用（記録＋その場だけ使う本文とチェックの結果。本文はクラウドに送りません） */
export interface DocOutcome {
  record: DocRecord;
  problem: ExamProblem;
  sample: string;
  inputs: ParagraphInput[];
  /** 本人が入力した全文（改行・空白はそのまま） */
  text: string;
  check: DocumentCheck;
  preview: boolean;
}

export function buildDocOutcome(args: {
  id: string;
  startedAt: Date;
  finishedAt: Date;
  problem: ExamProblem;
  sample: string;
  inputs: ParagraphInput[];
  elapsedMs: number;
  status: DocStatus;
  preview?: boolean;
}): DocOutcome {
  const text = composeDocument(args.inputs);
  const check = checkDocument(args.sample, args.inputs, true);
  const record: DocRecord = {
    id: args.id,
    startedAt: args.startedAt.toISOString(),
    finishedAt: args.finishedAt.toISOString(),
    problemId: args.problem.id,
    problemTitle: args.problem.title,
    problemRevision: args.problem.revision,
    problemSource: args.problem.source,
    status: args.status,
    elapsedMs: Math.max(0, Math.round(args.elapsedMs)),
    inputChars: countDocChars(text),
    paragraphCount: sampleParagraphs(args.sample).length,
    textErrors: check.textErrors,
    wrongChars: check.wrong,
    extraChars: check.extra,
    missingChars: check.missing,
    spaceErrors: check.spaceErrors,
    breakErrors: check.breakErrors,
    rulesVersion: DOC_RULES_VERSION,
  };
  return { record, problem: args.problem, sample: args.sample, inputs: args.inputs.map((p) => ({ ...p })), text, check, preview: args.preview ?? false };
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000;
const isDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** 保存されていた値を検証して記録の形にします。正しくなければ null */
export function parseDocRecord(raw: unknown): DocRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0 || r.id.length > 64) return null;
  if (!isDate(r.startedAt) || !isDate(r.finishedAt)) return null;
  if (typeof r.problemId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(r.problemId)) return null;
  if (typeof r.problemTitle !== 'string' || r.problemTitle.length === 0 || r.problemTitle.length > 200) return null;
  if (!isCount(r.problemRevision) || (r.problemRevision as number) < 1) return null;
  if (r.problemSource !== 'builtin' && r.problemSource !== 'teacher') return null;
  if (r.status !== 'completed' && r.status !== 'quit') return null;
  if (typeof r.elapsedMs !== 'number' || !Number.isFinite(r.elapsedMs) || r.elapsedMs < 0) return null;
  for (const k of ['inputChars', 'paragraphCount', 'textErrors', 'wrongChars', 'extraChars', 'missingChars', 'spaceErrors', 'breakErrors'] as const) if (!isCount(r[k])) return null;
  if (typeof r.rulesVersion !== 'string' || !r.rulesVersion) return null;
  return {
    id: r.id,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    problemId: r.problemId,
    problemTitle: r.problemTitle,
    problemRevision: r.problemRevision as number,
    problemSource: r.problemSource,
    status: r.status,
    elapsedMs: r.elapsedMs,
    inputChars: r.inputChars as number,
    paragraphCount: r.paragraphCount as number,
    textErrors: r.textErrors as number,
    wrongChars: r.wrongChars as number,
    extraChars: r.extraChars as number,
    missingChars: r.missingChars as number,
    spaceErrors: r.spaceErrors as number,
    breakErrors: r.breakErrors as number,
    rulesVersion: r.rulesVersion,
  };
}

export function mergeDocRecords(...lists: DocRecord[][]): DocRecord[] {
  const byId = new Map<string, DocRecord>();
  for (const list of lists) for (const r of list) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, DOC_HISTORY_LIMIT);
}
