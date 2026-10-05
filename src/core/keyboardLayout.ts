/**
 * 画面のキーボード（Windows の日本語キーボード配列を基本）と、各キーを押す指。
 * 判定は押されたキーの文字（KeyboardEvent.key）で行うため、英語配列のキーボードでも入力・判定できます。
 */

export type Finger = 'L5' | 'L4' | 'L3' | 'L2' | 'R2' | 'R3' | 'R4' | 'R5' | 'T';

export const FINGER_LABEL: Record<Finger, string> = {
  L5: '左手の小指',
  L4: '左手の薬指',
  L3: '左手の中指',
  L2: '左手の人さし指',
  R2: '右手の人さし指',
  R3: '右手の中指',
  R4: '右手の薬指',
  R5: '右手の小指',
  T: '親指',
};

export interface KeyDef {
  id: string;
  /** 通常の文字 */
  char: string;
  /** Shift を押したときの文字 */
  shift?: string;
  label: string;
  shiftLabel?: string;
  finger: Finger;
  /** キーの幅（1 = 標準） */
  width?: number;
  /** ホームポジション（F・J） */
  home?: boolean;
  /** 文字ではないキー（Shift・Enter など） */
  special?: 'shiftL' | 'shiftR' | 'enter' | 'space' | 'backspace';
}

function k(char: string, finger: Finger, shift?: string, extra: Partial<KeyDef> = {}): KeyDef {
  return { id: `k-${char}`, char, shift, label: char.toUpperCase(), shiftLabel: shift, finger, ...extra };
}

export const KEY_ROWS: KeyDef[][] = [
  [
    k('1', 'L5', '!'), k('2', 'L4', '"'), k('3', 'L3', '#'), k('4', 'L2', '$'), k('5', 'L2', '%'),
    k('6', 'R2', '&'), k('7', 'R2', "'"), k('8', 'R3', '('), k('9', 'R4', ')'), k('0', 'R5'),
    k('-', 'R5', '='), k('^', 'R5', '~'), k('¥', 'R5', '|'),
    { id: 'k-backspace', char: '', label: 'BS', finger: 'R5', width: 1.4, special: 'backspace' },
  ],
  [
    k('q', 'L5'), k('w', 'L4'), k('e', 'L3'), k('r', 'L2'), k('t', 'L2'),
    k('y', 'R2'), k('u', 'R2'), k('i', 'R3'), k('o', 'R4'), k('p', 'R5'),
    k('@', 'R5', '`'), k('[', 'R5', '{'),
    { id: 'k-enter', char: '\n', label: 'Enter', finger: 'R5', width: 1.6, special: 'enter' },
  ],
  [
    k('a', 'L5'), k('s', 'L4'), k('d', 'L3'), k('f', 'L2', undefined, { home: true }), k('g', 'L2'),
    k('h', 'R2'), k('j', 'R2', undefined, { home: true }), k('k', 'R3'), k('l', 'R4'), k(';', 'R5', '+'),
    k(':', 'R5', '*'), k(']', 'R5', '}'),
  ],
  [
    { id: 'k-shiftL', char: '', label: 'Shift', finger: 'L5', width: 1.8, special: 'shiftL' },
    k('z', 'L5'), k('x', 'L4'), k('c', 'L3'), k('v', 'L2'), k('b', 'L2'),
    k('n', 'R2'), k('m', 'R2'), k(',', 'R3', '<'), k('.', 'R4', '>'), k('/', 'R5', '?'), k('\\', 'R5', '_'),
    { id: 'k-shiftR', char: '', label: 'Shift', finger: 'R5', width: 1.8, special: 'shiftR' },
  ],
  [{ id: 'k-space', char: ' ', label: 'スペース', finger: 'T', width: 6, special: 'space' }],
];

export interface KeyTarget {
  key: KeyDef;
  /** Shift を同時に押す（反対の手の Shift） */
  shift: KeyDef | null;
}

const ALL_KEYS = KEY_ROWS.flat();
const SHIFT_L = ALL_KEYS.find((x) => x.special === 'shiftL')!;
const SHIFT_R = ALL_KEYS.find((x) => x.special === 'shiftR')!;

/** 文字から、押すキー（と Shift）を求めます。見つからなければ null */
export function keyForChar(ch: string): KeyTarget | null {
  const c = ch.length === 1 ? ch.toLowerCase() : ch;
  for (const key of ALL_KEYS) {
    if (!key.special && key.char === c) return { key, shift: null };
  }
  for (const key of ALL_KEYS) {
    if (key.shift === ch) return { key, shift: key.finger.startsWith('L') ? SHIFT_R : SHIFT_L };
  }
  if (ch === '\n') return { key: ALL_KEYS.find((x) => x.special === 'enter')!, shift: null };
  if (ch === ' ') return { key: ALL_KEYS.find((x) => x.special === 'space')!, shift: null };
  return null;
}

/**
 * 文章入力（IME 使用）で、次に押すキーを一意に案内できる文字だけキーを返します。
 * 漢字・かなは変換の方法や入力方式によって押すキーが変わるため、案内しません（null）。
 */
export function keyForSentenceChar(ch: string | null): KeyTarget | null {
  if (ch === null) return null;
  const map: Record<string, string> = { '、': ',', '。': '.', 'ー': '-', '\n': '\n', '！': '!', '？': '?' };
  const fw = ch.codePointAt(0)!;
  let c = map[ch] ?? ch;
  if (fw >= 0xff10 && fw <= 0xff19) c = String.fromCodePoint(fw - 0xfee0);
  if (/^[0-9,.\-!?\n]$/.test(c)) return keyForChar(c);
  return null;
}

/** スマートフォンなど狭い画面の画面タップ用（10列）。指の割り当ては通常の配列と同じです */
export function compactRows(): KeyDef[][] {
  const by = (c: string) => ALL_KEYS.find((x) => x.char === c && !x.special)!;
  const row = (s: string) => [...s].map(by);
  return [
    row('1234567890'),
    row('qwertyuiop'),
    row('asdfghjkl-'),
    row('zxcvbnm,.'),
    [
      { ...by('1'), id: 'c-excl', char: '!', label: '!', shift: undefined, shiftLabel: undefined },
      { ...by('/'), id: 'c-q', char: '?', label: '?', shift: undefined, shiftLabel: undefined },
      { ...by('['), id: 'c-lb', char: '[', label: '「', shift: undefined, shiftLabel: undefined },
      { ...by(']'), id: 'c-rb', char: ']', label: '」', shift: undefined, shiftLabel: undefined },
      { ...by('/'), id: 'c-slash', char: '/', label: '・', shift: undefined, shiftLabel: undefined },
      { ...by('^'), id: 'c-tilde', char: '~', label: '〜', shift: undefined, shiftLabel: undefined },
    ],
  ];
}
