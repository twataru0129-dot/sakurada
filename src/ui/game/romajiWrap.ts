/**
 * 読み・ローマ字の行を、枠の幅に合わせて分けるための寸法を測ります（ゲーム画面で共通に使います）。
 * 分け方そのものは src/core/game/romajiDisplay.ts の wrapLines です。
 */
import { useEffect, useState, type RefObject } from 'react';

/** 文の幅を測るためのキャンバス（表示はしません） */
let measureCtx: CanvasRenderingContext2D | null | undefined;
const measureCache = new Map<string, number>();
export function textWidth(font: string, spacing: number, text: string): number {
  const key = `${font}|${text}`;
  let w = measureCache.get(key);
  if (w === undefined) {
    if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
    if (!measureCtx) return text.length * 16;
    measureCtx.font = font;
    w = measureCtx.measureText(text).width;
    measureCache.set(key, w);
  }
  return w + spacing * text.length;
}

export interface WrapMetrics { max: number; kanaFont: string; kanaSpacing: number; romajiFont: string; romajiSpacing: number }

/**
 * 読み・ローマ字の行を、枠の幅に合わせて分けるための寸法（等倍の文字の大きさで測ります）。
 * 縮小（--fit）より前の大きさで測るため、縮小しても改行の位置は変わりません。
 */
export function useWrapMetrics(panel: RefObject<HTMLElement | null>, body: RefObject<HTMLElement | null>): WrapMetrics | null {
  const [m, setM] = useState<WrapMetrics | null>(null);
  useEffect(() => {
    const p = panel.current;
    if (!p) return;
    const update = () => {
      const b = body.current;
      if (!b) return;
      const fit = Number(b.dataset.fit) || 1;
      const font = (el: Element | null) => {
        if (!el) return { font: '', spacing: 0, px: 0 };
        const cs = getComputedStyle(el);
        const px = parseFloat(cs.fontSize) / fit;
        const ls = parseFloat(cs.letterSpacing);
        return { font: `${cs.fontWeight} ${px}px ${cs.fontFamily}`, spacing: Number.isFinite(ls) ? ls / fit : 0, px };
      };
      const k = font(b.querySelector('.game-kana'));
      const r = font(b.querySelector('.game-romaji'));
      // 入力した打ち方（nn など）で少し長くなっても収まるよう、ローマ字2文字分の余裕をとります
      const max = Math.floor(b.clientWidth - 2 * r.px * 0.62);
      setM((old) =>
        old && old.max === max && old.kanaFont === k.font && old.romajiFont === r.font
          ? old
          : { max, kanaFont: k.font, kanaSpacing: k.spacing, romajiFont: r.font, romajiSpacing: r.spacing },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(p);
    return () => ro.disconnect();
  }, [panel, body]);
  return m;
}

