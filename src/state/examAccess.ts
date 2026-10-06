import { isCloudConfigured } from '../config';
import type { Account } from './AppContext';

/**
 * この端末の検定問題（先生の追加問題）を追加・編集できるか。
 *
 * - ログイン機能（Supabase）を設定していないとき：先生用のアカウントがないため、この端末を使う人が管理できます。
 * - 設定しているとき：先生のアカウントでログインしたときだけ、管理の画面を表示します。
 *
 * これは画面の表示を分けるだけで、クラウド上の権限の制御ではありません。
 * 端末内（ブラウザの IndexedDB）の教材は、その端末を操作できる人なら技術的には変更できます。
 * 教材パックの読み込み（追加のみ・上書きなし）は、だれでも行えます。
 */
export function canManageExamProblems(account: Account | null): boolean {
  if (!account) return false;
  if (!isCloudConfigured) return true;
  return account.kind === 'user' && account.profile.role === 'teacher';
}
