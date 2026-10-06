/**
 * ゲームモードで遊べるゲームの一覧。ゲームを追加するときは、ここに登録します。
 * 遊べないゲーム（作成中など）は登録しません（遊べるように見せないため）。
 */
import completeImage from '../../assets/game/stage_05_complete.webp';

export interface GameEntry {
  id: string;
  title: string;
  description: string;
  /** ゲームの紹介画面（ハッシュのパス） */
  path: string;
  image: string;
  imageAlt: string;
}

export const GAMES: readonly GameEntry[] = [
  {
    id: 'sakurada-familia',
    title: 'サクラダファミリアを完成させよ',
    description: '物語をローマ字で入力すると、何もない敷地から少しずつ建築が進みます。最後まで打つと必ず完成します。',
    path: '/game/sakurada',
    image: completeImage,
    imageAlt: '完成した大聖堂のゲーム用イラスト（AI で作成したイメージ）',
  },
];
