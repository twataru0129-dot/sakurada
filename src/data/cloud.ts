/**
 * 認証・記録保存（Supabase）との接続。
 *
 * - ログイン状態はメモリーだけに置き、ブラウザ（localStorage など）には保存しません。
 *   タブを閉じる・再読み込みするとログアウトした状態になります（共有端末向け）。
 * - 生徒はメールアドレスを持たないため、ID を内部用のアドレス（例: sakura01@id.sakura-type.invalid）に変換して
 *   Supabase Auth のパスワード認証を使います。このアドレスにメールが送られることはありません。
 */
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { cloudConfig, isCloudConfigured } from '../config';
import { loginIdToEmail, normalizeLoginId, validateLoginId } from '../../supabase/functions/_shared/accountRules';
import type { PracticeConfig, PracticeResult } from '../core/result';
import type { Question } from '../core/questions';
import { HISTORY_LIMIT, type HistoryRecord } from '../core/history';
import { sanitizeSettings, settingsToJson, type LearningSettings } from '../core/settings';
import { EXAM_HISTORY_LIMIT, parseExamRecord, type ExamRecord } from '../core/examResult';
import { GAME_HISTORY_LIMIT, parseGameResult, type GameResult } from '../core/game/result';

const memory = new Map<string, string>();
const memoryStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
};

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient | null {
  if (!isCloudConfigured) return null;
  if (!client) {
    client = createClient(cloudConfig.url, cloudConfig.anonKey, {
      auth: {
        storage: memoryStorage,
        storageKey: 'sakura-type-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

function need(): SupabaseClient {
  const c = getClient();
  if (!c) throw new Error('ログイン機能が設定されていません');
  return c;
}

export type Role = 'student' | 'teacher';

export interface Profile {
  id: string;
  loginId: string;
  displayName: string;
  role: Role;
  status: 'active' | 'suspended';
}

export type LoginResult =
  | { status: 'ok'; profile: Profile }
  | { status: 'mfa_required'; profile: Profile; factorId: string }
  | { status: 'mfa_enroll'; profile: Profile }
  | { status: 'error'; message: string };

const GENERIC_LOGIN_ERROR = 'IDまたはパスワードが違います。';

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    loginId: String(row.login_id),
    displayName: String(row.display_name),
    role: row.role === 'teacher' ? 'teacher' : 'student',
    status: row.status === 'suspended' ? 'suspended' : 'active',
  };
}

export async function fetchOwnProfile(): Promise<Profile | null> {
  const c = need();
  const { data: u } = await c.auth.getUser();
  if (!u.user) return null;
  const { data } = await c.from('profiles').select('id, login_id, display_name, role, status').eq('id', u.user.id).maybeSingle();
  return data ? mapProfile(data) : null;
}

export async function loginWithId(rawId: string, password: string): Promise<LoginResult> {
  const c = need();
  const loginId = normalizeLoginId(rawId);
  if (validateLoginId(loginId) || password.length === 0) return { status: 'error', message: GENERIC_LOGIN_ERROR };
  let res;
  try {
    res = await c.auth.signInWithPassword({ email: loginIdToEmail(loginId, cloudConfig.loginDomain), password });
  } catch {
    return { status: 'error', message: '通信できませんでした。ネットワークを確認して、もう一度ためしてください。' };
  }
  if (res.error) {
    const e = res.error;
    if (e.status === 429) return { status: 'error', message: 'ログインの試行が多すぎます。しばらく待ってから、もう一度ためしてください。' };
    // ログイン失敗の制限（データベースのフック）からのメッセージはそのまま表示します
    if (/ログイン/.test(e.message)) return { status: 'error', message: e.message };
    if (e.status === 0 || /fetch|network/i.test(e.message)) {
      return { status: 'error', message: '通信できませんでした。ネットワークを確認して、もう一度ためしてください。' };
    }
    return { status: 'error', message: GENERIC_LOGIN_ERROR };
  }
  const profile = await fetchOwnProfile().catch(() => null);
  if (!profile || profile.status !== 'active') {
    await logoutCloud();
    return { status: 'error', message: 'このアカウントは今は使えません。先生に相談してください。' };
  }
  if (profile.role === 'teacher') {
    const { data: aal } = await c.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === 'aal2') return { status: 'ok', profile };
    const { data: factors } = await c.auth.mfa.listFactors();
    const totp = factors?.totp?.find((f) => f.status === 'verified');
    if (totp) return { status: 'mfa_required', profile, factorId: totp.id };
    return { status: 'mfa_enroll', profile };
  }
  return { status: 'ok', profile };
}

export async function verifyMfa(factorId: string, code: string): Promise<string | null> {
  const c = need();
  const { error } = await c.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
  return error ? '確認コードが違います。認証アプリに表示されている6けたの数字を入力してください。' : null;
}

export interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export async function enrollTotp(): Promise<TotpEnrollment> {
  const c = need();
  // 途中でやめた登録が残っていれば消してからやり直します
  const { data: factors } = await c.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status === 'unverified') await c.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: `sakura-type-${Date.now()}` });
  if (error || !data) throw new Error('二段階認証の登録を始められませんでした');
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** 使用中の認証セッションを終了し、メモリー上の認証情報を消します */
export async function logoutCloud(): Promise<void> {
  const c = getClient();
  try {
    await c?.auth.signOut({ scope: 'local' });
  } catch {
    /* 通信できなくても端末側の情報は必ず消します */
  }
  memory.clear();
}

