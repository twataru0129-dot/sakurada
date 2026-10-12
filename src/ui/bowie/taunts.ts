/**
 * 煽り画像は敗北が決まったときに1枚だけ選び、結果画面が更新されても変えません。
 * v1.8.0：変身の前の敗北は通常版の10枚、変身のあと（最終形態）の敗北は最終形態版の10枚から選びます（20枚を混ぜて選びません）。
 * どの画像もセリフの文字が画像の中にあるため、画面に同じセリフは重ねません（line は読み上げ用の説明だけ）。
 */
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
/**
 * 最終形態版（assets/bowie-source/final_taunt_manifest.json と同じ順）。
 * 02 と 04 は同じセリフの別の構図の画像で、どちらも使います（各10％、このセリフになるのは合わせて20％）。
 */
const finalLines = [
  '『負ける』って、こういうことなんだね',
  'ご満足いただける敗北でしたか？',
  'またひとつ、学びが増えましたねぇ',
  'ご満足いただける敗北でしたか？',
  '最後、何かしようとしてたね',
  'いい試合でした。途中までは',
  'そのプレイ、通知表なら「がんばろう」',
  'なるほど、そうやって負けるタイプね',
  'ここにあなたの記念碑建てときますね',
  '安らかに眠れ。次はもう少し長く生きろ',
] as const;

export type BowieTauntSet = 'normal' | 'final';

export interface BowieTaunt {
  /** 通常版は 01〜10、最終形態版は final_01〜final_10 */
  id: string;
  set: BowieTauntSet;
  line: string;
  src: string;
}

function build(set: BowieTauntSet, list: readonly string[]): readonly BowieTaunt[] {
  return list.map((line, i) => {
    const no = String(i + 1).padStart(2, '0');
    const id = set === 'final' ? `final_${no}` : no;
    const path = `../../assets/bowie/scenes/game_over_${id}.webp`;
    const src = images[path];
    if (!src) throw new Error(`Missing Bowie taunt image: ${path}`);
    return { id, set, line, src };
  });
}

export const BOWIE_TAUNTS: readonly BowieTaunt[] = build('normal', lines);
export const BOWIE_FINAL_TAUNTS: readonly BowieTaunt[] = build('final', finalLines);

/**
 * 敗北が決まったときの形態の画像の中から1枚（各画像は同じ確率）。再挑戦では前回と同じ画像が出ることもあります。
 * set を省くと通常版です。
 */
export function drawBowieTaunt(random: () => number = Math.random, set: BowieTauntSet = 'normal'): BowieTaunt {
  const list = set === 'final' ? BOWIE_FINAL_TAUNTS : BOWIE_TAUNTS;
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;
}
