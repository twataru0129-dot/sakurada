/**
 * 先生が追加する検定問題のお手本（画像・PDF）の確認。
 * 拡張子や申告された種類ではなく、ファイルの先頭の内容で形式を判定します。
 */

/** 1ファイルの容量の上限（変更できる定数） */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** PDF のページ数の上限・1つの問題で使う画像の枚数の上限 */
export const MAX_PDF_PAGES = 20;
export const MAX_IMAGE_FILES = 20;
/** 教材パック全体の容量の上限 */
export const MAX_PACK_BYTES = 400 * 1024 * 1024;
/** この端末に保存できる先生の問題の数の上限 */
export const MAX_TEACHER_PROBLEMS = 300;

export type MaterialFileType = 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';
export const ALLOWED_TYPES: readonly MaterialFileType[] = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

export type SniffResult =
  | { ok: true; type: MaterialFileType }
  | { ok: false; reason: 'empty' | 'heic' | 'unsupported' };

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** ファイルの先頭（16 バイト以上）から形式を判定します */
export function sniffType(head: Uint8Array): SniffResult {
  if (head.length === 0) return { ok: false, reason: 'empty' };
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ok: true, type: 'image/png' };
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { ok: true, type: 'image/jpeg' };
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return { ok: true, type: 'image/webp' };
  // PDF は先頭 1024 バイト以内に %PDF- があれば PDF とみなします（PDF の仕様に合わせた扱い）
  const text = ascii(head, 0, Math.min(head.length, 1024));
  if (text.includes('%PDF-')) return { ok: true, type: 'application/pdf' };
  if (ascii(head, 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)$/.test(ascii(head, 8, 12))) {
    return { ok: false, reason: 'heic' };
  }
  return { ok: false, reason: 'unsupported' };
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  if (n >= 1024) return `${Math.ceil(n / 1024)}KB`;
  return `${n}B`;
}

/** 読み込めなかったときの案内（画面に表示します） */
export function fileProblemMessage(reason: 'empty' | 'heic' | 'unsupported' | 'too_large', name: string): string {
  switch (reason) {
    case 'empty':
      return `「${name}」は中身が空のため、読み込めません。`;
    case 'heic':
      return `「${name}」は HEIC / HEIF 形式（iPhone・iPad の写真などの形式）のため、この画面では使えません。JPEG または PNG に変換してから選んでください（例：写真を「書き出す」で JPEG にする、iPhone の「設定 → カメラ → フォーマット → 互換性優先」で撮影する）。`;
    case 'unsupported':
      return `「${name}」は対応していない形式です。使えるのは PNG・JPEG・WebP の画像と PDF です。ほかの形式は、これらの形式に変換してから選んでください。`;
    case 'too_large':
      return `「${name}」は容量が大きすぎます（1ファイル ${formatBytes(MAX_FILE_BYTES)} まで）。画像を小さくするか、PDF を分けてください。`;
  }
}

/** ブラウザで選んだファイルを確認します */
export async function checkMaterialFile(file: Blob & { name?: string }): Promise<{ ok: true; type: MaterialFileType } | { ok: false; message: string }> {
  const name = file.name ?? 'ファイル';
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: fileProblemMessage('too_large', name) };
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const s = sniffType(head);
  if (!s.ok) return { ok: false, message: fileProblemMessage(s.reason, name) };
  return s;
}

/** SHA-256（16進）。使えない環境（HTTPS ではないなど）では null */
export async function sha256Hex(data: ArrayBuffer): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const d = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