export async function changeOwnPassword(password: string): Promise<string | null> {
  const { error } = await need().auth.updateUser({ password });
  return error ? 'パスワードを変更できませんでした。条件を確かめてください。' : null;
}

// ---------------------------------------------------------------------
// 学習設定
// ---------------------------------------------------------------------
export async function loadSettings(userId: string): Promise<{ own: unknown; defaults: unknown }> {
  const c = need();
  const [own, defs] = await Promise.all([
    c.from('user_settings').select('settings').eq('user_id', userId).maybeSingle(),
    c.from('student_defaults').select('settings').eq('student_id', userId).maybeSingle(),
  ]);
  return { own: own.data?.settings ?? null, defaults: defs.data?.settings ?? null };
}

export async function saveOwnSettings(userId: string, s: LearningSettings): Promise<boolean> {
  const { error } = await need()
    .from('user_settings')
    .upsert({ user_id: userId, settings: settingsToJson(s), updated_at: new Date().toISOString() });
  return !error;
}

// ---------------------------------------------------------------------
// 練習結果
// ---------------------------------------------------------------------
export async function saveResult(r: PracticeResult): Promise<void> {
  const row: Record<string, unknown> = {
    id: r.id,
    started_at: r.startedAt,
    kind: r.kind,
    set_type: r.setType,
    theme: r.theme,
    difficulty: String(r.difficulty),
    question_set_version: r.questionSetVersion,
    rank_version: r.rankVersion,
    minutes: r.endMode === 'count' ? null : r.minutes,
    // 時間制の記録は end_mode を送りません（列の既定値 'time'。v1.0.2 のマイグレーション前のデータベースでも保存できます）
    ...(r.endMode === 'count' ? { end_mode: 'count', target_count: r.targetCount } : {}),
    elapsed_ms: Math.round(r.elapsedMs),
    finished: r.finished,
    input_method: r.inputMethod,
    correct_count: r.correct,
    miss_count: r.miss,
    completed_questions: r.completedQuestions,
  };
  if (r.kind === 'romaji' && r.romajiStyle) row.romaji_style = r.romajiStyle;
  const c = need();
  let { error } = await c.from('practice_results').insert(row);
  // v1.0.3 のマイグレーション（romaji_style 列）を適用する前のデータベースでは、その項目を外して保存し直します
  if (error && 'romaji_style' in row && (error.code === 'PGRST204' || error.code === '42703') && /romaji_style/.test(error.message)) {
    delete row.romaji_style;
    ({ error } = await c.from('practice_results').insert(row));
  }
  // 23505 = 同じ ID がすでに保存済み（再送）。重複登録はされていないので成功として扱います
  if (error && error.code !== '23505') throw new Error(error.message);
}

