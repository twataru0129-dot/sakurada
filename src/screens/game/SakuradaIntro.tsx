import { useState } from 'react';
import { courseKeystrokeRange, GAME_STORIES, pickStory } from '../../data/gameStories';
import type { CourseId } from '../../core/game/sakurada';
import { useApp } from '../../state/AppContext';
import { navigate } from '../../state/router';
import { BackLink, Toggle } from '../../ui/common';
import { IMAGE_NOTE, STAGE_ALTS, STAGE_IMAGES } from '../../ui/game/stageImages';

/** コースの打鍵数の目安（ヘボン式のお手本の実測値の平均を50打鍵単位に丸めた値） */
function approxKeys(c: CourseId): number {
  const r = courseKeystrokeRange(c);
  return Math.round((r.min + r.max) / 2 / 50) * 50;
}

/** ゲームの紹介と開始前の設定 */
export function SakuradaIntro() {
  const { settings, updateSettings, setGameSession, gameSession, setHistoryFocus } = useApp();
  const [course, setCourse] = useState<CourseId>(gameSession?.courseId ?? 'standard');
  const [inputMethod, setInputMethod] = useState<'keyboard' | 'touch'>(gameSession?.inputMethod ?? 'keyboard');

  const start = () => {
    // コースの3本から均等にランダムで1本を選びます（物語の途中では切り替えません）
    const story = pickStory(course);
    setGameSession({ courseId: course, storyId: story.id, inputMethod });
    navigate('/game/sakurada/play');
  };

  return (
    <main>
      <BackLink to="/game">ゲームの選択にもどる</BackLink>
      <h1 style={{ marginTop: 12 }}>サクラダファミリアを完成させよ</h1>
      <div className="game-intro">
        <figure className="game-intro-fig">
          <img src={STAGE_IMAGES[5]} alt={STAGE_ALTS[5]} width={1536} height={1024} />
          <figcaption className="hint">{IMAGE_NOTE}</figcaption>
        </figure>
        <section className="panel game-rules" aria-labelledby="rules-title">
          <h2 id="rules-title">ルール</h2>
          <ul className="rule-list">
            <li>正しく打つと工事が進む</li>
            <li>ミス1回で記録に5秒加算</li>
            <li>最後まで打つと完成</li>
          </ul>
          <p className="hint">時間切れやゲームオーバーはありません。速く正確に打つと、記録タイムとゲーム内の完成年が良くなります。物語の読みをローマ字で入力します。</p>
        </section>
      </div>

      <section className="panel" aria-labelledby="course-title">
        <h2 id="course-title">コース</h2>
        <div className="choice-row" role="radiogroup" aria-label="コース">
          <label className="choice">
            <input type="radio" name="course" checked={course === 'standard'} onChange={() => setCourse('standard')} />
            標準コース（長い物語・約{approxKeys('standard')}打鍵）
          </label>
          <label className="choice">
            <input type="radio" name="course" checked={course === 'short'} onChange={() => setCourse('short')} />
            短縮コース（短い物語・約{approxKeys('short')}打鍵）
          </label>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          物語は、そのコースの{GAME_STORIES[course].length}本から1本をランダムに選びます。短縮コースは、標準コースの約半分の長さの物語です。標準コースと短縮コースの記録は分けて比べます。
        </p>
      </section>

      <section className="panel" aria-labelledby="gset-title">
        <h2 id="gset-title">設定</h2>
        <fieldset className="choice-row" style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>入力のしかた</legend>
          <label className="choice">
            <input type="radio" name="gim" checked={inputMethod === 'keyboard'} onChange={() => setInputMethod('keyboard')} />
            実物のキーボード
          </label>
          <label className="choice">
            <input type="radio" name="gim" checked={inputMethod === 'touch'} onChange={() => setInputMethod('touch')} />
            画面のキーをタップ
          </label>
        </fieldset>
        <fieldset className="choice-row" style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>ローマ字のお手本</legend>
          <label className="choice">
            <input type="radio" name="gstyle" checked={settings.romajiStyle === 'hepburn'} onChange={() => updateSettings({ romajiStyle: 'hepburn' })} />
            ヘボン式（shi・chi・tsu）
          </label>
          <label className="choice">
            <input type="radio" name="gstyle" checked={settings.romajiStyle === 'kunrei'} onChange={() => updateSettings({ romajiStyle: 'kunrei' })} />
            訓令式（si・ti・tu）
          </label>
        </fieldset>
        <p className="hint">お手本はガイドに出す打ち方です。どちらの打ち方（shi と si など）で打っても正解になります。</p>
        <Toggle label="ローマ字ガイド" checked={settings.romajiGuide} onChange={(v) => updateSettings({ romajiGuide: v })} />
        <br />
        <Toggle label="キーボードガイド" checked={settings.keyboardGuide} onChange={(v) => updateSettings({ keyboardGuide: v })} />
        <br />
        <Toggle label="指のガイド" checked={settings.fingerGuide} onChange={(v) => updateSettings({ fingerGuide: v })} />
        <br />
        <Toggle label="音" checked={settings.sound} onChange={(v) => updateSettings({ sound: v })} />
      </section>

      <div className="btn-row">
        <button type="button" className="btn btn-primary btn-large" onClick={start} data-testid="game-start">
          工事をはじめる
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setHistoryFocus('game');
            navigate('/history');
          }}
        >
          ゲームの記録
        </button>
      </div>
    </main>
  );
}
