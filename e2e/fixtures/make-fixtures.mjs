// 検定モードの E2E テスト用のお手本ファイルを作ります（node e2e/fixtures/make-fixtures.mjs）
// - text-3pages.pdf：文字情報のある3ページの PDF（Chromium で作成）
// - print.png：プリントの写真の代わりの画像（Chromium のスクリーンショット）
// 暗号化 PDF（password.pdf）は Python の pypdf で作ります（make-fixtures.py）。
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.setContent(`<!doctype html><html lang="ja"><meta charset="utf-8"><style>
  body{font-family:'WenQuanYi Zen Hei','Noto Sans CJK JP',sans-serif;font-size:18px;margin:40px}
  section{page-break-after:always} h1{font-size:22px}</style>
  <section><h1>練習プリント</h1><p>一ページ目の本文です。朝の会で予定を確認します。</p></section>
  <section><p>二ページ目の本文です。午後は実習があります。</p></section>
  <section><p>三ページ目の本文です。帰る前に片づけをします。</p></section></html>`);
writeFileSync(new URL('text-3pages.pdf', dir), await page.pdf({ format: 'A4' }));
await page.setViewportSize({ width: 600, height: 400 });
await page.setContent(`<!doctype html><html lang="ja"><meta charset="utf-8"><body style="margin:0;background:#fffdf5;font-family:'WenQuanYi Zen Hei',sans-serif">
  <div style="padding:30px;font-size:28px;line-height:1.8">プリントの写真<br>お手本の文章です。<br>よく見て入力します。</div></body></html>`);
writeFileSync(new URL('print.png', dir), await page.screenshot({ type: 'png' }));
await browser.close();
