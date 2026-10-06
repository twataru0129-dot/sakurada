/**
 * 検定モードの結果と記録。タイピングの記録（HistoryRecord）とは別に保存し、ランクの計算には使いません。
 * 記録には、実施したときの問題の改訂番号と成績をそのまま残します（あとから問題を編集しても再採点しません）。
 */
import { gradeInfo, isGrade, isScorable, isTimeOption, STANDARD_TIME_SECONDS, type ExamGrade, type ExamProblem } from './exam';
import { scoreExam, SCORING_VERSION, type ExamScore } from './examScoring';
import { countExamChars } from './exam';

export type ExamEndReason = 'time_up' | 'user_end';

export interface ExamRecord {
  id: string;
  startedAt: string;
  problemId: string;
  problemTitle: string;
  problemRevision: number;
  problemSource: 'builtin' | 'teacher';
  grade: ExamGrade;
  /** 選んだ制限時間（秒）。null は時間制限なし */
  timeLimitSeconds: number | null;
  elapsedMs: number;
  endReason: ExamEndReason;
  /** 正解文の最後まで入力した（採点ありのときだけ判定） */
  fullTextCompleted: boolean;
  scoringEnabled: boolean;
  inputChars: number;
  matchedChars: number | null;
  missCount: number | null;
  scoreChars: number | null;
  penaltyPerError: number;
  targetCharacters: number;
  /** 目安達成。標準10分の計測を完了し、採点ありのときだけ true / false。それ以外は null（判定しない） */
  achieved: boolean | null;
  scoringVersion: string;
}

export const EXAM_HISTORY_LIMIT = 100;

/** 結果画面用（記録＋その場だけ表示する入力本文と違い） */
export interface ExamOutcome {
  record: ExamRecord;
  /** 確定済みの入力本文（端末の画面表示用。クラウドには保存しません） */
  inputText: string;
  score: ExamScore | null;
  answerText: string | null;
  preview: boolean;
}

/** 10分基準の判定をする条件：標準10分を選び、時間いっぱいまで計測した */
export function isStandardMeasurement(timeLimitSeconds: number | null, endReason: ExamEndReason): boolean {
  return timeLimitSeconds === STANDARD_TIME_SECONDS && endReason === 'time_up';
}

export function buildExamOutcome(args: {
  id: string;
  startedAt: Date;
  problem: ExamProblem;
  timeLimitSeconds: number | null;
  elapsedMs: number;
  endReason: ExamEndReason;
  inputText: string;
  preview?: boolean;
}): ExamOutcome {
  const { problem } = args;
  const g = gradeInfo(problem.grade);
  const scorable = isScorable(problem);
  const score = scorable ? scoreExam(problem.answerText!, args.inputText, g.penaltyPerError) : null;
  const standard = isStandardMeasurement(args.timeLimitSeconds, args.endReason);
  const record: ExamRecord = {
    id: args.id,
    startedAt: args.startedAt.toISOString(),
    problemId: problem.id,
    problemTitle: problem.title,
    problemRevision: problem.revision,
    problemSource: problem.source,
    grade: problem.grade,
    timeLimitSeconds: args.timeLimitSeconds,
    elapsedMs: Math.max(0, Math.round(args.elapsedMs)),
    endReason: args.endReason,
    fullTextCompleted: score?.reachedEnd ?? false,
    scoringEnabled: scorable,
    inputChars: score ? score.inputChars : countExamChars(args.inputText),
    matchedChars: score ? score.matchedChars : null,
    missCount: score ? score.missCount : null,
    scoreChars: score ? score.scoreChars : null,
    penaltyPerError: g.penaltyPerError,
    targetCharacters: g.targetCharacters,
    achieved: score && standard ? score.scoreChars >= g.targetCharacters : null,
    scoringVersion: SCORING_VERSION,
  };
  return { record, inputText: args.inputText, score, answerText: scorable ? problem.answerText : null, preview: args.preview ?? false };
}

/** 終わりかたの表示 */
export function examEndLabel(r: Pick<ExamRecord, 'timeLimitSeconds' | 'endReason' | 'fullTextCompleted'>): string {
  if (r.endReason === 'time_up') return r.timeLimitSeconds === STANDARD_TIME_SECONDS ? '10分の計測を完了' : '時間いっぱいまで練習';
  if (r.fullTextCompleted) return '全文入力完了';
  return r.timeLimitSeconds === null ? '終了（時間制限なし）' : '途中終了';
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isNumOrNull = (v: unknown) => v === null || isNum(v);

/** 保存されていた値を検証して記録の形にします。正しくなければ null */
export function parseExamRecord(raw: unknown): ExamRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0 || r.id.length > 64) return null;
  if (typeof r.startedAt !== 'string' || Number.isNaN(Date.parse(r.startedAt))) return null;
  if (typeof r.problemId !== 'string' || r.problemId.length === 0 || r.problemId.length > 80) return null;
  if (typeof r.problemTitle !== 'string' || r.problemTitle.length > 200) return null;
  if (!isNum(r.problemRevision)) return null;
  if (r.problemSource !== 'builtin' && r.problemSource !== 'teacher') return null;
  if (!isGrade(r.grade)) return null;
  if (!isTimeOption(r.timeLimitSeconds ?? null)) return null;
  if (r.endReason !== 'time_up' && r.endReason !== 'user_end') return null;
  if (typeof r.scoringEnabled !== 'boolean' || typeof r.fullTextCompleted !== 'boolean') return null;
  for (const k of ['elapsedMs', 'inputChars', 'penaltyPerError', 'targetCharacters'] as const) if (!isNum(r[k])) return null;
  for (const k of ['matchedChars', 'missCount', 'scoreChars'] as const) if (!isNumOrNull(r[k] ?? null)) return null;
  if (!(r.achieved === null || r.achieved === undefined || typeof r.achieved === 'boolean')) return null;
  return {
    id: r.id,
    startedAt: r.startedAt,
    problemId: r.problemId,
    problemTitle: r.problemTitle,
    problemRevision: r.problemRevision as number,
    problemSource: r.problemSource,
    grade: r.grade,
    timeLimitSeconds: (r.timeLimitSeconds ?? null) as number | null,
    elapsedMs: r.elapsedMs as number,
    endReason: r.endReason,
    fullTextCompleted: r.fullTextCompleted,
    scoringEnabled: r.scoringEnabled,
    inputChars: r.inputChars as number,
    matchedChars: (r.matchedChars ?? null) as number | null,
    missCount: (r.missCount ?? null) as number | null,
    scoreChars: (r.scoreChars ?? null) as number | null,
    penaltyPerError: r.penaltyPerError as number,
    targetCharacters: r.targetCharacters as number,
    achieved: (r.achieved ?? null) as boolean | null,
    scoringVersion: typeof r.scoringVersion === 'string' ? r.scoringVersion : SCORING_VERSION,
  };
}

export function mergeExamRecords(...lists: ExamRecord[][]): ExamRecord[] {
  const byId = new Map<string, ExamRecord>();
  for (const list of lists) for (const r of list) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, EXAM_HISTORY_LIMIT);
}