/** クラウドの記録（表示・比較用の共通の形） */
export type HistoryRow = HistoryRecord;

const LEGACY_COLUMNS =
  'id, started_at, kind, set_type, theme, difficulty, minutes, input_method, finished, official, correct_count, miss_count, accuracy, speed, rank, rank_version, question_set_version, elapsed_ms, completed_questions';
/** 新しい順に試す列の組み合わせ（まだ適用していないマイグレーションの列があっても読めるように） */
const COLUMN_SETS = [`${LEGACY_COLUMNS}, end_mode, target_count, romaji_style`, `${LEGACY_COLUMNS}, end_mode, target_count`, LEGACY_COLUMNS];

/** 42703 = 列がない（マイグレーションをまだ適用していないデータベース） */
const isMissingColumn = (e: { code?: string } | null) => e?.code === '42703';

function mapHistory(r: Record<string, unknown>): HistoryRecord {
  const endMode = r.end_mode === 'count' ? 'count' : 'time';
  const d = String(r.difficulty);
  return {
    id: String(r.id),
    startedAt: String(r.started_at),
    kind: r.kind === 'sentence' ? 'sentence' : 'romaji',
    inputMethod: r.input_method === 'touch' ? 'touch' : 'keyboard',
    endMode,
    minutes: endMode === 'time' ? (Number(r.minutes) as 3 | 5 | 10) : null,
    targetCount: endMode === 'count' ? (Number(r.target_count) as 25 | 50) : null,
    setType: String(r.set_type) as HistoryRecord['setType'],
    theme: String(r.theme),
    difficulty: d === 'mixed' ? 'mixed' : (Number(d) as 1 | 2 | 3),
    questionSetVersion: String(r.question_set_version),
    romajiStyle: r.romaji_style === 'hepburn' || r.romaji_style === 'kunrei' ? r.romaji_style : null,
    correct: Number(r.correct_count),
    miss: Number(r.miss_count),
    accuracy: r.accuracy === null || r.accuracy === undefined ? null : Number(r.accuracy),
    speed: Number(r.speed),
    completedQuestions: Number(r.completed_questions ?? 0),
    elapsedMs: Number(r.elapsed_ms ?? 0),
    rank: String(r.rank),
    rankVersion: String(r.rank_version ?? 'rank-v1'),
    official: Boolean(r.official),
    finished: Boolean(r.finished),
  };
}

type Query = (columns: string) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;

async function selectWithFallback(run: Query, allowLegacy: boolean): Promise<HistoryRecord[]> {
  const sets = allowLegacy ? COLUMN_SETS : COLUMN_SETS.slice(0, 2);
  let last: { code?: string; message: string } | null = null;
  for (const cols of sets) {
    const { data, error } = await run(cols);
    if (!error) return ((data ?? []) as Record<string, unknown>[]).map(mapHistory);
    last = error;
    if (!isMissingColumn(error)) break;
  }
  throw new Error(last?.message ?? '記録を読み込めませんでした');
}

/** 同じ条件の過去の記録（自分の分。RLS により本人の記録だけが返ります）。時間制と問題数制、25問と50問は混ぜません */
export async function fetchSameCondition(c: PracticeConfig, excludeId: string): Promise<HistoryRow[]> {
  const run: Query = (columns) => {
    let q = need()
      .from('practice_results')
      .select(columns)
      .eq('kind', c.kind)
      .eq('input_method', c.inputMethod)
      .eq('set_type', c.setType)
      .eq('theme', c.theme)
      .eq('difficulty', String(c.difficulty))
      .eq('question_set_version', c.questionSetVersion)
      .neq('id', excludeId);
    // 時間制：minutes が一致するもの（問題数制の記録は minutes が空なので含まれません）
    q = c.endMode === 'count' ? q.eq('end_mode', 'count').eq('target_count', c.targetCount ?? 0) : q.eq('minutes', c.minutes ?? 0);
    return q.order('started_at', { ascending: false }).limit(HISTORY_LIMIT) as unknown as ReturnType<Query>;
  };
  return selectWithFallback(run, c.endMode === 'time');
}

