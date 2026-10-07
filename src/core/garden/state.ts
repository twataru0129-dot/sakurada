/**
 * 桜ガーデンの記録と状態。
 *
 * 記録は「出来事（イベント）」の一覧として保存し、画面の状態はそれを古い順にたどって毎回計算し直します。
 * - 出来事には一つずつ ID があり、同じ ID は一度しか数えません。再送・再読み込み・複数の端末の記録を合わせても、
 *   ごほうび・苗・飾りが二重になりません（問題の完成は「練習の ID ＋ 何問目か」が ID です）。
 * - 出来事は、そのときの状態で正しい場合だけ反映します（花びらが足りない交換・必要以上の水やり・満開の木への水やり・
 *   重なる配置などは反映しません）。別の端末で同時に使った記録を合わせたときも、残高がマイナスになりません。
 * - ごほうびは問題が完成したときだけ、その問題の読みのかなの文字数で計算します（打鍵数・ミス・打ち直しは関係しません）。
 * - 時間の経過では何も変わりません（枯れる・減る・戻ることはありません）。
 */
import {
  DECO_CATALOG,
  DECO_KINDS,
  GARDEN_NAME_MAX,
  GARDEN_UNLOCKS,
  GROWTH,
  INITIAL_GARDEN_NAMES,
  PROBLEM_COUNTS,
  DEFAULT_PROBLEM_COUNT,
  REWARD,
  STANDARD_SPECIES,
  TREES_PER_GARDEN,
  treeEntry,
  type DecoKind,
  type Species,
  type Stage,
  type StandardSpecies,
} from './config';
import { kanaCount, problemById } from './problems';
import { canPlace, footprintAt, type CellRect } from './layout';

export const GARDEN_DATA_VERSION = 1;

export type GardenEventType =
  | 'session'
  | 'solve'
  | 'end'
  | 'first'
  | 'buy_tree'
  | 'buy_deco'
  | 'water'
  | 'plant'
  | 'unplant'
  | 'place'
  | 'move'
  | 'stow'
  | 'rename'
  | 'count'
  | 'seen';

export interface GardenEvent {
  /** 出来事の ID（同じ ID は一度だけ数えます） */
  id: string;
  /** 端末の時刻（ミリ秒）。たどる順番に使います */
  at: number;
  type: GardenEventType;
  data: Record<string, unknown>;
}

export interface TreeInstance {
  id: string;
  species: Species;
  /** これまでに使った水の量 */
  water: number;
  /** 最初に無料で受け取ったソメイヨシノ（成長が早い） */
  firstFree: boolean;
  acquiredAt: number;
}

export interface PlacedDeco {
  id: string;
  kind: DecoKind;
  garden: number;
  col: number;
  row: number;
}

export interface GardenPlot {
  name: string;
  /** 植える場所ごとの桜の ID */
  trees: (string | null)[];
}

export interface PracticeSession {
  id: string;
  problems: string[];
  solved: Set<number>;
  ended: boolean;
  startedAt: number;
}

export interface GardenState {
  water: number;
  petals: number;
  /** かなの文字数の端数（20 未満。次の問題・次の練習へ持ち越します） */
  kanaCarry: number;
  /** 累計の完成問題数 */
  completed: number;
  totalKana: number;
  trees: TreeInstance[];
  /** 苗を手に入れたことのある通常の品種と、最初に手に入れた時刻 */
  acquired: Map<StandardSpecies, number>;
  /** 満開にしたことのある品種と、最初に満開にした時刻（図鑑） */
  bloomed: Map<Species, number>;
  firstGranted: boolean;
  /** 特別な桜の苗が届いたか・知らせを見たか */
  specialGranted: boolean;
  specialSeen: boolean;
  decoOwned: Record<DecoKind, number>;
  decos: PlacedDeco[];
  gardens: GardenPlot[];
  problemCount: number;
  sessions: Map<string, PracticeSession>;
  /** 最近出題した問題（新しい順） */
  recent: string[];
  /** 反映した出来事の ID */
  applied: Set<string>;
  /** 正しくないため反映しなかった出来事の数 */
  rejected: number;
}

export const SPECIAL_TREE_ID = 'gift-1';
export const FIRST_TREE_ID = 'first-1';
export const FIRST_EVENT_ID = 'first';
const RECENT_LIMIT = 150;

