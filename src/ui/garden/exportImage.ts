/**
 * 庭の画像（PNG）を作ります。背景と、庭に置いた桜・飾りだけを描きます（操作のボタン・練習の欄・説明は入れません）。
 * 画像はすべてこのアプリと同じ場所から読み込むため、キャンバスが書き出せなくなる（CORS）ことはありません。
 * すべての画像の読み込みが終わってから描きます。
 */
import { decoBox, SCENE, treeBox } from '../../core/garden/layout';
import { stageOf, type GardenState } from '../../core/garden/state';
import { BACKGROUND_URL, decoSprite, treeSprite, type SpecialSprites } from './assets';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`画像を読み込めませんでした: ${src}`));
    img.src = src;
  });
}

export async function renderGardenBlob(state: GardenState, garden: number, special: SpecialSprites | null): Promise<Blob> {
  const plot = state.gardens[garden]!;
  const draws: { src: string; box: ReturnType<typeof treeBox> }[] = [];
  plot.trees.forEach((id, slot) => {
    const t = id ? state.trees.find((x) => x.id === id) : null;
    if (!t) return;
    const stage = stageOf(t);
    const s = treeSprite(t.species, stage, special);
    if (s) draws.push({ src: s.url, box: treeBox(t.species, stage, slot, s.info) });
  });
  for (const d of state.decos.filter((x) => x.garden === garden)) draws.push({ src: decoSprite(d.kind).url, box: decoBox(d.kind, d.col, d.row) });
  draws.sort((a, b) => a.box.z - b.box.z);
  const [bg, ...imgs] = await Promise.all([loadImage(BACKGROUND_URL), ...draws.map((d) => loadImage(d.src))]);
  const canvas = document.createElement('canvas');
  canvas.width = SCENE.w;
  canvas.height = SCENE.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を作れませんでした');
  ctx.drawImage(bg!, 0, 0, SCENE.w, SCENE.h);
  draws.forEach((d, i) => ctx.drawImage(imgs[i]!, d.box.left * SCENE.w, d.box.top * SCENE.h, d.box.width * SCENE.w, d.box.height * SCENE.h));
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を作れませんでした'))), 'image/png'));
}

/** ファイル名（英数字だけにします。日本語の名前はブラウザによって使われず「download」になるため） */
export function gardenFileName(garden: number, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `sakura-garden-${garden + 1}_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.png`;
}
