/**
 * 初期問題データの検証：重複・読み・使えない文字・文字数・よく似た問題。
 * 使い方: npm run validate:questions
 */
import { BUILTIN_QUESTIONS } from '../src/data/builtinQuestions';
import { validateQuestionSet } from '../src/core/validateQuestions';

const byId = new Map(BUILTIN_QUESTIONS.map((q) => [q.id, q]));
const issues = validateQuestionSet(BUILTIN_QUESTIONS);
const summary = new Map<string, number>();
for (const q of BUILTIN_QUESTIONS) {
  const k = `${q.kind}/${q.category}/難易度${q.difficulty}`;
  summary.set(k, (summary.get(k) ?? 0) + 1);
}
for (const [k, n] of [...summary].sort()) console.log(`${k}: ${n}問`);
if (issues.length === 0) {
  console.log(`\n✔ ${BUILTIN_QUESTIONS.length}問を検証しました。問題は見つかりませんでした。`);
} else {
  for (const i of issues) console.log(`✘ ${i.id}「${byId.get(i.id)?.text.slice(0, 30)}」: ${i.message}`);
  console.log(`\n${issues.length}件の問題があります。`);
  process.exit(1);
}
