/**
 * ローマ字入力の判定エンジン。
 *
 * 読み（ひらがな）を「入力単位」に分け、各単位に複数の正しい打ち方（候補）を持たせます。
 * 入力途中で別の表記に切り替えても受け付け、ガイドは実際の入力に合わせて更新します。
 *
 * - 促音「っ」は、次の単位の子音を重ねる打ち方（kka など）と、単独入力（xtu / ltu など）の両方に対応します。
 * - 「ん」は nn / xn / n' を基本とし、次の文字が母音・や行・な行・「ん」以外で始まる場合に限り n 1回でも確定します。
 *   読みの最後の「ん」は n 1回では確定しません（一般的な日本語入力と同じ）。
 * - モードごとの決まり（RomajiRules）を渡すと、そのモードの判定だけを変えられます。渡さないときは上のとおりです。
 */

/** 単独のかな（1文字）の打ち方。先頭がガイドに表示する標準の打ち方です。 */
const SINGLE: Record<string, string[]> = {
  あ: ['a'], い: ['i', 'yi'], う: ['u', 'wu', 'whu'], え: ['e'], お: ['o'],
  か: ['ka', 'ca'], き: ['ki'], く: ['ku', 'cu', 'qu'], け: ['ke'], こ: ['ko', 'co'],
  さ: ['sa'], し: ['shi', 'si', 'ci'], す: ['su'], せ: ['se', 'ce'], そ: ['so'],
  た: ['ta'], ち: ['chi', 'ti'], つ: ['tsu', 'tu'], て: ['te'], と: ['to'],
  な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'],
  は: ['ha'], ひ: ['hi'], ふ: ['fu', 'hu'], へ: ['he'], ほ: ['ho'],
  ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'],
  や: ['ya'], ゆ: ['yu'], よ: ['yo'],
  ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'],
  わ: ['wa'], ゐ: ['wyi'], ゑ: ['wye'], を: ['wo'],
  が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'],
  ざ: ['za'], じ: ['ji', 'zi'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'],
  だ: ['da'], ぢ: ['di'], づ: ['du'], で: ['de'], ど: ['do'],
  ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'],
  ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'],
  ゔ: ['vu'],
  ぁ: ['xa', 'la'], ぃ: ['xi', 'li', 'xyi', 'lyi'], ぅ: ['xu', 'lu'], ぇ: ['xe', 'le', 'xye', 'lye'], ぉ: ['xo', 'lo'],
  ゃ: ['xya', 'lya'], ゅ: ['xyu', 'lyu'], ょ: ['xyo', 'lyo'], ゎ: ['xwa', 'lwa'],
  ゕ: ['xka', 'lka'], ゖ: ['xke', 'lke'],
  っ: ['xtu', 'ltu', 'xtsu', 'ltsu'],
  ー: ['-'], '、': [','], '。': ['.'], '！': ['!'], '？': ['?'],
  '「': ['['], '」': [']'], '・': ['/'], '〜': ['~'],
  '0': ['0'], '1': ['1'], '2': ['2'], '3': ['3'], '4': ['4'],
  '5': ['5'], '6': ['6'], '7': ['7'], '8': ['8'], '9': ['9'],
};

/** 2文字の組み合わせ（拗音など）の専用の打ち方。分けて打つ方法（shi+xya など）も自動で加えます。 */
const DOUBLE: Record<string, string[]> = {
  きゃ: ['kya'], きぃ: ['kyi'], きゅ: ['kyu'], きぇ: ['kye'], きょ: ['kyo'],
  しゃ: ['sha', 'sya'], しぃ: ['syi'], しゅ: ['shu', 'syu'], しぇ: ['she', 'sye'], しょ: ['sho', 'syo'],
  ちゃ: ['cha', 'tya', 'cya'], ちぃ: ['tyi', 'cyi'], ちゅ: ['chu', 'tyu', 'cyu'], ちぇ: ['che', 'tye', 'cye'], ちょ: ['cho', 'tyo', 'cyo'],
  にゃ: ['nya'], にぃ: ['nyi'], にゅ: ['nyu'], にぇ: ['nye'], にょ: ['nyo'],
  ひゃ: ['hya'], ひぃ: ['hyi'], ひゅ: ['hyu'], ひぇ: ['hye'], ひょ: ['hyo'],
  みゃ: ['mya'], みぃ: ['myi'], みゅ: ['myu'], みぇ: ['mye'], みょ: ['myo'],
  りゃ: ['rya'], りぃ: ['ryi'], りゅ: ['ryu'], りぇ: ['rye'], りょ: ['ryo'],
  ぎゃ: ['gya'], ぎぃ: ['gyi'], ぎゅ: ['gyu'], ぎぇ: ['gye'], ぎょ: ['gyo'],
  じゃ: ['ja', 'jya', 'zya'], じぃ: ['jyi', 'zyi'], じゅ: ['ju', 'jyu', 'zyu'], じぇ: ['je', 'jye', 'zye'], じょ: ['jo', 'jyo', 'zyo'],
  ぢゃ: ['dya'], ぢぃ: ['dyi'], ぢゅ: ['dyu'], ぢぇ: ['dye'], ぢょ: ['dyo'],
  びゃ: ['bya'], びぃ: ['byi'], びゅ: ['byu'], びぇ: ['bye'], びょ: ['byo'],
  ぴゃ: ['pya'], ぴぃ: ['pyi'], ぴゅ: ['pyu'], ぴぇ: ['pye'], ぴょ: ['pyo'],
  てゃ: ['tha'], てぃ: ['thi'], てゅ: ['thu'], てぇ: ['the'], てょ: ['tho'],
  でゃ: ['dha'], でぃ: ['dhi'], でゅ: ['dhu'], でぇ: ['dhe'], でょ: ['dho'],
  とぁ: ['twa'], とぃ: ['twi'], とぅ: ['twu'], とぇ: ['twe'], とぉ: ['two'],
  どぁ: ['dwa'], どぃ: ['dwi'], どぅ: ['dwu'], どぇ: ['dwe'], どぉ: ['dwo'],
  ふぁ: ['fa', 'fwa'], ふぃ: ['fi', 'fwi', 'fyi'], ふぅ: ['fwu'], ふぇ: ['fe', 'fwe', 'fye'], ふぉ: ['fo', 'fwo'],
  ふゃ: ['fya'], ふゅ: ['fyu'], ふょ: ['fyo'],
  うぁ: ['wha'], うぃ: ['wi', 'whi'], うぇ: ['we', 'whe'], うぉ: ['who'],
  いぇ: ['ye'],
  ゔぁ: ['va'], ゔぃ: ['vi', 'vyi'], ゔぇ: ['ve', 'vye'], ゔぉ: ['vo'], ゔゃ: ['vya'], ゔゅ: ['vyu'], ゔょ: ['vyo'],
  つぁ: ['tsa'], つぃ: ['tsi'], つぇ: ['tse'], つぉ: ['tso'],
  くぁ: ['qa', 'kwa', 'qwa'], くぃ: ['qi', 'qwi', 'qyi'], くぅ: ['qwu'], くぇ: ['qe', 'qwe', 'qye'], くぉ: ['qo', 'qwo'],
  ぐぁ: ['gwa'], ぐぃ: ['gwi'], ぐぅ: ['gwu'], ぐぇ: ['gwe'], ぐぉ: ['gwo'],
  すぁ: ['swa'], すぃ: ['swi'], すぅ: ['swu'], すぇ: ['swe'], すぉ: ['swo'],
};

const SMALL = new Set(['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ', 'ゎ']);
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);
/** 「ん」を n 1回で確定できない次の文字の先頭 */
const N_BLOCKERS = new Set(['a', 'i', 'u', 'e', 'o', 'y', 'n', "'"]);
const N_CANDS = ['nn', 'xn', "n'"];

