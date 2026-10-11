/**
 * ボウイの爆弾遊戯のサウンド設定（タイトルと、プレイ中の一時停止の画面から開きます）。
 * - サウンド：オフ／オン（桜打の共通の「音」の設定）
 * - 音楽・効果音・ボイス：0〜100％（この端末に保存）
 * - 「デフォルトに戻す」：このゲームのサウンド設定だけを初期値（サウンド オン・音楽 20％・効果音 80％・ボイス 100％）に戻します
 * 一時停止中に開くため、スライダーの操作でゲームが進んだり、入力の判定が起きたりしません。
 */
import { useEffect, useRef } from 'react';
import { BOWIE_SOUND_DEFAULTS, type BowieSoundLevels } from '../../data/bowieSound';

const ROWS: { key: keyof BowieSoundLevels; label: string; hint: string }[] = [
  { key: 'music', label: '音楽', hint: 'BGM・クリアの曲' },
  { key: 'sfx', label: '効果音', hint: '投球・解除・ミス・爆発など' },
  { key: 'voice', label: 'ボイス', hint: 'タイトルコール・セリフ・声' },
];

export function SoundSettings({
  soundOn,
  levels,
  onSoundOn,
  onLevels,
  onClose,
}: {
  soundOn: boolean;
  levels: BowieSoundLevels;
  onSoundOn: (on: boolean) => void;
  onLevels: (l: BowieSoundLevels) => void;
  onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const isDefault = soundOn && ROWS.every((r) => Math.abs(levels[r.key] - BOWIE_SOUND_DEFAULTS[r.key]) < 0.005);
  return (
    <section className="bowie-sound-settings" aria-labelledby="bowie-sound-title" data-testid="bowie-sound-settings">
      <h2 id="bowie-sound-title">サウンド</h2>
      <div className="bss-row bss-main">
        <span className="bss-label" id="bss-main-label">
          サウンド
        </span>
        <div className="bss-switch" role="radiogroup" aria-labelledby="bss-main-label">
          <button type="button" role="radio" aria-checked={!soundOn} className={!soundOn ? 'is-on' : ''} onClick={() => onSoundOn(false)} data-testid="bss-off" ref={soundOn ? undefined : first}>
            オフ
          </button>
          <button type="button" role="radio" aria-checked={soundOn} className={soundOn ? 'is-on' : ''} onClick={() => onSoundOn(true)} data-testid="bss-on" ref={soundOn ? first : undefined}>
            オン
          </button>
        </div>
        <button type="button" className="btn bss-default" onClick={() => (onSoundOn(true), onLevels({ ...BOWIE_SOUND_DEFAULTS }))} disabled={isDefault} data-testid="bss-default">
          デフォルトに戻す
        </button>
      </div>
      {ROWS.map((r) => {
        const pct = Math.round(levels[r.key] * 100);
        return (
          <div className={`bss-row ${soundOn ? '' : 'is-muted'}`} key={r.key}>
            <label className="bss-label" htmlFor={`bss-${r.key}`}>
              {r.label}
              <small>{r.hint}</small>
            </label>
            <div className="bss-slider">
              <span aria-hidden="true">低</span>
              <input
                id={`bss-${r.key}`}
                type="range"
                min={0}
                max={100}
                step={5}
                value={pct}
                aria-valuetext={`${pct}％`}
                onChange={(e) => onLevels({ ...levels, [r.key]: Number(e.target.value) / 100 })}
                style={{ ['--pct' as string]: `${pct}%` }}
                data-testid={`bss-${r.key}`}
              />
              <span aria-hidden="true">高</span>
            </div>
            <output className="bss-value" htmlFor={`bss-${r.key}`} data-testid={`bss-${r.key}-value`}>
              {pct}％
            </output>
          </div>
        );
      })}
      {!soundOn && <p className="bss-note">サウンドがオフの間は、音楽・効果音・ボイスのどれも鳴りません（ゲームはそのまま進みます）。</p>}
      <div className="bss-actions">
        <button type="button" className="btn btn-primary" onClick={onClose} data-testid="bss-close">
          閉じる
        </button>
      </div>
    </section>
  );
}
