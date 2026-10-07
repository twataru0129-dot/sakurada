/**
 * 庭の画面の配置（背景画像に対する比 0〜1 の座標。画面表示と、庭の画像の保存で同じ値を使います）。
 *
 * - 背景は固定カメラの庭。桜は3つの植える場所（根元の位置）のどれかに、根元を合わせて置きます。
 * - 大きさは画像の余白では決めず、品種の大きさ × 成長段階 × 奥行き（奥ほど小さく）で決めます。
 * - 飾りは地面の範囲の粗いマス目に置きます。桜の根元のまわりと、ほかの飾りとは重ねられません
 *   （樹冠の下には置けます）。描く順番は接地位置（根元・飾りの下端）の上下で決めます（手前ほど前）。
 */
import sprites from '../../data/garden/sprites.json';
import type { DecoKind, Species, Stage } from './config';

export interface SpriteInfo {
  file: string;
  w: number;
  h: number;
  /** 根元（接地点）の位置（画像に対する比） */
  groundX: number;
  groundY: number;
}
export const SCENE = { w: sprites.background.w, h: sprites.background.h };
export const SCENE_ASPECT = SCENE.w / SCENE.h;

export const TREE_SPRITES = sprites.trees as Record<string, Record<Stage, SpriteInfo>>;
export const DECO_SPRITES = sprites.decorations as Record<DecoKind, SpriteInfo>;

/** 植える場所（根元の位置） */
export const TREE_SLOTS: readonly { x: number; y: number }[] = [
  { x: 0.31, y: 0.47 },
  { x: 0.565, y: 0.425 },
  { x: 0.815, y: 0.49 },
];

/** 満開の高さ（背景の高さに対する比）の基準と、品種・段階ごとの倍率 */
const BLOOM_HEIGHT = 0.4;
const SPECIES_SCALE: Partial<Record<Species, number>> = { asahiyama: 0.8, amanogawa: 1.06, special: 1.04 };
const STAGE_SCALE: Record<Stage, number> = { sapling: 0.36, young: 0.68, buds: 0.9, bloom: 1 };
/** 奥行き：奥（上）ほど小さく */
export const depthScale = (y: number): number => 0.86 + (y - 0.42) * 1.6;

export interface Placed {
  /** 左上と大きさ（背景に対する比） */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 描く順番（接地位置の上下。大きいほど手前） */
  z: number;
}

export function treeBox(species: Species, stage: Stage, slot: number, sprite: SpriteInfo): Placed {
  const base = TREE_SLOTS[slot]!;
  const height = BLOOM_HEIGHT * (SPECIES_SCALE[species] ?? 1) * STAGE_SCALE[stage] * depthScale(base.y);
  const width = (height * (sprite.w / sprite.h)) / SCENE_ASPECT;
  return { left: base.x - sprite.groundX * width, top: base.y - sprite.groundY * height, width, height, z: base.y };
}

/** 飾りのマス目（地面の範囲） */
export const GRID = { cols: 12, rows: 6, x0: 0.18, x1: 0.96, y0: 0.44, y1: 0.95 } as const;
export const CELL_W = (GRID.x1 - GRID.x0) / GRID.cols;
export const CELL_H = (GRID.y1 - GRID.y0) / GRID.rows;

/** 飾りが占めるマスの数（横・縦）と、画像の幅（マスの幅に対する倍率） */
export const FOOTPRINT: Record<DecoKind, { cols: number; rows: number; spriteScale: number }> = {
  flowerbed: { cols: 2, rows: 1, spriteScale: 1.05 },
  stepping_stones: { cols: 3, rows: 1, spriteScale: 1 },
  wooden_bench: { cols: 2, rows: 1, spriteScale: 1.1 },
  stone_lantern: { cols: 1, rows: 1, spriteScale: 1.25 },
  small_pond: { cols: 3, rows: 2, spriteScale: 1 },
};

export interface CellRect {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

/** 桜の根元のまわり（ここには飾りを置けません）。桜がまだ植えられていない場所も、植えられるように空けておきます */
export const ROOT_ZONES: readonly CellRect[] = TREE_SLOTS.map((s) => {
  const col = Math.floor((s.x - 0.05 - GRID.x0) / CELL_W);
  const colEnd = Math.floor((s.x + 0.05 - GRID.x0) / CELL_W);
  const row = Math.max(0, Math.floor((s.y - 0.04 - GRID.y0) / CELL_H));
  const rowEnd = Math.floor((s.y + 0.03 - GRID.y0) / CELL_H);
  return { col, row, cols: colEnd - col + 1, rows: Math.max(0, rowEnd - row + 1) };
}).filter((z) => z.rows > 0);

const overlaps = (a: CellRect, b: CellRect) => a.col < b.col + b.cols && b.col < a.col + a.cols && a.row < b.row + b.rows && b.row < a.row + a.rows;

export const footprintAt = (kind: DecoKind, col: number, row: number): CellRect => ({ col, row, ...FOOTPRINT[kind] });

/** 押したマスを基準に置く位置を決めます（押したマスが飾りの下の段の中ほどになるように） */
export function anchorToCell(kind: DecoKind, col: number, row: number): { col: number; row: number } {
  const f = FOOTPRINT[kind];
  const c = Math.min(Math.max(0, col - Math.floor((f.cols - 1) / 2)), GRID.cols - f.cols);
  const r = Math.min(Math.max(0, row - (f.rows - 1)), GRID.rows - f.rows);
  return { col: c, row: r };
}

export type PlaceCheck = 'ok' | 'outside' | 'occupied';

/** 置けるか（庭の中・桜の根元とほかの飾りに重ならない） */
export function canPlace(rect: CellRect, others: readonly CellRect[]): PlaceCheck {
  if (!Number.isInteger(rect.col) || !Number.isInteger(rect.row)) return 'outside';
  if (rect.col < 0 || rect.row < 0 || rect.col + rect.cols > GRID.cols || rect.row + rect.rows > GRID.rows) return 'outside';
  if (ROOT_ZONES.some((z) => overlaps(rect, z))) return 'occupied';
  if (others.some((o) => overlaps(rect, o))) return 'occupied';
  return 'ok';
}

export function decoBox(kind: DecoKind, col: number, row: number): Placed {
  const f = FOOTPRINT[kind];
  const s = DECO_SPRITES[kind];
  const width = f.cols * CELL_W * f.spriteScale;
  const height = (width * SCENE_ASPECT * s.h) / s.w;
  const cx = GRID.x0 + (col + f.cols / 2) * CELL_W;
  const bottom = GRID.y0 + (row + f.rows) * CELL_H;
  return { left: cx - width / 2, top: bottom - height + 0.004, width, height, z: bottom };
}

/** 背景上の点（比）から、マス目の位置 */
export function cellAt(x: number, y: number): { col: number; row: number } | null {
  if (x < GRID.x0 || x >= GRID.x1 || y < GRID.y0 || y >= GRID.y1) return null;
  return { col: Math.floor((x - GRID.x0) / CELL_W), row: Math.floor((y - GRID.y0) / CELL_H) };
}
