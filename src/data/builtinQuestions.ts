import type { Question } from '../core/questions';
import romajiGeneral from './questions/romaji-general.json';
import romajiSakura from './questions/romaji-sakura.json';
import sentenceGeneral from './questions/sentence-general.json';
import sentenceSakura from './questions/sentence-sakura.json';

/** 内蔵の初期問題（このアプリのために作成したオリジナル問題） */
export const BUILTIN_QUESTIONS: Question[] = [
  ...(romajiGeneral as Question[]),
  ...(romajiSakura as Question[]),
  ...(sentenceGeneral as Question[]),
  ...(sentenceSakura as Question[]),
];
