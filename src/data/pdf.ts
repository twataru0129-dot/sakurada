/**
 * PDF の表示とテキスト抽出（pdf.js）。
 *
 * - 使うときだけ読み込みます（検定モードの PDF を開くまでは、アプリの起動に影響しません）。
 * - 古い iPad Safari などでも動くよう、互換版（legacy）を使います。
 * - ページは表示するときに 1 ページずつ描画します（全ページを一度に高解像度の画像にしません）。
 * - 文字の形（CMap）・標準フォントなどはアプリと一緒に配置したものを使い、外部には取りに行きません。
 * - PDF の中のスクリプトは実行しません。
 */
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export type PdfDoc = PDFDocumentProxy;

export type PdfOpenError = 'password' | 'broken' | 'failed';

export class PdfError extends Error {
  constructor(readonly reason: PdfOpenError) {
    super(
      reason === 'password'
        ? 'パスワードで保護された PDF は使えません。パスワードを解除した PDF を作ってから選んでください。'
        : reason === 'broken'
          ? 'PDF が壊れているか、PDF ではないため読み込めません。元のファイルから PDF を作り直してください。'
          : 'PDF を読み込めませんでした。もう一度選ぶか、ファイルを作り直してください。',
    );
  }
}

const assetBase = () => new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;

let lib: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;
function loadLib() {
  if (!lib) {
    lib = import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => {
      m.GlobalWorkerOptions.workerSrc = workerUrl;
      return m;
    });
    lib.catch(() => {
      lib = null;
    });
  }
  return lib;
}

/** PDF を開きます。パスワード付き・破損は PdfError で知らせます */
export async function openPdf(data: Blob | ArrayBuffer): Promise<PdfDoc> {
  const m = await loadLib();
  const bytes = new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data.slice(0));
  const base = assetBase();
  const task = m.getDocument({
    data: bytes,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
    enableXfa: false,
  });
  // onPassword を設定しないため、パスワード付きの PDF はパスワードを聞かずに PasswordException になります
  try {
    return await task.promise;
  } catch (e) {
    const name = (e as { name?: string } | null)?.name ?? '';
    if (name === 'PasswordException') throw new PdfError('password');
    if (name === 'InvalidPDFException' || name === 'FormatError') throw new PdfError('broken');
    throw new PdfError('failed');
  }
}

/**
 * 1ページを canvas に描画します。scale は CSS ピクセルあたりの倍率、rotation は追加で回す角度。
 * 端末の画素密度に合わせますが、大きくなりすぎないよう上限を設けます。
 */
export async function renderPdfPage(doc: PdfDoc, pageNumber: number, canvas: HTMLCanvasElement, scale: number, rotation: number): Promise<void> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
  const maxPixels = 16_000_000;
  let ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (viewport.width * viewport.height * ratio * ratio > maxPixels) ratio = Math.sqrt(maxPixels / (viewport.width * viewport.height));
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('描画できません');
  await page.render({ canvasContext: ctx, canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise;
  page.cleanup();
}

/**
 * 選んだページの文字情報を取り出します（補助機能）。読み順・タイトル・ページ番号などは先生が確認・修正してください。
 * 文字情報のない（スキャンした）PDF では、空の文字列になります。
 */
export async function extractPdfText(doc: PdfDoc, pages: number[]): Promise<string> {
  const out: string[] = [];
  for (const n of pages) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let line = '';
    const lines: string[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
      }
    }
    if (line) lines.push(line);
    out.push(lines.join('\n').trim());
    page.cleanup();
  }
  return out.filter((t) => t.length > 0).join('\n');
}