/**
 * モードごとの判定の決まり（省略時はすべて false で、これまでどおりの判定です）。
 * - strictN：「ん」はどこでも nn だけで確定します（n 1回・xn・n' では確定しません）。
 * - zuForDu：「づ」を du に加えて zu でも受け付けます（お手本は du のまま。「ず」は zu だけで、du は受け付けません）。
 */
export interface RomajiRules {
  strictN?: boolean;
  zuForDu?: boolean;
}

export interface RomajiUnit {
  /** 表示用のかな（例: 「しゃ」「っか」「ん」） */
  kana: string;
  /** 正しい打ち方の候補（先頭が標準） */
  cands: string[];
  /** 「ん」の単位 */
  isN: boolean;
}

/** カタカナをひらがなに、全角数字を半角にそろえます。 */
export function normalizeReading(reading: string): string {
  let out = '';
  for (const ch of reading.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x30a1 && c <= 0x30f6) out += String.fromCodePoint(c - 0x60);
    else if (c >= 0xff10 && c <= 0xff19) out += String.fromCodePoint(c - 0xfee0);
    else if (ch === '～' || ch === '~') out += '〜';
    else if (ch === '!') out += '！';
    else if (ch === '?') out += '？';
    else if (ch === ',') out += '、';
    else if (ch === '.') out += '。';
    else out += ch;
  }
  return out;
}

