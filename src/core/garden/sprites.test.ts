import { describe, expect, it } from 'vitest';
import sprites from '../../data/garden/sprites.json';
import special from '../../data/garden/special_sprites.json';
import { STAGES, STANDARD_SPECIES, type Stage } from './config';
import { DECO_SPRITES, ROOT_ZONES, SCENE, TREE_SLOTS, TREE_SPRITES, treeBox, type SpriteInfo } from './layout';

/** 同梱している画像（フォルダ/ファイル名） */
const shipped = new Set(Object.keys(import.meta.glob('../../assets/garden/**/*.webp')).map((p) => p.split('/').slice(-2).join('/')));
const existsSync = (f: string) => shipped.has(f);

describe('桜と飾りの画像（素材シートからの切り出し）', () => {
  it('通常の8種類それぞれに、苗木・若木・つぼみ・満開の別々の画像がある（関山の満開につぼみの画像を使っていない）', () => {
    for (const sp of STANDARD_SPECIES) {
      const files = STAGES.map((st) => TREE_SPRITES[sp]![st].file);
      expect(files, sp).toEqual(STAGES.map((st) => `${sp}_${st}.webp`));
      expect(new Set(files).size).toBe(4);
      for (const f of files) expect(existsSync(`trees/${f}`), f).toBe(true);
    }
    expect(TREE_SPRITES.kanzan!.bloom.file).toBe('kanzan_bloom.webp');
    expect(TREE_SPRITES.kanzan!.bloom.file).not.toBe(TREE_SPRITES.kanzan!.buds.file);
  });
  it('特別な桜の画像は別のフォルダ・別の表にあり、通常の表には入っていない', () => {
    expect(Object.keys(sprites.trees)).toHaveLength(8);
    const sp = Object.values(special.trees)[0] as Record<Stage, SpriteInfo>;
    for (const st of STAGES) expect(existsSync(`special/${sp[st].file}`)).toBe(true);
  });
  it('根元（接地点）は画像の下のほうで、左右の中ほど', () => {
    const all = [...Object.values(TREE_SPRITES), ...Object.values(special.trees as Record<string, Record<Stage, SpriteInfo>>)];
    for (const st of all) for (const s of STAGES) {
      expect(st[s].groundY).toBeGreaterThan(0.85);
      expect(st[s].groundX).toBeGreaterThan(0.3);
      expect(st[s].groundX).toBeLessThan(0.7);
    }
  });
  it('成長するほど大きくなる（苗木 → 若木 → つぼみ → 満開）。旭山は小さく、天の川は細長い', () => {
    for (const sp of STANDARD_SPECIES) {
      const h = STAGES.map((st) => treeBox(sp, st, 0, TREE_SPRITES[sp]![st]).height);
      for (let i = 1; i < h.length; i++) expect(h[i]!).toBeGreaterThan(h[i - 1]!);
    }
    const bloom = (sp: (typeof STANDARD_SPECIES)[number]) => treeBox(sp, 'bloom', 0, TREE_SPRITES[sp]!.bloom);
    expect(bloom('asahiyama').height).toBeLessThan(bloom('somei_yoshino').height);
    const ama = bloom('amanogawa');
    const somei = bloom('somei_yoshino');
    expect(ama.width / ama.height).toBeLessThan((somei.width / somei.height) * 0.75);
  });
  it('満開の桜は、植える場所に根元を合わせても庭の画面からはみ出さない（上端・左右）', () => {
    for (const sp of STANDARD_SPECIES) {
      TREE_SLOTS.forEach((_, slot) => {
        const b = treeBox(sp, 'bloom', slot, TREE_SPRITES[sp]!.bloom);
        expect(b.top, `${sp} ${slot}`).toBeGreaterThan(0);
        expect(b.left).toBeGreaterThan(-0.02);
        expect(b.left + b.width).toBeLessThan(1.02);
      });
    }
  });
  it('飾り5種類の画像があり、桜の根元の場所はマス目の中にある', () => {
    for (const [k, s] of Object.entries(DECO_SPRITES)) expect(existsSync(`decorations/${s.file}`), k).toBe(true);
    expect(ROOT_ZONES.length).toBe(3);
    expect(SCENE.w / SCENE.h).toBeCloseTo(1586 / 992, 3);
  });
});
