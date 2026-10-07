/**
 * ゲーム画面のキーボード（このゲームの入力に必要なキーだけを表示します）。
 *
 * - 物語の入力に使うのは、英字26文字と「,」「.」、長音「ー」の「-」、中点「・」の「/」です
 *   （読みに使う記号は src/core/romaji.ts の対応表のとおり。必要なキーはテストで確かめています）。
 * - 数字・Shift・Enter・Backspace・スペースなど、この文章の入力に使わないキーは表示しません。
 *   （表示しないだけで、実物のキーボードの操作は今までどおりです）
 * - キーを省いても左に詰めず、実物のキーボード（日本語配列）の位置関係と各段のずれを保ちます。
 *   位置は「1」キーの左端を 0 とした、キー1つ分を単位にした横の位置です。
 * - 指の割り当て・ホームポジション（F・J）は、通常のキーボードの定義（keyboardLayout.ts）をそのまま使います。
 */
import { KEY_ROWS, type KeyDef } from '../keyboardLayout';

export interface GameKey {
  def: KeyDef;
  /** 段（0：数字の段、1：Q の段、2：A の段、3：Z の段） */
  row: number;
  /** 横の位置（キー1つ分の単位） */
  x: number;
}

/** 実物のキーボードでの各段の始まりのずれ（「1」の段を 0 として。Tab 1.5・Caps 1.75・Shift 2.25 の幅から） */
const ROW_OFFSET = [0, 0.5, 0.75, 1.25];

/** 表示するキー（段ごとに、実物の並び順のまま） */
const SHOWN: string[][] = [
  ['-'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
];

function build(): GameKey[] {
  const out: GameKey[] = [];
  SHOWN.forEach((chars, row) => {
    const full = KEY_ROWS[row]!;
    for (const c of chars) {
      // 実物の段の中の位置（Shift などの文字ではないキーの幅も数えます）
      let x = ROW_OFFSET[row]!;
      let found: KeyDef | null = null;
      for (const k of full) {
        if (!k.special && k.char === c) {
          found = k;
          break;
        }
        // 左端の Shift は段のずれに含めているため数えません
        if (k.special !== 'shiftL') x += k.width ?? 1;
      }
      if (!found) throw new Error(`キーが見つかりません: ${c}`);
      out.push({ def: found, row, x });
    }
  });
  // 表示するキーの左端をそろえる（全体を中央に置くため）
  const minX = Math.min(...out.map((k) => k.x));
  return out.map((k) => ({ ...k, x: k.x - minX }));
}

export const GAME_KEYS: readonly GameKey[] = build();
/** 表示するキー全体の幅（キー1つ分の単位） */
export const GAME_KEYS_WIDTH = Math.max(...GAME_KEYS.map((k) => k.x + 1));
export const GAME_KEY_ROWS = SHOWN.length;
export const GAME_KEY_CHARS: ReadonlySet<string> = new Set(GAME_KEYS.map((k) => k.def.char));
