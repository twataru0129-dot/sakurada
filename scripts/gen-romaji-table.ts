/** ローマ字の対応表（docs/romaji-table.md）を判定エンジンの表から作ります。 使い方: npx tsx scripts/gen-romaji-table.ts */
import { writeFileSync } from 'node:fs';
import { supportedTable, tokenize } from '../src/core/romaji';

const rows = supportedTable();
const single = rows.filter((r) => [...r.kana].length === 1 && r.kana !== 'ん');
const double = rows.filter((r) => [...r.kana].length === 2);
const fmt = (r: { kana: string; romaji: string[] }) => `| ${r.kana} | ${r.romaji.map((x) => `\`${x}\``).join(' / ')} |`;
const fullDouble = (kana: string) => tokenize(kana)[0]!.cands;

const md = `# ローマ字入力の対応表

このファイルは \`npx tsx scripts/gen-romaji-table.ts\` で判定エンジン（src/core/romaji.ts）から自動で作っています。
左から順に、ガイドに表示する標準の打ち方 → ほかに受け付ける打ち方です。英字の大文字・小文字は区別しません。

## 判定のきまり

- 入力の途中で別の打ち方に切り替えても受け付けます（例：「しゃ」を \`s\` → \`y\` → \`a\`）。ガイドは実際に打った内容に合わせて変わります。
- **促音「っ」**：次の文字の子音を重ねる（\`kka\` \`ssha\` \`tchi\` \`cchi\` など）か、単独で \`xtu\` / \`ltu\` / \`xtsu\` / \`ltsu\`。
  次が母音・な行・「ん」・記号のときは単独入力だけです。
- **「ん」**：\`nn\` / \`xn\` / \`n'\`。次の文字が母音・や行・な行・「ん」・\`'\` 以外で始まるときに限り \`n\` 1回でも確定します
  （例：「かんじ」は \`kanji\` で可、「かんい」は \`kanni\` が必要、「こんにちは」は \`konnnichiha\`）。読みの最後の「ん」は \`n\` 1回では確定しません。
- **拗音・小さい文字**：専用の打ち方（\`kya\` \`sha\` \`fa\` など）と、分けて打つ方法（\`kixya\` \`shilya\` \`fuxa\` など）の両方を受け付けます。
- **長音「ー」**は \`-\`、「、」は \`,\`、「。」は \`.\`、「！」は \`!\`、「？」は \`?\`、「「」「」」は \`[\` \`]\`、「・」は \`/\`、「〜」は \`~\`。
- カタカナの読みはひらがなとして扱います（「ヴ」は \`vu\`）。
- ミスに数えないキー：Shift・Ctrl・Alt などの修飾キー、Enter・Tab・矢印などの名前つきのキー、スペース、日本語入力がオンのときの入力（警告を表示）。

## 1文字のかな・記号

| かな | 打ち方 |
|---|---|
${single.map(fmt).join('\n')}
| ん | \`nn\` / \`xn\` / \`n'\`、条件つきで \`n\` |

## 2文字の組み合わせ（拗音など）

専用の打ち方を示します。このほか、2文字を分けて打つ方法（例：\`kixya\`）もすべて受け付けます。

| かな | 専用の打ち方 |
|---|---|
${double.map(fmt).join('\n')}

### 例：分けて打つ方法を含めたすべての打ち方

| かな | 受け付ける打ち方 |
|---|---|
${['しゃ', 'ちょ', 'じゅ', 'ふぁ', 'てぃ'].map((k) => `| ${k} | ${fullDouble(k).map((x) => `\`${x}\``).join(' / ')} |`).join('\n')}
`;
writeFileSync(new URL('../docs/romaji-table.md', import.meta.url), md);
console.log('docs/romaji-table.md を作成しました');