/**
 * ある利用者の記録を新しい順に取得します（既定は直近 100 件）。
 * クラウドの古い記録は削除しません（先生の閲覧や学習データを守るため、取得する件数だけを絞ります）。
 */
export async function fetchResultsOf(userId: string, limit = HISTORY_LIMIT): Promise<HistoryRow[]> {
  const run: Query = (columns) =>
    need().from('practice_results').select(columns).eq('user_id', userId).order('started_at', { ascending: false }).limit(limit) as unknown as ReturnType<Query>;
  return selectWithFallback(run, true);
}

// ---------------------------------------------------------------------
// 先生の追加教材（練習で使う）
// ---------------------------------------------------------------------
export async function fetchPracticeMaterials(kind: 'romaji' | 'sentence'): Promise<Question[]> {
  const { data, error } = await need()
    .from('materials')
    .select('id, kind, text, reading, theme, difficulty')
    .eq('kind', kind)
    .eq('is_published', true)
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({
    id: String(m.id),
    kind,
    category: 'teacher' as const,
    theme: String(m.theme),
    difficulty: Number(m.difficulty) as 1 | 2 | 3,
    text: String(m.text),
    reading: String(m.reading ?? ''),
  }));
}

// ---------------------------------------------------------------------
// 教員用
// ---------------------------------------------------------------------
export interface ClassRow {
  id: string;
  name: string;
}

export async function listMyClasses(teacherId: string): Promise<ClassRow[]> {
  const { data, error } = await need()
    .from('class_teachers')
    .select('class_id, classes(id, name)')
    .eq('teacher_id', teacherId);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r) => (r as unknown as { classes: ClassRow | null }).classes)
    .filter((c): c is ClassRow => !!c)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await need().rpc(fn, args);
  if (error) throw new Error(error.message.includes('権限') ? 'この操作をする権限がありません' : error.message);
  return data;
}

export const createClass = (name: string) => rpc('create_class', { p_name: name }) as Promise<string>;
export const addCoTeacher = (classId: string, loginId: string) => rpc('add_class_teacher', { p_class: classId, p_login_id: loginId });
export const removeCoTeacher = (classId: string, teacherId: string) => rpc('remove_class_teacher', { p_class: classId, p_teacher: teacherId });
export const setStudentClass = (studentId: string, classId: string, member: boolean) =>
  rpc('set_student_class', { p_student: studentId, p_class: classId, p_member: member });
export const updateStudentDisplayName = (studentId: string, name: string) =>
  rpc('update_student_display_name', { p_student: studentId, p_name: name });

export async function renameClass(classId: string, name: string): Promise<void> {
  const { error } = await need().from('classes').update({ name }).eq('id', classId);
  if (error) throw new Error('クラス名を変更できませんでした');
}

export async function deleteClass(classId: string): Promise<void> {
  const { error } = await need().from('classes').delete().eq('id', classId);
  if (error) throw new Error('クラスを削除できませんでした');
}

export async function listClassTeachers(classId: string): Promise<Array<{ id: string; displayName: string; loginId: string }>> {
  const { data, error } = await need()
    .from('class_teachers')
    .select('teacher_id, profiles!class_teachers_teacher_id_fkey(display_name, login_id)')
    .eq('class_id', classId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const p = (r as unknown as { profiles: { display_name: string; login_id: string } | null }).profiles;
    return { id: String(r.teacher_id), displayName: p?.display_name ?? '（表示できません）', loginId: p?.login_id ?? '' };
  });
}

