/**
 * ステージの配置（ステージの大きさ〔CSS の px〕から計算します。画面の大きさが変わっても、爆弾の進み具合 p は時間だけで決まります）。
 *
 * - キャラクターは足元（sprites.json の footX・footY）を地面の線に合わせます。
 *   ボウイの画像は体の高さがそろうように作ってあるため、どの画像も同じ高さで表示します。
 *   主人公の画像は同じ倍率で作ってあるため、待機の画像の高さを基準に、同じ倍率で表示します（表情で体が拡大・移動しません）。
 * - 爆弾は、放つ動作3の手に描かれた爆弾の位置から、主人公の衝突ラインまで等速で進みます。
 *   衝突ラインは主人公の待機の画像の位置で決め、表情の画像の幅では変えません。
 */
import sprites from '../../data/bowie/sprites.json';

export interface Sprite {
  file: string;
  w: number;
  h: number;
  footX: number;
  footY: number;
  bodyH: number;
  bomb?: { x: number; y: number; glyphW: number };
}
export const BOWIE_SPRITES = sprites.bowie as Record<string, Sprite>;
export const HERO_SPRITES = sprites.hero as Record<string, Sprite>;
export const BOMB_SPRITE = sprites.bomb;
export const SCENES = sprites.scenes;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface StageGeometry {
  w: number;
  h: number;
  groundY: number;
  bowie: Record<string, Box>;
  hero: Record<string, Box>;
  /** 爆弾が手を離れる位置（中心）と、衝突ライン（中心） */
  release: { x: number; y: number };
  collision: { x: number; y: number };
  bombW: number;
  bombH: number;
}

function place(s: Sprite, footX: number, groundY: number, height: number): Box {
  const width = (height * s.w) / s.h;
  return { left: footX - s.footX * width, top: groundY - s.footY * height, width, height };
}

export function stageGeometry(w: number, h: number): StageGeometry {
  const groundY = h * 0.9;
  // ボウイ（人）の体の高さと、主人公（鳥）の待機の高さ
  const bowieBody = Math.min(h * 0.82, w * 0.36);
  const heroIdle = HERO_SPRITES.hero_idle!;
  const heroIdleH = Math.min(h * 0.5, w * 0.24) / heroIdle.bodyH;
  const heroScale = heroIdleH / heroIdle.h;
  const heroFootX = w * 0.14;
  const bowieFootX = w * 0.86;
  const bowie: Record<string, Box> = {};
  for (const [k, s] of Object.entries(BOWIE_SPRITES)) bowie[k] = place(s, bowieFootX, groundY, bowieBody / s.bodyH);
  const hero: Record<string, Box> = {};
  for (const [k, s] of Object.entries(HERO_SPRITES)) hero[k] = place(s, heroFootX, groundY, s.h * heroScale);
  const r3 = BOWIE_SPRITES.bowie_release_3!;
  const b3 = bowie.bowie_release_3!;
  const release = { x: b3.left + r3.bomb!.x * b3.width, y: b3.top + r3.bomb!.y * b3.height };
  const bodyPx = r3.bomb!.glyphW * b3.width * BOMB_SPRITE.bodyPerGlyph;
  const bombW = bodyPx / BOMB_SPRITE.bodyW;
  const bombH = (bombW * BOMB_SPRITE.h) / BOMB_SPRITE.w;
  const hi = hero.hero_idle!;
  const collision = { x: hi.left + hi.width * 0.78, y: hi.top + hi.height * 0.52 };
  return { w, h, groundY, bowie, hero, release, collision, bombW, bombH };
}

/** 進み具合 p（0〜1）での爆弾の中心。わずかな弧をつけますが、始点・終点と p の関係は変えません */
export function bombCenter(g: StageGeometry, p: number): { x: number; y: number } {
  const q = Math.min(1, Math.max(0, p));
  const x = g.release.x + (g.collision.x - g.release.x) * q;
  const arc = Math.sin(Math.PI * q) * g.h * 0.06;
  const y = g.release.y + (g.collision.y - g.release.y) * q - arc;
  return { x, y };
}
