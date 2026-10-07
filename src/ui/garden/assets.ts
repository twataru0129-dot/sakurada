/** 桜ガーデンの画像（scripts/garden_assets.py で元の素材から切り出したもの）の URL */
import type { DecoKind, Species, Stage } from '../../core/garden/config';
import { DECO_SPRITES, TREE_SPRITES, type SpriteInfo } from '../../core/garden/layout';
import backgroundUrl from '../../assets/garden/backgrounds/garden_day.webp';

const files = import.meta.glob('../../assets/garden/{trees,decorations}/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byName = new Map(Object.entries(files).map(([path, url]) => [path.split('/').pop()!, url]));

export const BACKGROUND_URL = backgroundUrl;

export interface Sprite {
  url: string;
  info: SpriteInfo;
}

/** 特別な桜の画像は、届いたあとに別に読み込みます（special.ts）。ここでは通常の品種だけを扱います */
export function treeSprite(species: Species, stage: Stage, special: SpecialSprites | null): Sprite | null {
  if (species === 'special') return special?.[stage] ?? null;
  const info = TREE_SPRITES[species]?.[stage];
  const url = info && byName.get(info.file);
  return info && url ? { url, info } : null;
}

export function decoSprite(kind: DecoKind): Sprite {
  const info = DECO_SPRITES[kind];
  return { url: byName.get(info.file)!, info };
}

export type SpecialSprites = Record<Stage, Sprite>;