export interface StudentSummary {
  studentId: string;
  loginId: string;
  displayName: string;
  status: 'active' | 'suspended';
  practiceCount: number;
  lastPracticedAt: string | null;
  romajiBestSpeed: number | null;
  romajiLastAccuracy: number | null;
  sentenceBestSpeed: number | null;
  sentenceLastAccuracy: number | null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function studentSummaries(classId: string | null): Promise<StudentSummary[]> {
  const data = (await rpc('teacher_student_summaries', { p_class: classId })) as Array<Record<string, unknown>>;
  return (data ?? []).map((r) => ({
    studentId: String(r.student_id),
    loginId: String(r.login_id),
    displayName: String(r.display_name),
    status: r.status === 'suspended' ? 'suspended' : 'active',
    practiceCount: Number(r.practice_count),
    lastPracticedAt: (r.last_practiced_at as string | null) ?? null,
    romajiBestSpeed: num(r.romaji_best_speed),
    romajiLastAccuracy: num(r.romaji_last_accuracy),
    sentenceBestSpeed: num(r.sentence_best_speed),
    sentenceLastAccuracy: num(r.sentence_last_accuracy),
  }));
}

export async function studentClassIds(studentId: string): Promise<string[]> {
  const { data, error } = await need().from('class_students').select('class_id').eq('student_id', studentId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => String(r.class_id));
}

export async function getStudentDefaults(studentId: string): Promise<Partial<LearningSettings>> {
  const { data } = await need().from('student_defaults').select('settings').eq('student_id', studentId).maybeSingle();
  return sanitizeSettings(data?.settings);
}

export async function setStudentDefaults(studentId: string, s: Partial<LearningSettings>, teacherId: string): Promise<void> {
  const { error } = await need()
    .from('student_defaults')
    .upsert({ student_id: studentId, settings: settingsToJson(s), updated_by: teacherId, updated_at: new Date().toISOString() });
  if (error) throw new Error('初期設定を保存できませんでした');
}

/** 生徒が自分で変えた設定を消し、先生の初期設定に戻します */
export async function resetStudentOwnSettings(studentId: string): Promise<void> {
  const { error } = await need().from('user_settings').delete().eq('user_id', studentId);
  if (error) throw new Error('設定を戻せませんでした');
}

/** 管理用 Edge Function の呼び出し */
export async function adminAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await need().functions.invoke('teacher-admin', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = (await error.context.json().catch(() => null)) as { error?: string } | null;
      throw new Error(detail?.error ?? '操作できませんでした');
    }
    throw new Error('通信できませんでした。管理用の機能（Edge Function）が設定されているか確認してください。');
  }
  return (data ?? {}) as Record<string, unknown>;
}

export interface MaterialRow {
  id: string;
  kind: 'romaji' | 'sentence';
  text: string;
  reading: string;
  theme: string;
  difficulty: 1 | 2 | 3;
  isPublished: boolean;
  classIds: string[];
  ownerId: string;
}

export async function listMaterials(): Promise<MaterialRow[]> {
  const { data, error } = await need()
    .from('materials')
    .select('id, owner_id, kind, text, reading, theme, difficulty, is_published, material_classes(class_id)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({
    id: String(m.id),
    ownerId: String(m.owner_id),
    kind: m.kind === 'sentence' ? 'sentence' : 'romaji',
    text: String(m.text),
    reading: String(m.reading ?? ''),
    theme: String(m.theme),
    difficulty: Number(m.difficulty) as 1 | 2 | 3,
    isPublished: Boolean(m.is_published),
    classIds: ((m.material_classes as Array<{ class_id: string }> | null) ?? []).map((x) => x.class_id),
  }));
}

