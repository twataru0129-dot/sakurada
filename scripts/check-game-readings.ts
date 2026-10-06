/**
 * ゲームの物語の読みの照合（確認用）：形態素解析（kuromoji の辞書）で表示文から読みを推定し、物語データの読みと比べます。
 * 辞書の推定が正しいとは限らない（漢数字の年・固有名詞など）ため、食い違いを「人が確認する候補」として一覧にするだけです。
 * 使い方: npx tsx scripts/check-game-readings.ts
 */
import kuromoji from 'kuromoji';
import { createRequire } from 'node:module';
import path from 'node:path';
import { GAME_STORIES } from '../src/data/gameStories';
import { normalizeReading } from '../src/core/romaji';

const require = createRequire(import.meta.url);
const dicPath = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');
const toHira = (s: string) => normalizeReading(s).replace(/[、。！？「」『』（）・\s　〜：ー]/g, '');

kuromoji.builder({ dicPath }).build((err, tokenizer) => {
  if (err) throw err;
  let n = 0;
  for (const story of [...GAME_STORIES.standard, ...GAME_STORIES.short]) {
    for (const s of story.sentences) {
      const guessed = tokenizer.tokenize(s.text).map((t) => (t.reading && t.reading !== '*' ? t.reading : t.surface_form)).join('');
      if (toHira(guessed) !== toHira(s.reading)) {
        n++;
        console.log(`${s.id}\n  表示: ${s.text}\n  読み: ${s.reading}\n  辞書: ${normalizeReading(guessed)}`);
      }
    }
  }
  console.log(`\n確認の候補: ${n}件（辞書の推定との違い。誤りとは限りません）`);
});