export function emptyState(): GardenState {
  return {
    water: 0,
    petals: 0,
    kanaCarry: 0,
    completed: 0,
    totalKana: 0,
    trees: [],
    acquired: new Map(),
    bloomed: new Map(),
    firstGranted: false,
    specialGranted: false,
    specialSeen: false,
    decoOwned: Object.fromEntries(DECO_KINDS.map((k) => [k, 0])) as Record<DecoKind, number>,
    decos: [],
    gardens: GARDEN_UNLOCKS.map((_, i) => ({ name: INITIAL_GARDEN_NAMES[i] ?? `庭${i + 1}`, trees: Array(TREES_PER_GARDEN).fill(null) })),
    problemCount: DEFAULT_PROBLEM_COUNT,
    sessions: new Map(),
    recent: [],
    applied: new Set(),
    rejected: 0,
  };
}

export function thresholdsOf(t: Pick<TreeInstance, 'species' | 'firstFree'>): { young: number; buds: number; bloom: number } {
  if (t.species === 'special') return GROWTH.special;
  return t.firstFree ? GROWTH.first : GROWTH.standard;
}

export function stageOf(t: Pick<TreeInstance, 'species' | 'firstFree' | 'water'>): Stage {
  const th = thresholdsOf(t);
  if (t.water >= th.bloom) return 'bloom';
  if (t.water >= th.buds) return 'buds';
  if (t.water >= th.young) return 'young';
  return 'sapling';
}

/** 次の段階までに必要な累計の水（満開なら null） */
export function nextThreshold(t: TreeInstance): number | null {
  const th = thresholdsOf(t);
  if (t.water < th.young) return th.young;
  if (t.water < th.buds) return th.buds;
  if (t.water < th.bloom) return th.bloom;
  return null;
}

export const remainingToBloom = (t: TreeInstance): number => Math.max(0, thresholdsOf(t).bloom - t.water);

export const unlockedGardenCount = (s: Pick<GardenState, 'completed'>): number => GARDEN_UNLOCKS.filter((n) => s.completed >= n).length;

export const isSpeciesUnlocked = (s: Pick<GardenState, 'completed'>, sp: StandardSpecies): boolean => s.completed >= treeEntry(sp).unlock_completed_problems;

export function treePrice(s: Pick<GardenState, 'firstGranted'>, sp: StandardSpecies): number | 'free' {
  if (sp === 'somei_yoshino' && !s.firstGranted) return 'free';
  return treeEntry(sp).price_petals;
}

/** 飾りの、どこかの庭に置いている数と持ちものにある数 */
export function decoCounts(s: GardenState, kind: DecoKind): { owned: number; placed: number; available: number } {
  const owned = s.decoOwned[kind];
  const placed = s.decos.filter((d) => d.kind === kind).length;
  return { owned, placed, available: owned - placed };
}

/** その桜を植えている庭と場所（植えていなければ null） */
export function plantedAt(s: GardenState, treeId: string): { garden: number; slot: number } | null {
  for (let g = 0; g < s.gardens.length; g++) {
    const slot = s.gardens[g]!.trees.indexOf(treeId);
    if (slot >= 0) return { garden: g, slot };
  }
  return null;
}

export function decoRects(s: GardenState, garden: number, exceptId?: string): CellRect[] {
  return s.decos.filter((d) => d.garden === garden && d.id !== exceptId).map((d) => footprintAt(d.kind, d.col, d.row));
}

const str = (v: unknown, max = 80): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const int = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);
const isStandard = (v: unknown): v is StandardSpecies => typeof v === 'string' && (STANDARD_SPECIES as readonly string[]).includes(v);
const isDeco = (v: unknown): v is DecoKind => typeof v === 'string' && (DECO_KINDS as readonly string[]).includes(v);
const TYPES = new Set<string>(['session', 'solve', 'end', 'first', 'buy_tree', 'buy_deco', 'water', 'plant', 'unplant', 'place', 'move', 'stow', 'rename', 'count', 'seen']);

/** 保存されていた出来事（形が正しくない可能性がある）を確かめます */
export function parseEvent(raw: unknown): GardenEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 120);
  if (!id || typeof r.at !== 'number' || !Number.isFinite(r.at) || typeof r.type !== 'string' || !TYPES.has(r.type)) return null;
  if (!r.data || typeof r.data !== 'object' || Array.isArray(r.data)) return null;
  return { id, at: r.at, type: r.type as GardenEventType, data: r.data as Record<string, unknown> };
}