export async function saveMaterial(m: Omit<MaterialRow, 'id' | 'ownerId'> & { id?: string }): Promise<string> {
  const c = need();
  const row = {
    kind: m.kind,
    text: m.text,
    reading: m.reading,
    theme: m.theme,
    difficulty: m.difficulty,
    is_published: m.isPublished,
    updated_at: new Date().toISOString(),
  };
  let id = m.id;
  if (id) {
    const { error } = await c.from('materials').update(row).eq('id', id);
    if (error) throw new Error('教材を保存できませんでした。入力内容を確かめてください。');
  } else {
    const { data, error } = await c.from('materials').insert(row).select('id').single();
    if (error || !data) throw new Error('教材を保存できませんでした。入力内容を確かめてください。');
    id = String(data.id);
  }
  // クラスの割り当てを合わせます
  const { data: cur } = await c.from('material_classes').select('class_id').eq('material_id', id);
  const now = new Set((cur ?? []).map((r) => String(r.class_id)));
  const want = new Set(m.classIds);
  for (const cid of want) if (!now.has(cid)) await c.from('material_classes').insert({ material_id: id, class_id: cid });
  for (const cid of now) if (!want.has(cid)) await c.from('material_classes').delete().eq('material_id', id).eq('class_id', cid);
  return id;
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await need().from('materials').delete().eq('id', id);
  if (error) throw new Error('教材を削除できませんでした');
}

// ---------------------------------------------------------------------
// 検定モードの記録（タイピングの記録とは別の表 exam_results。ランクの計算には使いません）
// ---------------------------------------------------------------------
/**
 * 検定モードの記録を保存します。問題・正解文・入力本文は送りません（成績の数値と問題の名前・改訂番号だけ）。
 * 得点文字数と目安達成はデータベース側（トリガー）でも同じ規則で計算し直します。
 */
export async function saveExamResult(r: ExamRecord): Promise<void> {
  const row = {
    id: r.id,
    started_at: r.startedAt,
    problem_id: r.problemId,
    problem_title: r.problemTitle,
    problem_revision: r.problemRevision,
    problem_source: r.problemSource,
    grade: r.grade,
    time_limit_seconds: r.timeLimitSeconds,
    elapsed_ms: Math.round(r.elapsedMs),
    end_reason: r.endReason,
    full_text_completed: r.fullTextCompleted,
    scoring_enabled: r.scoringEnabled,
    input_chars: r.inputChars,
    matched_chars: r.matchedChars,
    miss_count: r.missCount,
    penalty_per_error: r.penaltyPerError,
    target_characters: r.targetCharacters,
    scoring_version: r.scoringVersion,
  };
  const { error } = await need().from('exam_results').insert(row);
  // 23505 = 同じ ID がすでに保存済み（再送）
  if (error && error.code !== '23505') throw new Error(error.message);
}

const EXAM_COLUMNS =
  'id, started_at, problem_id, problem_title, problem_revision, problem_source, grade, time_limit_seconds, elapsed_ms, end_reason, full_text_completed, scoring_enabled, input_chars, matched_chars, miss_count, score_chars, penalty_per_error, target_characters, achieved, scoring_version';

function mapExam(r: Record<string, unknown>): ExamRecord | null {
  return parseExamRecord({
    id: r.id,
    startedAt: r.started_at,
    problemId: r.problem_id,
    problemTitle: r.problem_title,
    problemRevision: r.problem_revision,
    problemSource: r.problem_source,
    grade: r.grade,
    timeLimitSeconds: r.time_limit_seconds ?? null,
    elapsedMs: r.elapsed_ms,
    endReason: r.end_reason,
    fullTextCompleted: r.full_text_completed,
    scoringEnabled: r.scoring_enabled,
    inputChars: r.input_chars,
    matchedChars: r.matched_chars ?? null,
    missCount: r.miss_count ?? null,
    scoreChars: r.score_chars ?? null,
    penaltyPerError: r.penalty_per_error,
    targetCharacters: r.target_characters,
    achieved: r.achieved ?? null,
    scoringVersion: r.scoring_version,
  });
}

/** ある利用者の検定モードの記録（新しい順・既定は直近 100 件。RLS により本人か担当の先生だけが読めます） */
export async function fetchExamResultsOf(userId: string, limit = EXAM_HISTORY_LIMIT): Promise<ExamRecord[]> {
  const { data, error } = await need()
    .from('exam_results')
    .select(EXAM_COLUMNS)
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.code === '42P01' || error.code === 'PGRST205' ? 'exam_results_missing' : error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapExam).filter((x): x is ExamRecord => x !== null);
}

