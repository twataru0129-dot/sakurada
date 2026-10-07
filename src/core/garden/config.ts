/**
 * 桜ガーデンの数値の設定（ここと catalog.json だけで管理します。実機で調整するときはここを変えます）。
 *
 * - 桜の品種・飾りの名前・説明・価格・お店に並ぶ条件：src/data/garden/catalog.json
 * - 成長に必要な水・ごほうび・庭が使えるようになる条件・問題数：このファイル
 */
import catalog from '../../data/garden/catalog.json';

export type StandardSpecies =
  | 'somei_yoshino'
  | 'yae_beni_shidare'
  | 'kanzan'
  | 'asahiyama'
  | 'ukon'
  | 'gyoiko'
  | 'amanogawa'
  | 'kenrokuen_kikuzakura';
/** 'special' は特別な桜（条件を満たしたときだけ登場します） */
export type Species = StandardSpecies | 'special';
export type DecoKind = 'flowerbed' | 'stepping_stones' | 'wooden_bench' | 'stone_lantern' | 'small_pond';
export type Stage = 'sapling' | 'young' | 'buds' | 'bloom';
export const STAGES: readonly Stage[] = ['sapling', 'young', 'buds', 'bloom'];

export interface TreeCatalogEntry {
  id: StandardSpecies;
  name: string;
  name_reading: string;
  flower_color: string;
  tree_shape: string;
  description: string;
  shop_description: string;
  unlock_completed_problems: number;
  price_petals: number;
}
export interface DecoCatalogEntry {
  id: DecoKind;
  name: string;
  name_reading: string;
  description: string;
  price_petals: number;
}

export const TREE_CATALOG = catalog.standard_trees as TreeCatalogEntry[];
export const DECO_CATALOG = catalog.decorations as DecoCatalogEntry[];
export const STANDARD_SPECIES: readonly StandardSpecies[] = TREE_CATALOG.map((t) => t.id);
export const DECO_KINDS: readonly DecoKind[] = DECO_CATALOG.map((d) => d.id);
export const COPY = catalog.ui;
export const HELP_PAGES = catalog.help_pages;

export const treeEntry = (s: StandardSpecies): TreeCatalogEntry => TREE_CATALOG.find((t) => t.id === s)!;
export const decoEntry = (k: DecoKind): DecoCatalogEntry => DECO_CATALOG.find((d) => d.id === k)!;

/** 成長に必要な水（累計）。若木・つぼみ・満開になる量 */
export const GROWTH = {
  /** 最初に無料で受け取るソメイヨシノ1本 */
  first: { young: 5, buds: 10, bloom: 20 },
  /** 通常の桜（2本目以降のソメイヨシノを含む） */
  standard: { young: 10, buds: 25, bloom: 50 },
  /** 特別な桜 */
  special: { young: 20, buds: 50, bloom: 100 },
} as const;

export const REWARD = {
  /** 1問完成ごと */
  waterPerProblem: 1,
  petalsPerProblem: 1,
  /** 完成した問題の読み（かな）の文字数の累計で、この文字数ごとに水1 */
  kanaPerBonusWater: 20,
} as const;

/** 庭の数と、使えるようになる累計完成問題数（1つ目は最初から） */
export const GARDEN_UNLOCKS: readonly number[] = [0, 150, 350];
export const TREES_PER_GARDEN = 3;
export const GARDEN_NAME_MAX = 20;
export const INITIAL_GARDEN_NAMES: readonly string[] = catalog.ui.garden.initial_names;

export const PROBLEM_COUNTS = catalog.ui.practice.count_options as readonly number[];
export const DEFAULT_PROBLEM_COUNT = catalog.ui.practice.default_count;

/** 「水を5使う」の量 */
export const WATER_STEP = 5;

/** 文章の {name} などに値を入れます */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
}