/** 出来事をたどる順番（端末の時刻、同じなら ID の順。どの端末でも同じ順番になります） */
export function compareEvents(a: GardenEvent, b: GardenEvent): number {
  return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function grant(s: GardenState, tree: TreeInstance) {
  s.trees.push(tree);
  if (tree.species !== 'special' && !s.acquired.has(tree.species)) s.acquired.set(tree.species, tree.acquiredAt);
  // 通常の8種類の苗を一度ずつ手に入れたら、特別な苗が1本だけ届きます（満開や配置は条件にしません）
  if (!s.specialGranted && STANDARD_SPECIES.every((sp) => s.acquired.has(sp))) {
    s.specialGranted = true;
    s.trees.push({ id: SPECIAL_TREE_ID, species: 'special', water: 0, firstFree: false, acquiredAt: tree.acquiredAt });
  }
}

/** 1つの出来事を反映します（反映したら true） */
export function applyEvent(s: GardenState, e: GardenEvent): boolean {
  if (s.applied.has(e.id)) return false;
  const ok = apply(s, e);
  // 反映できなかった出来事も ID は覚えます（同じ出来事を何度たどっても結果が変わらないように）
  s.applied.add(e.id);
  if (!ok) s.rejected++;
  return ok;
}

function apply(s: GardenState, e: GardenEvent): boolean {
  const d = e.data;
  switch (e.type) {
    case 'session': {
      const id = str(d.session);
      const list = Array.isArray(d.problems) ? d.problems : null;
      if (!id || !list || s.sessions.has(id) || !PROBLEM_COUNTS.includes(list.length)) return false;
      if (!list.every((p) => typeof p === 'string' && problemById(p)) || new Set(list).size !== list.length) return false;
      s.sessions.set(id, { id, problems: list as string[], solved: new Set(), ended: false, startedAt: e.at });
      s.recent = [...(list as string[]), ...s.recent.filter((x) => !list.includes(x))].slice(0, RECENT_LIMIT);
      return true;
    }
    case 'solve': {
      const ses = s.sessions.get(str(d.session) ?? '');
      const i = int(d.index, 0, 100);
      if (!ses || i === null || i >= ses.problems.length || ses.solved.has(i) || e.id !== solveEventId(ses.id, i)) return false;
      const p = problemById(ses.problems[i]!);
      if (!p) return false;
      ses.solved.add(i);
      const kana = kanaCount(p);
      s.completed += 1;
      s.totalKana += kana;
      s.water += REWARD.waterPerProblem;
      s.petals += REWARD.petalsPerProblem;
      s.kanaCarry += kana;
      s.water += Math.floor(s.kanaCarry / REWARD.kanaPerBonusWater);
      s.kanaCarry %= REWARD.kanaPerBonusWater;
      return true;
    }
    case 'end': {
      const ses = s.sessions.get(str(d.session) ?? '');
      if (!ses || ses.ended) return false;
      ses.ended = true;
      return true;
    }
    case 'first': {
      if (s.firstGranted || e.id !== FIRST_EVENT_ID) return false;
      s.firstGranted = true;
      grant(s, { id: FIRST_TREE_ID, species: 'somei_yoshino', water: 0, firstFree: true, acquiredAt: e.at });
      return true;
    }
    case 'buy_tree': {
      const sp = d.species;
      const tid = str(d.tree);
      if (!isStandard(sp) || !tid || s.trees.some((t) => t.id === tid)) return false;
      if (!isSpeciesUnlocked(s, sp)) return false;
      const price = treePrice(s, sp);
      if (price === 'free' || s.petals < price) return false;
      s.petals -= price;
      grant(s, { id: tid, species: sp, water: 0, firstFree: false, acquiredAt: e.at });
      return true;
    }
    case 'buy_deco': {
      const k = d.kind;
      if (!isDeco(k)) return false;
      const price = decoPrice(k);
      if (s.petals < price) return false;
      s.petals -= price;
      s.decoOwned[k] += 1;
      return true;
    }
    case 'water': {
      const t = s.trees.find((x) => x.id === d.tree);
      const want = int(d.amount, 1, 1000);
      if (!t || want === null) return false;
      const amount = Math.min(want, s.water, remainingToBloom(t));
      if (amount <= 0) return false;
      s.water -= amount;
      t.water += amount;
      if (stageOf(t) === 'bloom' && !s.bloomed.has(t.species)) s.bloomed.set(t.species, e.at);
      return true;
    }
    case 'plant': {
      const t = s.trees.find((x) => x.id === d.tree);
      const g = int(d.garden, 0, s.gardens.length - 1);
      const slot = int(d.slot, 0, TREES_PER_GARDEN - 1);
      if (!t || g === null || slot === null || g >= unlockedGardenCount(s)) return false;
      const at = plantedAt(s, t.id);
      if (at && at.garden === g && at.slot === slot) return false;
      // ほかの庭・場所にあれば移します。植える場所にほかの桜があれば、その桜は持ちものに戻ります
      if (at) s.gardens[at.garden]!.trees[at.slot] = null;
      s.gardens[g]!.trees[slot] = t.id;
      return true;
    }
    case 'unplant': {
      const at = plantedAt(s, str(d.tree) ?? '');
      if (!at) return false;
      s.gardens[at.garden]!.trees[at.slot] = null;
      return true;
    }
    case 'place': {
      const id = str(d.deco);
      const k = d.kind;
      const g = int(d.garden, 0, s.gardens.length - 1);
      const col = int(d.col, 0, 100);
      const row = int(d.row, 0, 100);
      if (!id || !isDeco(k) || g === null || col === null || row === null || g >= unlockedGardenCount(s)) return false;
      if (s.decos.some((x) => x.id === id) || decoCounts(s, k).available <= 0) return false;
      if (canPlace(footprintAt(k, col, row), decoRects(s, g)) !== 'ok') return false;
      s.decos.push({ id, kind: k, garden: g, col, row });
      return true;
    }
    case 'move': {
      const deco = s.decos.find((x) => x.id === d.deco);
      const g = int(d.garden, 0, s.gardens.length - 1);
      const col = int(d.col, 0, 100);
      const row = int(d.row, 0, 100);
      if (!deco || g === null || col === null || row === null || g >= unlockedGardenCount(s)) return false;
      if (canPlace(footprintAt(deco.kind, col, row), decoRects(s, g, deco.id)) !== 'ok') return false;
      Object.assign(deco, { garden: g, col, row });
      return true;
    }
    case 'stow': {
      const i = s.decos.findIndex((x) => x.id === d.deco);
      if (i < 0) return false;
      s.decos.splice(i, 1);
      return true;
    }
    case 'rename': {
      const g = int(d.garden, 0, s.gardens.length - 1);
      const name = typeof d.name === 'string' ? cleanGardenName(d.name) : null;
      if (g === null || !name || g >= unlockedGardenCount(s)) return false;
      s.gardens[g]!.name = name;
      return true;
    }
    case 'count': {
      const n = d.count;
      if (typeof n !== 'number' || !PROBLEM_COUNTS.includes(n)) return false;
      s.problemCount = n;
      return true;
    }
    case 'seen': {
      if (d.what !== 'special' || !s.specialGranted) return false;
      s.specialSeen = true;
      return true;
    }
  }
}

const DECO_PRICES = Object.fromEntries(DECO_CATALOG.map((d) => [d.id, d.price_petals])) as Record<DecoKind, number>;
export const decoPrice = (k: DecoKind): number => DECO_PRICES[k];

/** 新しい出来事・桜・飾りの ID */
export function newId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export const solveEventId = (session: string, index: number): string => `solve:${session}:${index}`;

/** 庭の名前：前後の空白を除いて1〜20文字。使えないときは null */
export function cleanGardenName(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  const n = [...t].length;
  return n >= 1 && n <= GARDEN_NAME_MAX ? t : null;
}

/** 出来事の一覧から状態を作ります（同じ ID は一度だけ。順番は compareEvents） */
export function foldEvents(events: readonly GardenEvent[]): GardenState {
  const s = emptyState();
  for (const e of [...events].sort(compareEvents)) applyEvent(s, e);
  return s;
}

/** 2つの出来事の一覧を合わせます（ID で重複を除きます） */
export function mergeEvents(a: readonly GardenEvent[], b: readonly GardenEvent[]): GardenEvent[] {
  const map = new Map<string, GardenEvent>();
  for (const e of [...a, ...b]) if (!map.has(e.id)) map.set(e.id, e);
  return [...map.values()].sort(compareEvents);
}

/** 続きから始められる練習（終えていない・全部は完成していない、いちばん新しい練習） */
export function resumableSession(s: GardenState): PracticeSession | null {
  let latest: PracticeSession | null = null;
  for (const ses of s.sessions.values()) if (!latest || ses.startedAt > latest.startedAt) latest = ses;
  if (!latest || latest.ended || latest.solved.size >= latest.problems.length) return null;
  return latest;
}
