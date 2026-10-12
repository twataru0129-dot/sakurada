import { expect, it } from 'vitest';
import { finalBackground, FINAL_FLOOR_Y, normalBackground, NORMAL_FLOOR_Y, SCENES, stageGeometry } from './geometry';
import { BGM_VOICE_DUCK, SOUNDS } from './audio';

const parse = (b: { size: string; position: string }) => {
  const [w, h] = b.size.split(' ').map((v) => parseFloat(v));
  const [x, y] = b.position.split(' ').map((v) => parseFloat(v));
  return { w: w!, h: h!, x: x!, y: y! };
};

it('通常・最終の背景：縦横比を保ち、ステージを覆い（上端・左右に空白なし）、床面が足元の線にくる。キャラクターの配置は背景で変わらない', () => {
  // Mac の横長・Surface 相当・フルHD・タブレット・スマホ（縦・横）のステージの大きさ
  for (const [w, h] of [[1712, 624], [1352, 560], [1904, 694], [804, 751], [374, 354], [828, 240]] as const) {
    const g = stageGeometry(w, h);
    for (const [b, scene, floorY] of [[normalBackground(g), 'stage_background', NORMAL_FLOOR_Y], [finalBackground(g), 'stage_background_final', FINAL_FLOOR_Y]] as const) {
      const r = parse(b);
      const src = SCENES[scene]!;
      expect(Math.abs(r.w / r.h - src.w / src.h)).toBeLessThan(0.01);
      expect(r.y).toBeLessThanOrEqual(0);
      expect(r.y + r.h).toBeGreaterThanOrEqual(h - 1);
      expect(r.x).toBeLessThanOrEqual(0);
      expect(r.x + r.w).toBeGreaterThanOrEqual(w - 1);
      // 床面（画像の floorY）が足元の線に1px以内で合う
      expect(Math.abs(r.y + floorY * r.h - g.groundY)).toBeLessThan(1.5);
    }
    // 背景はキャラクターの配置に使わない（同じ大きさなら同じ配置）
    expect(stageGeometry(w, h)).toEqual(g);
  }
  // 通常の背景の床面（石の舞台の手前の床。元の画像の y≈580〜655px／941px）
  expect(NORMAL_FLOOR_Y * 941).toBeGreaterThan(580);
  expect(NORMAL_FLOOR_Y * 941).toBeLessThan(655);
});

it('BGM の音量：通常は固有 1.0・ボイス中 35％、最終決戦は固有 2.0・ボイス中 50％（音楽20％で 20％・7％・40％・20％相当）。ほかの音の固有の音量は変えない', () => {
  const music = 0.2;
  expect(SOUNDS.bgm.volume).toBe(1);
  expect(SOUNDS.final_bgm.volume).toBe(2);
  expect(BGM_VOICE_DUCK).toEqual({ bgm: 0.35, final_bgm: 0.5 });
  expect(music * SOUNDS.bgm.volume).toBeCloseTo(0.2, 6);
  expect(music * SOUNDS.bgm.volume * BGM_VOICE_DUCK.bgm).toBeCloseTo(0.07, 6);
  expect(music * SOUNDS.final_bgm.volume).toBeCloseTo(0.4, 6);
  expect(music * SOUNDS.final_bgm.volume * BGM_VOICE_DUCK.final_bgm).toBeCloseTo(0.2, 6);
  expect(SOUNDS.hero_clear_bgm.volume).toBe(2);
});
