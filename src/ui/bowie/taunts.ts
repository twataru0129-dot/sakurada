/** 煽り画像は敗北が決まったときに1枚だけ選び、結果画面が更新されても変えません。 */
const images = import.meta.glob('../../assets/bowie/scenes/game_over_*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const lines = [
  '少し速すぎたかな？ 君には',
  '君が打っていたのは、敗北へのカウントダウンさ',
  'その指では、僕には届かない',
  '追悼式開始！',
  '最後の一文字、惜しかったねぇ',
  '勝てると思った？ それは悪いことをしたね',
  'その震える指で、もう一度挑むかい？',
  '安心したまえ。次も僕が勝つ',
  '奏でるか。敗者への鎮魂歌を',
  '制裁！',
] as const;

export interface BowieTaunt {
  id: string;
  line: string;
  src: string;
}

export const BOWIE_TAUNTS: readonly BowieTaunt[] = lines.map((line, i) => {
  const id = String(i + 1).padStart(2, '0');
  const path = `../../assets/bowie/scenes/game_over_${id}.webp`;
  const src = images[path];
  if (!src) throw new Error(`Missing Bowie taunt image: ${path}`);
  return { id, line, src };
});

/** 各画像は同じ確率（10%）。再挑戦では前回と同じ画像が出ることもあります。 */
export function drawBowieTaunt(random: () => number = Math.random): BowieTaunt {
  return BOWIE_TAUNTS[Math.floor(random() * BOWIE_TAUNTS.length)]!;
}
