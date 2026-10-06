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
import { sanitizeSettings, settingsToJson, type LearningSettings } from '../core/settings';

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
  const { error } = await need()
    .from('practice_results')
    .insert({
      id: r.id,
      started_at: r.startedAt,
      kind: r.kind,
      set_type: r.setType,
      theme: r.theme,
      difficulty: String(r.difficulty),
      question_set_version: r.questionSetVersion,
      rank_version: r.rankVersion,
      minutes: r.endMode === 'count' ? null : r.minutes,
      // 時間制の記録は end_mode を送りません（列の既定値 'time'。マイグレーション前のデータベースでも保存できます）
      ...(r.endMode === 'count' ? { end_mode: 'count', target_count: r.targetCount } : {}),
      elapsed_ms: Math.round(r.elapsedMs),
      finished: r.finished,
      input_method: r.inputMethod,
      correct_count: r.correct,
      miss_count: r.miss,
      completed_questions: r.completedQuestions,
    });
  // 23505 = 同じ ID がすでに保存済み（再送）。重複登録はされていないので成功として扱います
  if (error && error.code !== '23505') throw new Error(error.message);
}

export interface HistoryRow {
  id: string;
  startedAt: string;
  kind: 'romaji' | 'sentence';
  setType: string;
  theme: string;
  difficulty: string;
  /** 時間制は 'time'、問題数制は 'count'。v1.0.1 までの記録は時間制として読み込みます */
  endMode: 'time' | 'count';
  minutes: number | null;
  targetCount: number | null;
  inputMethod: string;
  finished: boolean;
  official: boolean;
  correct: number;
  miss: number;
  accuracy: number | null;
  speed: number;
  rank: string;
  questionSetVersion: string;
}

const LEGACY_COLUMNS =
  'id, started_at, kind, set_type, theme, difficulty, minutes, input_method, finished, official, correct_count, miss_count, accuracy, speed, rank, question_set_version';
const HISTORY_COLUMNS = `${LEGACY_COLUMNS}, end_mode, target_count`;

/** 42703 = 列がない（問題数制のマイグレーションをまだ適用していないデータベース） */
const isMissingColumn = (e: { code?: string } | null) => e?.code === '42703';

function mapHistory(r: Record<string, unknown>): HistoryRow {
  return {
    id: String(r.id),
    startedAt: String(r.started_at),
    kind: r.kind === 'sentence' ? 'sentence' : 'romaji',
    setType: String(r.set_type),
    theme: String(r.theme),
    difficulty: String(r.difficulty),
    endMode: r.end_mode === 'count' ? 'count' : 'time',
    minutes: r.minutes === null || r.minutes === undefined ? null : Number(r.minutes),
    targetCount: r.target_count === null || r.target_count === undefined ? null : Number(r.target_count),
    inputMethod: String(r.input_method),
    finished: Boolean(r.finished),
    official: Boolean(r.official),
    correct: Number(r.correct_count),
    miss: Number(r.miss_count),
    accuracy: r.accuracy === null ? null : Number(r.accuracy),
    speed: Number(r.speed),
    rank: String(r.rank),
    questionSetVersion: String(r.question_set_version),
  };
}

/** 同じ条件の過去の記録（自分の分。RLS により本人の記録だけが返ります）。時間制と問題数制、25問と50問は混ぜません */
export async function fetchSameCondition(c: PracticeConfig, excludeId: string): Promise<HistoryRow[]> {
  const run = (columns: string) => {
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
    return q.order('started_at', { ascending: false }).limit(300);
  };
  let { data, error } = await run(HISTORY_COLUMNS);
  if (isMissingColumn(error) && c.endMode === 'time') ({ data, error } = await run(LEGACY_COLUMNS));
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapHistory);
}

export async function fetchResultsOf(userId: string, limit = 500): Promise<HistoryRow[]> {
  const run = (columns: string) =>
    need().from('practice_results').select(columns).eq('user_id', userId).order('started_at', { ascending: false }).limit(limit);
  let { data, error } = await run(HISTORY_COLUMNS);
  if (isMissingColumn(error)) ({ data, error } = await run(LEGACY_COLUMNS));
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapHistory);
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
