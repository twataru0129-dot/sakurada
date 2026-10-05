/**
 * アカウントの規則（フロントエンド・Edge Function・管理スクリプトで共通）。
 * このファイルは他のファイルを import しません（Deno とブラウザの両方で使うため）。
 */

/** ログインID：英小文字で始まり、英小文字と数字の 4〜20 文字 */
export const LOGIN_ID_PATTERN = /^[a-z][a-z0-9]{3,19}$/;

/** 既定のログイン用ドメイン。生徒のIDを認証基盤の内部用アドレスに変換するためだけに使い、メールは送りません */
export const DEFAULT_LOGIN_DOMAIN = 'id.sakura-type.invalid';

/** 全角英数字を半角にし、小文字にそろえます */
export function normalizeLoginId(input: string): string {
  return input.normalize('NFKC').trim().toLowerCase();
}

export function validateLoginId(loginId: string): string | null {
  if (!LOGIN_ID_PATTERN.test(loginId)) {
    return 'IDは英字で始まる、英小文字と数字の4〜20文字にしてください（例: sakura01）';
  }
  return null;
}

export function loginIdToEmail(loginId: string, domain: string = DEFAULT_LOGIN_DOMAIN): string {
  return `${normalizeLoginId(loginId)}@${domain}`;
}

export function validateDisplayName(name: string): string | null {
  const n = name.trim();
  if (n.length === 0) return '表示名を入力してください';
  if ([...n].length > 20) return '表示名は20文字までです';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(n)) return '表示名に使えない文字が含まれています';
  return null;
}

export const PASSWORD_MIN = 8;

export function validatePassword(password: string, loginId = ''): string | null {
  if (password.length < PASSWORD_MIN) return `パスワードは${PASSWORD_MIN}文字以上にしてください`;
  if (new TextEncoder().encode(password).length > 72) return 'パスワードが長すぎます';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'パスワードには英字と数字の両方を入れてください';
  if (/\s/.test(password)) return 'パスワードに空白は使えません';
  if (/^(.)\1+$/.test(password)) return '同じ文字だけのパスワードは使えません';
  if (loginId && password.toLowerCase().includes(loginId.toLowerCase())) return 'パスワードにIDを含めないでください';
  return null;
}

/** 読み間違えにくい文字（0/O、1/l/I などを除く） */
const LETTERS = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';

/** 生徒に渡しやすい初期パスワードを作ります（英字8文字＋数字2文字を混ぜた10文字） */
export function generatePassword(random: (n: number) => number = cryptoRandomInt): string {
  const chars: string[] = [];
  for (let i = 0; i < 7; i++) chars.push(LETTERS[random(LETTERS.length)]!);
  for (let i = 0; i < 3; i++) chars.push(DIGITS[random(DIGITS.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

function cryptoRandomInt(n: number): number {
  // 偏りをなくすため、範囲外の値は引き直します
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const a = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(a);
    if (a[0]! < limit) return a[0]! % n;
  }
}