function candsOf(kana: string): string[] | undefined {
  if (kana.length === 2 && DOUBLE[kana]) {
    const [a, b] = [kana[0]!, kana[1]!];
    const split: string[] = [];
    for (const x of SINGLE[a] ?? []) for (const y of SINGLE[b] ?? []) split.push(x + y);
    return unique([...DOUBLE[kana]!, ...split]);
  }
  return SINGLE[kana];
}

function unique(list: string[]): string[] {
  return [...new Set(list)];
}

/** 促音「っ」と次の単位をまとめた候補 */
function geminate(next: string[]): string[] {
  const doubled: string[] = [];
  for (const c of next) {
    const head = c[0]!;
    if (!VOWELS.has(head) && /[a-z]/.test(head) && head !== 'n') {
      doubled.push(head + c);
      if (c.startsWith('ch')) doubled.push('t' + c); // っち → tchi
    }
  }
  const separate: string[] = [];
  for (const t of SINGLE['っ']!) for (const c of next) separate.push(t + c);
  return unique([...doubled, ...separate]);
}

export class UnsupportedCharError extends Error {
  constructor(public readonly char: string) {
    super(`ローマ字入力に対応していない文字があります: 「${char}」`);
  }
}

/**
 * ガイドに優先して表示する表記（お手本）。判定には影響しません。どちらを選んでも、すべての正しい打ち方を受け付けます。
 * - hepburn（ヘボン式）：shi / chi / tsu / fu / ji、sha / cha / ja など（候補表の先頭がヘボン式です）
 * - kunrei（訓令式）：si / ti / tu / hu / zi、sya / tya / zya など
 * 「ぢ・づ」は、訓令式の正式な表記（zi / zu）で打つと「じ・ず」になってしまうため、
 * 入力用のお手本としてはどちらの方式でも di / du を使います。「を」も wo です。長音は「-」のままです。
 */
export type RomajiStyle = 'hepburn' | 'kunrei';

const KUNREI_PREFERRED: Record<string, string> = {
  し: 'si', ち: 'ti', つ: 'tu', ふ: 'hu', じ: 'zi',
  しゃ: 'sya', しゅ: 'syu', しょ: 'syo', しぇ: 'sye',
  ちゃ: 'tya', ちゅ: 'tyu', ちょ: 'tyo', ちぇ: 'tye',
  じゃ: 'zya', じゅ: 'zyu', じょ: 'zyo', じぇ: 'zye',
};

