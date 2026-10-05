import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';

// base: './' により、サブディレクトリ（例: https://example.ed.jp/typing/）に置いても
// 画像・マニフェスト・スクリプトの参照が相対パスで解決されます。
// 画面の切り替えはハッシュ（#/home など）で行うため、サーバー側の書き換え設定は不要です。
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  // バージョン番号は package.json の version だけで管理します。
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'supabase/functions/_shared/*.test.ts'],
  },
});
