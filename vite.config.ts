import { defineConfig } from 'vitest/config';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// base: './' により、サブディレクトリ（例: https://example.ed.jp/typing/）に置いても
// 画像・マニフェスト・スクリプトの参照が相対パスで解決されます。
// 画面の切り替えはハッシュ（#/home など）で行うため、サーバー側の書き換え設定は不要です。
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * PDF 表示（pdf.js）が使う文字の形（CMap）・標準フォント・画像の復号（wasm）・色の情報を、
 * dist/pdfjs/ に置きます（外部のサーバーには取りに行きません）。PDF のスクリプト実行用のファイルは置きません。
 */
function pdfjsAssets(): Plugin {
  const root = path.resolve('node_modules/pdfjs-dist');
  const dirs = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
  const skip = (f: string) => /quickjs/.test(f);
  const files = () =>
    dirs.flatMap((d) =>
      readdirSync(path.join(root, d))
        .filter((f) => !skip(f) && statSync(path.join(root, d, f)).isFile())
        .map((f) => `${d}/${f}`),
    );
  const mime = (f: string) => (f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
  return {
    name: 'sakura-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /\/pdfjs\/((?:cmaps|standard_fonts|wasm|iccs)\/[^/?#]+)/.exec(req.url ?? '');
        if (!m || skip(path.basename(m[1]!))) return next();
        try {
          const body = readFileSync(path.join(root, m[1]!));
          res.setHeader('Content-Type', mime(m[1]!));
          res.end(body);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const f of files()) this.emitFile({ type: 'asset', fileName: `pdfjs/${f}`, source: readFileSync(path.join(root, f)) });
    },
  };
}

export default defineConfig({
  base: './',
  // バージョン番号は package.json の version だけで管理します。
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), pdfjsAssets()],
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'supabase/functions/_shared/*.test.ts'],
  },
});
