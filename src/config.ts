import { DEFAULT_LOGIN_DOMAIN } from '../supabase/functions/_shared/accountRules';

/** アプリのバージョン（package.json の version から自動で入ります。ここでは変更しません） */
export const APP_VERSION: string = __APP_VERSION__;
export const APP_NAME = '桜打 — SAKURA TYPE';

const env = import.meta.env;

/** 認証・記録保存（Supabase）の設定。公開してよい値（URL と公開用の anon / publishable キー）だけを使います */
export const cloudConfig = {
  url: (env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '',
  anonKey: (env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '',
  loginDomain: (env.VITE_LOGIN_EMAIL_DOMAIN as string | undefined)?.trim() || DEFAULT_LOGIN_DOMAIN,
};

/**
 * ログイン・クラウド保存が設定済みか。
 * 通信は HTTPS に限ります（開発用に自分の PC で動かす Supabase の http://localhost / 127.0.0.1 だけは例外）。
 */
export const isCloudConfigured =
  (/^https:\/\/[^\s]+$/.test(cloudConfig.url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cloudConfig.url)) &&
  cloudConfig.anonKey.length > 20;

/** 無操作で自動ログアウトするまでの時間 */
export const IDLE_LOGOUT_MS = 15 * 60 * 1000;
export const IDLE_WARNING_MS = 14 * 60 * 1000;
