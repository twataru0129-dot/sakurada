/**
 * 完成記念画像（PNG）。端末の中（canvas）で作り、外部のサービスには何も送りません。
 * 載せる値は結果画面と同じ計算（記録タイム＝ミス加算後、ゲーム内の完成年）を使います。
 */
import type { GameResult } from '../../core/game/result';
import { formatGameTime } from '../../core/game/sakurada';
import { formatNumber1 } from '../../core/rank';

export const GAME_TITLE = 'サクラダファミリアを完成させよ';
export const NICKNAME_MAX = 20;

export interface MemorialContent {
  title: string;
  yearLabel: string;
  year: string;
  time: string;
  accuracy: string;
  course: string;
  story: string;
  nickname: string | null;
}

/** ニックネームの整え方（改行・制御文字を除き、前後の空白を取り、最大20文字） */
export function cleanNickname(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return [...raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, NICKNAME_MAX).join('');
}

export function memorialContent(r: GameResult, storyTitle: string, courseLabel: string, nickname: string | null): MemorialContent {
  const name = nickname === null ? '' : cleanNickname(nickname);
  return {
    title: GAME_TITLE,
    yearLabel: 'ゲーム内の完成年',
    year: `西暦${r.completionYear}年`,
    time: formatGameTime(r.recordTimeMs),
    accuracy: r.accuracy === null ? '—' : `${formatNumber1(r.accuracy)}％`,
    course: courseLabel,
    story: storyTitle,
    nickname: name ? name : null,
  };
}

/** 日本語や名前に頼らない、扱いやすいファイル名（例：sakurada-memorial-20261006-153012.png） */
export function memorialFileName(finishedAt: string): string {
  const d = new Date(finishedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `sakurada-memorial-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}

const FONT = `'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'BIZ UDPGothic', 'Yu Gothic UI', 'Meiryo', 'Noto Sans JP', 'WenQuanYi Zen Hei', sans-serif`;

export const MEMORIAL_WIDTH = 1600;
export const MEMORIAL_HEIGHT = 1600;
const IMAGE_H = Math.round((1024 / 1536) * MEMORIAL_WIDTH); // 1067（元の比率のまま。切り取り・引き伸ばしなし）

/** 幅に収まるよう文字の大きさを下げ、それでも入らないときは2行に分けます（切れないようにします） */
function fitLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, minSize: number, weight: number): { lines: string[]; size: number } {
  for (let s = size; s >= minSize; s -= 2) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) return { lines: [text], size: s };
  }
  // 2行に分けて、それぞれが幅に収まる大きさにします
  const chars = [...text];
  let best = { lines: [text], size: minSize };
  for (let s = size; s >= Math.floor(minSize * 0.75); s -= 2) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    const lines: string[] = [];
    let cur = '';
    for (const c of chars) {
      if (ctx.measureText(cur + c).width > maxWidth && cur) {
        lines.push(cur);
        cur = c;
      } else cur += c;
    }
    if (cur) lines.push(cur);
    best = { lines, size: s };
    if (lines.length <= 2) return best;
  }
  return best;
}

function drawCentered(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxWidth: number, size: number, minSize: number, weight: number, color: string): number {
  const { lines, size: s } = fitLines(ctx, text, maxWidth, size, minSize, weight);
  ctx.font = `${weight} ${s}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * s * 1.2));
  return (lines.length - 1) * s * 1.2;
}

/** 記念画像を描きます。image は完成の画像（読み込み済み）。 */
export function drawMemorial(canvas: HTMLCanvasElement, image: HTMLImageElement, c: MemorialContent): void {
  canvas.width = MEMORIAL_WIDTH;
  canvas.height = MEMORIAL_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const W = MEMORIAL_WIDTH;
  const H = MEMORIAL_HEIGHT;

  // 背景（夜空の色からえんじ色へ）
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1b1530');
  bg.addColorStop(0.7, '#3a1230');
  bg.addColorStop(1, '#5b1232');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 完成の画像（元の比率のまま）
  ctx.drawImage(image, 0, 0, W, IMAGE_H);
  // 上：題名を読みやすくするための影
  const top = ctx.createLinearGradient(0, 0, 0, 260);
  top.addColorStop(0, 'rgba(15, 8, 25, 0.78)');
  top.addColorStop(1, 'rgba(15, 8, 25, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 260);
  // 画像と下の欄のつなぎ目
  const join = ctx.createLinearGradient(0, IMAGE_H - 140, 0, IMAGE_H);
  join.addColorStop(0, 'rgba(27, 21, 48, 0)');
  join.addColorStop(1, 'rgba(40, 18, 46, 0.95)');
  ctx.fillStyle = join;
  ctx.fillRect(0, IMAGE_H - 140, W, 140);

  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 12;
  drawCentered(ctx, '桜打 — SAKURA TYPE　完成記念', W / 2, 62, W - 160, 34, 24, 700, '#f6d98a');
  drawCentered(ctx, c.title, W / 2, 150, W - 140, 84, 48, 800, '#ffffff');
  ctx.shadowBlur = 0;

  // 金色の線
  const gold = ctx.createLinearGradient(160, 0, W - 160, 0);
  gold.addColorStop(0, 'rgba(246, 217, 138, 0)');
  gold.addColorStop(0.5, 'rgba(246, 217, 138, 1)');
  gold.addColorStop(1, 'rgba(246, 217, 138, 0)');
  ctx.fillStyle = gold;
  ctx.fillRect(160, IMAGE_H + 10, W - 320, 3);

  // 完成年
  let y = IMAGE_H + 64;
  drawCentered(ctx, c.yearLabel, W / 2, y, W - 200, 34, 24, 700, '#f6d98a');
  y += 96;
  drawCentered(ctx, `${c.year}　完成！`, W / 2, y, W - 160, 96, 56, 800, '#ffffff');

  // 記録タイム・正確率・コース
  y += 80;
  const cols = [
    ['記録タイム', c.time],
    ['正確率', c.accuracy],
    ['コース', c.course],
  ];
  const colW = (W - 160) / 3;
  cols.forEach(([k, v], i) => {
    const cx = 80 + colW * i + colW / 2;
    drawCentered(ctx, k!, cx, y, colW - 30, 30, 22, 700, '#f6d98a');
    drawCentered(ctx, v!, cx, y + 64, colW - 30, 56, 30, 800, '#ffffff');
  });

  // 物語・ニックネーム
  y += 130;
  const extra = drawCentered(ctx, `物語：${c.story}`, W / 2, y, W - 160, 38, 26, 600, '#fbe8ee');
  if (c.nickname) drawCentered(ctx, `${c.nickname}`, W / 2, y + extra + 62, W - 200, 46, 26, 800, '#ffffff');
}

/** 画像の読み込みと、文字（フォント）の準備ができてから作ります */
export async function renderMemorialBlob(imageSrc: string, c: MemorialContent): Promise<{ blob: Blob; canvas: HTMLCanvasElement }> {
  const img = new Image();
  img.decoding = 'async';
  img.src = imageSrc;
  await img.decode();
  try {
    await document.fonts?.ready;
    await document.fonts?.load?.(`800 48px ${FONT}`, c.title + c.story + (c.nickname ?? ''));
  } catch {
    /* フォントの準備を待てない環境でも、使える文字で描きます */
  }
  const canvas = document.createElement('canvas');
  drawMemorial(canvas, img, c);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('png');
  return { blob, canvas };
}