/** お手本の表記を候補の先頭にします（候補そのものは変えません） */
function preferStyle(kana: string, cands: string[], style: RomajiStyle): string[] {
  if (style !== 'kunrei') return cands;
  const p = KUNREI_PREFERRED[kana];
  if (!p || !cands.includes(p)) return cands;
  return [p, ...cands.filter((c) => c !== p)];
}

/** 読みを入力単位に分けます。対応していない文字があれば例外を投げます。 */
export function tokenize(reading: string, style: RomajiStyle = 'hepburn', rules: RomajiRules = {}): RomajiUnit[] {
  const chars = [...normalizeReading(reading)];
  const base: RomajiUnit[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (ch === 'ん') {
      base.push({ kana: 'ん', cands: rules.strictN ? ['nn'] : N_CANDS, isN: true });
      continue;
    }
    const next = chars[i + 1];
    if (next && SMALL.has(next) && DOUBLE[ch + next]) {
      base.push({ kana: ch + next, cands: preferStyle(ch + next, candsOf(ch + next)!, style), isN: false });
      i++;
      continue;
    }
    const c = ch === 'づ' && rules.zuForDu ? ['du', 'zu'] : candsOf(ch);
    if (!c) throw new UnsupportedCharError(ch);
    base.push({ kana: ch, cands: preferStyle(ch, c, style), isN: false });
  }
  // 促音を次の単位とまとめます（次が子音で始まる場合のみ）
  const units: RomajiUnit[] = [];
  for (let i = 0; i < base.length; i++) {
    const u = base[i]!;
    const nx = base[i + 1];
    if (u.kana === 'っ' && nx && !nx.isN && nx.kana !== 'っ' && nx.cands.some((c) => /^[b-df-hj-mp-tv-z]/.test(c))) {
      units.push({ kana: 'っ' + nx.kana, cands: geminate(nx.cands), isN: false });
      i++;
      continue;
    }
    units.push(u);
  }
  return units;
}

/** 読みがローマ字入力に使えるかを調べます（使えない文字があればその文字を返します）。 */
export function findUnsupportedChar(reading: string): string | null {
  try {
    tokenize(reading);
    return null;
  } catch (e) {
    if (e instanceof UnsupportedCharError) return e.char;
    throw e;
  }
}

export type KeyResult = 'correct' | 'miss' | 'ignored';

export interface RomajiSnapshot {
  units: RomajiUnit[];
  /** 現在入力中の単位の番号 */
  index: number;
  /** 現在の単位で入力済みの文字 */
  buffer: string;
  /** これまでに正しく入力した文字列（実際の打ち方） */
  typed: string;
  /** これから入力する文字列のガイド（実際の入力に合わせて更新） */
  remaining: string;
  /** 各単位でミスがあったか */
  missAt: boolean[];
  done: boolean;
}

/** 1問分のローマ字入力の状態 */
export class RomajiMatcher {
  readonly units: RomajiUnit[];
  private index = 0;
  private buffer = '';
  private typed = '';
  private missAt: boolean[];
  private readonly rules: RomajiRules;

  constructor(reading: string, style: RomajiStyle = 'hepburn', rules: RomajiRules = {}) {
    this.rules = rules;
    this.units = tokenize(reading, style, rules);
    this.missAt = this.units.map(() => false);
  }

  /** 状態をそのまま写した別の判定器（試しに打ってみるため） */
  clone(): RomajiMatcher {
    const c = Object.create(RomajiMatcher.prototype) as RomajiMatcher;
    Object.assign(c, { units: this.units, rules: this.rules, index: this.index, buffer: this.buffer, typed: this.typed, missAt: [...this.missAt] });
    return c;
  }

  /** いま正しいと判定されるキーの一覧（ガイドに表示中の文字以外の、別の正しい打ち方も含みます） */
  acceptableKeys(): string[] {
    if (this.done) return [];
    const keys = "abcdefghijklmnopqrstuvwxyz-,.!?[]/~'0123456789";
    return [...keys].filter((k) => this.clone().input(k) === 'correct');
  }

