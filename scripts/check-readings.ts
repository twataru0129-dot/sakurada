/**
 * 読みの照合：形態素解析（kuromoji の辞書）で本文から読みを推定し、問題データの読みと比べます。
 * 辞書の推定が正しいとは限らないため、食い違いを「確認が必要な候補」として一覧にします。
 * 確認して問題データの読みが正しいと判断したものは scripts/reading-exceptions.json に理由と一緒に登録します。
 *
 * 使い方: npm run check:readings
 */
import kuromoji from 'kuromoji';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { BUILTIN_QUESTIONS } from '../src/data/builtinQuestions';
import { normalizeReading } from '../src/core/romaji';

const require = createRequire(import.meta.url);
const dicPath = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');
const exceptions: Record<string, string> = JSON.parse(
  readFileSync(new URL('./reading-exceptions.json', import.meta.url), 'utf8'),
);

const toHira = (s: string) => normalizeReading(s).replace(/[、。！？「」『』（）・\s　〜：]/g, '');

kuromoji.builder({ dicPath }).build((err, tokenizer) => {
  if (err) throw err;
  let mismatches = 0;
  for (const q of BUILTIN_QUESTIONS) {
    const guessed = tokenizer
      .tokenize(q.text)
      .map((t) => (t.reading && t.reading !== '*' ? t.reading : t.surface_form))
      .join('');
    const a = toHira(guessed);
    const b = toHira(q.reading);
    if (a !== b && !(q.id in exceptions)) {
      mismatches++;
      console.log(`${q.id}\n  本文: ${q.text.replace(/\n/g, '⏎')}\n  データ: ${b}\n  辞書　: ${a}`);
    }
  }
  console.log(mismatches === 0 ? '✔ 読みの食い違いはありません（登録済みの例外を除く）' : `\n確認が必要な候補: ${mismatches}件`);
  process.exit(mismatches === 0 ? 0 : 1);
});
