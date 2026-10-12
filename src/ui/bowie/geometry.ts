/**
 * ステージの配置（ステージの大きさ〔CSS の px〕から計算します。画面の大きさが変わっても、爆弾の進み具合 p は時間だけで決まります）。
 *
 * - キャラクターは足元（sprites.json の footX・footY）を地面の線に合わせます。
 *   ボウイの画像は体の高さがそろうように作ってあるため、どの画像も同じ高さで表示します。
 *   主人公の画像は同じ倍率で作ってあるため、待機の画像の高さを基準に、同じ倍率で表示します（表情で体が拡大・移動しません）。
 * - 爆弾は、放つ動作3の手に描かれた爆弾の位置から、主人公の衝突ラインまで等速で進みます。
 *   最終形態（v1.8.0）は「放つ」の手のひらの前から進みます。大きさは通常と同じ爆弾です。
 * - 最終形態の6枚は、同じ倍率で描かれた画像として同じ倍率で表示し（bodyH は待機の体の高さ）、足元を通常のボウイと同じ点に合わせます。
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
  /** 最終形態の「放つ」：手のひらの前の、独立した爆弾を出す位置（画像に対する比。画像に爆弾は描かれていません） */
  emit?: { x: number; y: number };
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
  /** 最終形態（v1.8.0）で爆弾が手を離れる位置（bowie_final_release の手のひらの前） */
  releaseFinal: { x: number; y: number };
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
  const rf = BOWIE_SPRITES.bowie_final_release!;
  const bf = bowie.bowie_final_release!;
  const releaseFinal = { x: bf.left + rf.emit!.x * bf.width, y: bf.top + rf.emit!.y * bf.height };
  const hi = hero.hero_idle!;
  const collision = { x: hi.left + hi.width * 0.78, y: hi.top + hi.height * 0.52 };
  return { w, h, groundY, bowie, hero, release, releaseFinal, collision, bombW, bombH };
}

/**
 * 最終形態の赤い最終決戦の背景（v1.8.0）の大きさと位置（CSS の background-size・background-position）。
 * この背景は円形の舞台が画像の中ほどにあり、下の約4分の1は暗い霧です。通常の背景と同じ「全体を覆う」配置では足元が霧に浮くため、
 * 舞台の手前の床（画像の上から FINAL_FLOOR_Y）が足元の線（groundY）にくるように、ステージを覆う最小の大きさで拡大して合わせます。
 */
export const FINAL_FLOOR_Y = 0.58;
export function finalBackground(g: StageGeometry): { size: string; position: string } {
  const sw = SCENES.stage_background_final!.w;
  const sh = SCENES.stage_background_final!.h;
  const height = Math.max(g.groundY / FINAL_FLOOR_Y, g.h, (g.w * sh) / sw);
  const width = (height * sw) / sh;
  const top = Math.min(0, Math.max(g.h - height, g.groundY - FINAL_FLOOR_Y * height));
  return { size: `${Math.ceil(width)}px ${Math.ceil(height)}px`, position: `${Math.round((g.w - width) / 2)}px ${Math.round(top)}px` };
}

/** 進み具合 p（0〜1）での爆弾の中心。わずかな弧をつけますが、始点・終点と p の関係は変えません */
export function bombCenter(g: StageGeometry, p: number, final = false): { x: number; y: number } {
  const q = Math.min(1, Math.max(0, p));
  const r = final ? g.releaseFinal : g.release;
  const x = r.x + (g.collision.x - r.x) * q;
  const arc = Math.sin(Math.PI * q) * g.h * 0.06;
  const y = r.y + (g.collision.y - r.y) * q - arc;
  return { x, y };
}