// ---------------------------------------------------------------------
// ゲームモードの記録（game_results。タイピング・検定モードの記録とは別の表）
// ---------------------------------------------------------------------
/** データベースに表・関数がまだない（マイグレーション未適用）ときのエラー */
export class CloudTableMissingError extends Error {
  constructor() {
    super('クラウドの記録の表がまだありません（データベースにマイグレーションを適用してください）');
  }
}
const isMissingTable = (e: { code?: string } | null) => !!e && ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(e.code ?? '');

/**
 * ゲームの記録を保存します。入力した文章・打鍵の記録は送りません。
 * ミス加算・記録タイム・完成年・正確率はデータベース側でルールに従って計算し直します（送りません）。
 */
export async function saveGameResult(r: GameResult): Promise<void> {
  const row = {
    id: r.id,
    game_id: r.gameId,
    rule_version: r.ruleVersion,
    story_set_version: r.storySetVersion,
    story_id: r.storyId,
    course_id: r.courseId,
    input_method: r.inputMethod,
    romaji_style: r.romajiStyle,
    started_at: r.startedAt,
    finished_at: r.finishedAt,
    elapsed_ms: r.elapsedMs,
    miss_count: r.missCount,
    correct_keystrokes: r.correctKeystrokes,
    completed_reading_characters: r.completedReadingCharacters,
    total_reading_characters: r.totalReadingCharacters,
    pause_count: r.pauseCount,
    finished: r.finished,
  };
  const { error } = await need().from('game_results').insert(row);
  if (!error || error.code === '23505') return; // 23505 = 同じ ID がすでに保存済み（再送）
  if (isMissingTable(error)) throw new CloudTableMissingError();
  throw new Error(error.message);
}

const GAME_COLUMNS =
  'id, game_id, rule_version, story_set_version, story_id, course_id, input_method, romaji_style, started_at, finished_at, elapsed_ms, miss_count, penalty_ms, record_time_ms, completion_year, correct_keystrokes, accuracy, completed_reading_characters, total_reading_characters, pause_count, finished';

function mapGame(r: Record<string, unknown>): GameResult | null {
  return parseGameResult({
    id: r.id,
    gameId: r.game_id,
    ruleVersion: r.rule_version,
    storySetVersion: r.story_set_version,
    storyId: r.story_id,
    courseId: r.course_id,
    inputMethod: r.input_method,
    romajiStyle: r.romaji_style,
    // データベースの日時の書式（+00:00 など）をそろえます
    startedAt: new Date(String(r.started_at)).toISOString(),
    finishedAt: new Date(String(r.finished_at)).toISOString(),
    elapsedMs: Number(r.elapsed_ms),
    missCount: Number(r.miss_count),
    penaltyMs: Number(r.penalty_ms),
    recordTimeMs: Number(r.record_time_ms),
    completionYear: Number(r.completion_year),
    correctKeystrokes: Number(r.correct_keystrokes),
    accuracy: r.accuracy === null ? null : Number(r.accuracy),
    completedReadingCharacters: Number(r.completed_reading_characters),
    totalReadingCharacters: Number(r.total_reading_characters),
    pauseCount: Number(r.pause_count),
    finished: Boolean(r.finished),
  });
}

/** ある利用者のゲームの記録（新しい順・直近 100 件。RLS により本人か担当の先生だけが読めます） */
export async function fetchGameResultsOf(userId: string, limit = GAME_HISTORY_LIMIT): Promise<GameResult[]> {
  const { data, error } = await need().from('game_results').select(GAME_COLUMNS).eq('user_id', userId).order('started_at', { ascending: false }).limit(limit);
  if (error) throw isMissingTable(error) ? new CloudTableMissingError() : new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapGame).filter((x): x is GameResult => x !== null);
}

/** ある利用者のゲームの自己ベスト（条件ごと。100 件より古い記録も含めます） */
export async function fetchGameBests(userId: string): Promise<GameResult[]> {
  const { data, error } = await need().rpc('game_bests', { p_user: userId });
  if (error) throw isMissingTable(error) ? new CloudTableMissingError() : new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapGame).filter((x): x is GameResult => x !== null);
}