  /** 現在入力中の単位の番号 */
  get unitIndex(): number {
    return this.index;
  }

  /** これまでに正しく入力した文字列 */
  get typedText(): string {
    return this.typed;
  }

  get done(): boolean {
    return this.index >= this.units.length;
  }

  /** 1文字を入力します。英字の大文字は小文字として扱います。 */
  input(rawKey: string): KeyResult {
    if (this.done) return 'ignored';
    if ([...rawKey].length !== 1) return 'ignored';
    const key = rawKey.toLowerCase();
    if (this.tryKey(key)) {
      this.typed += key;
      return 'correct';
    }
    this.missAt[this.index] = true;
    return 'miss';
  }

  private tryKey(key: string): boolean {
    const unit = this.units[this.index]!;
    const nb = this.buffer + key;
    const matches = unit.cands.filter((c) => c.startsWith(nb));

    if (unit.isN && this.buffer === 'n' && matches.length === 0) {
      // 「ん」を n 1回で確定し、このキーを次の単位の入力として扱う
      if (this.rules.strictN || !this.singleNAllowed() || N_BLOCKERS.has(key)) return false;
      const next = this.units[this.index + 1]!;
      if (!next.cands.some((c) => c.startsWith(key))) return false;
      this.index++;
      this.buffer = '';
      return this.tryKey(key);
    }
    if (matches.length === 0 && this.buffer !== '' && unit.cands.includes(this.buffer) && this.index + 1 < this.units.length) {
      // 入力済みの部分で確定できる場合は確定し、このキーを次の単位へ回す
      const next = this.units[this.index + 1]!;
      if (!next.cands.some((c) => c.startsWith(key))) return false;
      this.index++;
      this.buffer = '';
      return this.tryKey(key);
    }
    if (matches.length === 0) return false;

    this.buffer = nb;
    const exact = matches.includes(nb);
    const longer = matches.some((c) => c.length > nb.length);
    if (exact && !longer) {
      this.index++;
      this.buffer = '';
    }
    return true;
  }

  /** 現在の「ん」を n 1回で確定できるか */
  private singleNAllowed(): boolean {
    const next = this.units[this.index + 1];
    if (!next) return false;
    return next.cands.some((c) => !N_BLOCKERS.has(c[0]!));
  }

  /** 次に押すべきキー（ガイドの先頭）。入力が終わっていれば null。 */
  nextKey(): string | null {
    const r = this.remaining();
    return r.length > 0 ? r[0]! : null;
  }

  /** これから入力する文字列のガイド */
  remaining(): string {
    if (this.done) return '';
    const unit = this.units[this.index]!;
    let out = '';
    if (unit.isN && this.buffer === 'n') {
      out += 'n';
    } else {
      const cand = unit.cands.find((c) => c.startsWith(this.buffer)) ?? unit.cands[0]!;
      out += cand.slice(this.buffer.length);
    }
    for (let i = this.index + 1; i < this.units.length; i++) out += this.units[i]!.cands[0]!;
    return out;
  }

  snapshot(): RomajiSnapshot {
    return {
      units: this.units,
      index: this.index,
      buffer: this.buffer,
      typed: this.typed,
      remaining: this.remaining(),
      missAt: [...this.missAt],
      done: this.done,
    };
  }
}

/** ドキュメント・テスト用：対応表記の一覧 */
export function supportedTable(): Array<{ kana: string; romaji: string[] }> {
  const rows: Array<{ kana: string; romaji: string[] }> = [];
  for (const [k, v] of Object.entries(SINGLE)) rows.push({ kana: k, romaji: v });
  for (const [k, v] of Object.entries(DOUBLE)) rows.push({ kana: k, romaji: v });
  rows.push({ kana: 'ん', romaji: [...N_CANDS, 'n（次が母音・や行・な行・ん以外のとき）'] });
  return rows;
}
