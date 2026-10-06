/**
 * 建築の工程の画像（ゲーム用に AI で作成したイラスト）。
 * 実際の完成予想図や、過去の建築状況を正確に再現したものではありません。
 * import で読み込むため、GitHub Pages のサブディレクトリ（base: './'）でも正しい場所を指します。
 */
import { useEffect, useState } from 'react';
import s0 from '../../assets/game/stage_00_empty.webp';
import s1 from '../../assets/game/stage_01_foundations.webp';
import s2 from '../../assets/game/stage_02_low_walls.webp';
import s3 from '../../assets/game/stage_03_main_structure.webp';
import s4 from '../../assets/game/stage_04_towers.webp';
import s5 from '../../assets/game/stage_05_complete.webp';

export const STAGE_IMAGES: readonly string[] = [s0, s1, s2, s3, s4, s5];

export const STAGE_ALTS: readonly string[] = [
  '何も建っていない敷地（ゲーム用のイラスト）',
  '基礎ができた敷地（ゲーム用のイラスト）',
  '低い壁ができはじめた建物（ゲーム用のイラスト）',
  '本体を建築中の建物（ゲーム用のイラスト）',
  '塔を建築中の建物（ゲーム用のイラスト）',
  '完成した大聖堂（ゲーム用のイラスト）',
];

export const IMAGE_NOTE =
  '建物の画像は、ゲーム用に AI で作成したイメージです。実際の完成予想図や、過去の建築の様子・街並みを正確に再現したものではありません。';

/** すべての工程の画像を先に読み込みます（途中で読み込み待ちにしないため）。'error' は読み込めなかった画像があるとき */
export function usePreloadStages(): 'loading' | 'ready' | 'error' {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      STAGE_IMAGES.map(
        (src) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(src));
            img.src = src;
          }),
      ),
    )
      .then(() => !cancelled && setState('ready'))
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
