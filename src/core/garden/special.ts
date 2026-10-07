/**
 * 特別な桜の文章と画像。届いたあとにだけ読み込みます（それまでは画面に何も出しません）。
 */
import data from '../../data/garden/special.json';
import sprites from '../../data/garden/special_sprites.json';
import type { Stage } from './config';
import type { SpriteInfo } from './layout';

const files = import.meta.glob('../../assets/garden/special/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byName = new Map(Object.entries(files).map(([path, url]) => [path.split('/').pop()!, url]));
const info = Object.values(sprites.trees)[0] as Record<Stage, SpriteInfo>;

export const SPECIAL_TREE = data.tree;
export const SPECIAL_UI = data.ui;
export const SPECIAL_SPRITES = Object.fromEntries(
  (Object.entries(info) as [Stage, SpriteInfo][]).map(([stage, i]) => [stage, { url: byName.get(i.file)!, info: i }]),
) as Record<Stage, { url: string; info: SpriteInfo }>;
