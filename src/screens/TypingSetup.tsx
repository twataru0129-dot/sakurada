import { useEffect, useState } from 'react';
import { DIFFICULTY_LABEL, QUESTION_SET_VERSION, SAKURA_THEMES, type Difficulty, type Question } from '../core/questions';
import type { EndMode, InputMethod, Minutes, PracticeConfig, SetType, TargetCount } from '../core/result';
import type { PracticeKind } from '../core/rank';
import { STANDARD_PATTERN } from '../core/deck';
import { fetchPracticeMaterials } from '../data/cloud';
import { useApp } from '../state/AppContext';
import { navigate } from '../state/router';
import { BackLink, Toggle } from '../ui/common';

/** 先生の追加教材（練習画面へ渡すため、メモリーにだけ置きます） */
export let teacherMaterialCache: Question[] = [];

function Choice<T extends string | number>({ name, value, current, onChange, children }: { name: string; value: T; current: T; onChange: (v: T) => void; children: React.ReactNode }) {
  return (
    <label className="choice">
      <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} />
      <span>{children}</span>
    </label>
  );
}

export function TypingSetup() {
  const { account, settings, updateSettings, lastConfig, setLastConfig } = useApp();
  const [kind, setKind] = useState<PracticeKind>(lastConfig?.kind ?? 'romaji');
  const [endMode, setEndMode] = useState<EndMode>(lastConfig?.endMode ?? 'time');
  const [minutes, setMinutes] = useState<Minutes>(lastConfig?.minutes ?? settings.minutes);
  const [targetCount, setTargetCount] = useState<TargetCount>(lastConfig?.targetCount ?? 25);
  const [inputMethod, setInputMethod] = useState<InputMethod | null>(lastConfig?.inputMethod ?? null);
  const [setType, setSetType] = useState<SetType>(lastConfig?.setType ?? 'standard');
  const [sakuraTheme, setSakuraTheme] = useState<string>(lastConfig?.setType === 'sakura' ? lastConfig.theme : 'all');
  const [difficulty, setDifficulty] = useState<Difficulty | 'mixed'>(
    lastConfig && lastConfig.setType !== 'standard' ? lastConfig.difficulty : settings.difficulty,
  );
  const [materials, setMaterials] = useState<Question[] | null>(null);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const isUser = account?.kind === 'user';

  useEffect(() => {
    if (!isUser) return;
    let cancelled = false;
    setMaterials(null);
    fetchPracticeMaterials(kind)
      .then((m) => !cancelled && setMaterials(m))
      .catch(() => !cancelled && setMaterialError('先生の追加教材を読み込めませんでした'));
    return () => {
      cancelled = true;
    };
  }, [isUser, kind]);

  const effDifficulty: Difficulty | 'mixed' = setType === 'standard' || setType === 'teacher' ? 'mixed' : setType === 'general' && difficulty === 'mixed' ? 1 : difficulty;
  const canStart = inputMethod !== null && (setType !== 'teacher' || (materials?.length ?? 0) > 0);

  const start = () => {
    if (!inputMethod) return;
    const config: PracticeConfig = {
      kind,
      endMode,
      minutes: endMode === 'time' ? minutes : null,
      targetCount: endMode === 'count' ? targetCount : null,
      ...(kind === 'romaji' ? { romajiStyle: settings.romajiStyle } : {}),
      inputMethod,
      setType,
      theme: setType === 'sakura' ? sakuraTheme : setType === 'teacher' ? 'teacher' : 'all',
      difficulty: effDifficulty,
      questionSetVersion: setType === 'teacher' ? 'teacher' : QUESTION_SET_VERSION,
    };
    teacherMaterialCache = setType === 'teacher' ? (materials ?? []) : [];
    setLastConfig(config);
    navigate('/practice');
  };

  // ローマ字ガイドと文章入力の読みガイドは同じ設定です（同じ名前で表示して、知らないうちに OFF にならないようにします）
  const guideLabel = 'ローマ字ガイド（文章入力では読み）';

  return (
    <main>
      <BackLink to="/home">ホームにもどる</BackLink>
      <h1 style={{ marginTop: 12 }}>タイピングモード</h1>
      <div className="panel">
        <fieldset>
          <legend>練習の種類</legend>
          <div className="choice-row">
            <Choice name="kind" value="romaji" current={kind} onChange={setKind}>
              A．ローマ字入力
            </Choice>
            <Choice name="kind" value="sentence" current={kind} onChange={setKind}>
              B．文章入力〈変換あり〉
            </Choice>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            {kind === 'romaji'
              ? '日本語入力をオフ（半角英数）にして、ローマ字で打ちます。'
              : '端末の日本語入力（IME）を使って、漢字に変換しながら見本どおりの文章を入力します。'}
          </p>
        </fieldset>

        {kind === 'romaji' && (
          <fieldset>
            <legend>ローマ字のお手本</legend>
            <div className="choice-row">
              <Choice name="romajiStyle" value="hepburn" current={settings.romajiStyle} onChange={(v) => updateSettings({ romajiStyle: v })}>
                ヘボン式（し＝shi、ち＝chi、つ＝tsu）
              </Choice>
              <Choice name="romajiStyle" value="kunrei" current={settings.romajiStyle} onChange={(v) => updateSettings({ romajiStyle: v })}>
                訓令式（し＝si、ち＝ti、つ＝tu）
              </Choice>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>ガイドに表示する打ち方です。どちらの正しい打ち方でも入力できます。</p>
          </fieldset>
        )}

        <fieldset>
          <legend>終わりかた</legend>
          <div className="choice-row">
            <Choice name="endMode" value="time" current={endMode} onChange={setEndMode}>
              時間で練習
            </Choice>
            <Choice name="endMode" value="count" current={endMode} onChange={setEndMode}>
              問題数で練習
            </Choice>
          </div>
          <div className="choice-row" style={{ marginTop: 10 }} role="group" aria-label={endMode === 'time' ? '練習時間' : '問題数'}>
            {endMode === 'time'
              ? ([3, 5, 10] as Minutes[]).map((m) => (
                  <Choice key={m} name="minutes" value={m} current={minutes} onChange={setMinutes}>
                    {m}分
                  </Choice>
                ))
              : ([25, 50] as TargetCount[]).map((n) => (
                  <Choice key={n} name="count" value={n} current={targetCount} onChange={setTargetCount}>
                    {n}問
                  </Choice>
                ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            {endMode === 'time'
              ? '時間いっぱいまで練習します。'
              : '時間の制限はありません。正しく入力し終えた問題を1問として数え、決めた数を完成したら終わります。ランクは「参考ランク」です。'}
          </p>
        </fieldset>

        <fieldset>
          <legend>入力のしかた（えらんでください）</legend>
          <div className="choice-row">
            <Choice name="method" value="keyboard" current={inputMethod ?? ''} onChange={() => setInputMethod('keyboard')}>
              実物のキーボード
            </Choice>
            <Choice name="method" value="touch" current={inputMethod ?? ''} onChange={() => setInputMethod('touch')}>
              {kind === 'romaji' ? '画面のキーをタップ' : '画面のキーボード（端末の日本語入力）'}
            </Choice>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>記録は入力のしかたごとに分けて残ります。</p>
        </fieldset>

        <fieldset>
          <legend>問題</legend>
          <div className="choice-row">
            <Choice name="set" value="standard" current={setType} onChange={setSetType}>
              標準問題（正式ランク）
            </Choice>
            <Choice name="set" value="general" current={setType} onChange={setSetType}>
              一般問題・難易度をえらぶ
            </Choice>
            <Choice name="set" value="sakura" current={setType} onChange={setSetType}>
              🌸桜モード
            </Choice>
            {isUser && (
              <Choice name="set" value="teacher" current={setType} onChange={setSetType}>
                先生の追加教材
              </Choice>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            {setType === 'standard' && (
              <p className="hint">
                身近な話題の一般問題を、決まった難易度の順番（
                {STANDARD_PATTERN[kind].map((d) => DIFFICULTY_LABEL[kind][d].replace(/（.*）/, '')).join(' → ')}
                をくり返す）で出します。「時間で練習」で時間いっぱいまで練習すると、正式ランクになります（問題数で練習したときは参考ランク）。
              </p>
            )}
            {setType === 'sakura' && (
              <div className="field-inline">
                <label htmlFor="sakura-theme">テーマ</label>
                <select id="sakura-theme" value={sakuraTheme} onChange={(e) => setSakuraTheme(e.target.value)}>
                  <option value="all">すべてのテーマ</option>
                  {Object.entries(SAKURA_THEMES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(setType === 'general' || setType === 'sakura') && (
              <div className="field-inline" style={{ marginTop: 10 }}>
                <label htmlFor="difficulty">難易度</label>
                <select
                  id="difficulty"
                  value={String(effDifficulty)}
                  onChange={(e) => setDifficulty(e.target.value === 'mixed' ? 'mixed' : (Number(e.target.value) as Difficulty))}
                >
                  {setType === 'sakura' && <option value="mixed">いろいろ（標準と同じ順番）</option>}
                  {([1, 2, 3] as Difficulty[]).map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABEL[kind][d]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {setType !== 'standard' && <p className="hint">この練習のランクは「参考ランク」です（標準問題の正式ランクとは別に記録します）。</p>}
            {setType === 'teacher' && (
              <p className={materials && materials.length === 0 ? 'error-text' : 'hint'}>
                {materialError ?? (materials === null ? '読み込んでいます…' : materials.length === 0 ? 'この種類の追加教材はまだありません。' : `${materials.length}問の追加教材があります。`)}
              </p>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>ガイドと音</legend>
          <div className="choice-row" style={{ flexDirection: 'column', gap: 0 }}>
            <Toggle label={guideLabel} checked={settings.romajiGuide} onChange={(v) => updateSettings({ romajiGuide: v })} />
            <Toggle label="キーボードガイド" checked={settings.keyboardGuide} onChange={(v) => updateSettings({ keyboardGuide: v })} />
            <Toggle label="指のガイド" checked={settings.fingerGuide} onChange={(v) => updateSettings({ fingerGuide: v })} />
            <Toggle label="音" checked={settings.sound} onChange={(v) => updateSettings({ sound: v })} />
          </div>
        </fieldset>

        <div className="btn-row">
          <button type="button" className="btn btn-primary" style={{ minWidth: 220, minHeight: 56, fontSize: '1.1rem' }} disabled={!canStart} onClick={start}>
            練習をはじめる
          </button>
          {inputMethod === null && <span className="hint">入力のしかたをえらぶと、はじめられます。</span>}
        </div>
      </div>
    </main>
  );
}
