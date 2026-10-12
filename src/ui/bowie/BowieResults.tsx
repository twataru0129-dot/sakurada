/**
 * ボウイの爆弾遊戯の勝敗の演出と戦績の画面（v1.7.0）。
 *
 * 勝利：dance（クリアの曲とダンス）→ victory（VICTORY の画像と音声）→ despair（ボウイの絶望と敗北のセリフ）→ stats（勝利の戦績）
 * 敗北：defeat（DEFEAT の画像と音声）→ taunt（煽りの画像1枚・笑い声 → 主人公の鳴き声）→ stats（敗北の戦績）
 * 演出の場面には点数や再挑戦のボタンを重ねず、「演出を飛ばす」だけを画像の外（下の帯）に置きます。
 * 戦績は、利用者が「もう一度挑戦」「ゲーム選択へ」を押すまで表示します。成績はすべて実際のデータです（見本の数値は使いません）。
 */
import { useRef, type CSSProperties } from 'react';
import { BOWIE_RANKS, formatAccuracy, type BowieRank, type BowieStats } from '../../core/bowie/results';
import type { BowieRecord } from '../../data/bowieRecords';
import type { BowieTaunt } from './taunts';

/** ダンスの拍（クリアの曲は約150 BPM。1拍ごとに跳ね、両手は半拍ずつ上げ下げします） */
export const DANCE_BEAT_MS = 400;

export type ResultStep = 'explode' | 'defeat' | 'taunt' | 'dance' | 'victory' | 'despair' | 'stats';
export interface Result {
  kind: 'lose' | 'win';
  step: ResultStep;
  /** 勝敗が決まったときに固定した成績（あとから変わりません） */
  stats: BowieStats;
  /** 勝利のランク（敗北は null） */
  rank: BowieRank | null;
  record: BowieRecord;
  newBest: boolean;
  saved: boolean;
  taunt?: BowieTaunt;
  /** 勝敗が決まったときに最終形態だったか（v1.8.0。ダンス・絶望の場面の背景と、絶望へ切り替わるときの魔力が消える表現） */
  final?: boolean;
}

const emblemUrls = import.meta.glob('../../assets/bowie/emblems/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const emblemUrl = (id: string, kind: 'full' | 'mark') => emblemUrls[`../../assets/bowie/emblems/${id}${kind === 'mark' ? '_mark' : ''}.webp`] ?? '';

export interface ResultImages {
  defeat: string;
  victory: string;
  background: string;
  /** 最終形態の赤い最終決戦の背景（v1.8.0） */
  backgroundFinal: string;
  resultsBackground: string;
  danceUp: string;
  danceDown: string;
  heroVictory: string;
  heroHit: string;
  bowieDespair: string;
}

const SkipBar = ({ onSkip }: { onSkip: () => void }) => (
  <div className="bowie-defeat-bar">
    <button type="button" className="btn bowie-skip-quiet" onClick={onSkip} data-testid="bowie-skip">
      演出を飛ばす
    </button>
  </div>
);

/** 画面全体の演出の画像（縦横比を保って全体を見せ、余白は同じ画像のぼかし）。点数・ボタンは重ねません */
function FullScene({ step, kind, src, alt, testId, tauntId, onSkip }: { step: ResultStep; kind: 'win' | 'lose'; src: string; alt: string; testId: string; tauntId?: string; onSkip: () => void }) {
  return (
    <div className={`bowie-result is-${kind} step-${step}`} data-testid="bowie-result" data-kind={kind} data-step={step}>
      <div className="bowie-defeat">
        <img className="bowie-defeat-back" src={src} alt="" />
        <img className="bowie-defeat-img" src={src} alt={alt} data-testid={testId} data-taunt-id={tauntId} />
      </div>
      <SkipBar onSkip={onSkip} />
    </div>
  );
}

export function ResultView({ result, images, onRetry, onSelect, onSkip }: { result: Result; images: ResultImages; onRetry: () => void; onSelect: () => void; onSkip: () => void }) {
  const lose = result.kind === 'lose';
  const busy = useRef(false);
  const once = (fn: () => void) => () => {
    if (busy.current) return;
    busy.current = true;
    fn();
  };
  const { step } = result;
  // 変身のあとは、ダンス・絶望の場面も最終決戦の背景のまま（VICTORY・DEFEAT・戦績は専用の画面です）
  const stageBackground = result.final ? images.backgroundFinal : images.background;
  if (step === 'stats') return lose ? <DefeatStats result={result} images={images} onRetry={once(onRetry)} onSelect={once(onSelect)} /> : <VictoryStats result={result} images={images} onRetry={once(onRetry)} onSelect={once(onSelect)} />;
  if (lose && (step === 'defeat' || step === 'explode')) return <FullScene step="defeat" kind="lose" src={images.defeat} alt="DEFEAT" testId="bowie-defeat" onSkip={onSkip} />;
  if (lose && step === 'taunt' && result.taunt) return <FullScene step="taunt" kind="lose" src={result.taunt.src} alt={`ボウイ「${result.taunt.line}」`} testId="bowie-taunt" tauntId={result.taunt.id} onSkip={onSkip} />;
  if (!lose && step === 'victory') return <FullScene step="victory" kind="win" src={images.victory} alt="VICTORY" testId="bowie-victory" onSkip={onSkip} />;
  if (!lose && step === 'dance') {
    return (
      <div className="bowie-result is-win step-dance" data-testid="bowie-result" data-kind="win" data-step="dance">
        <div className="bowie-dance" style={{ backgroundImage: `url(${stageBackground})`, ['--beat' as string]: `${DANCE_BEAT_MS}ms` } as CSSProperties} data-testid="bowie-dance">
          <div className="bowie-dance-sway">
            <div className="bowie-dance-jump">
              <img className="bowie-dance-frame is-up" src={images.danceUp} alt="両手を上げて喜ぶ主人公" data-testid="bowie-dance-up" draggable={false} />
              <img className="bowie-dance-frame is-down" src={images.danceDown} alt="" data-testid="bowie-dance-down" draggable={false} />
            </div>
          </div>
        </div>
        <SkipBar onSkip={onSkip} />
      </div>
    );
  }
  // 勝利の最後の演出：ボウイの絶望（敗北のセリフ）
  return (
    <div className="bowie-result is-win step-despair" data-testid="bowie-result" data-kind="win" data-step="despair">
      <div className="bowie-despair-scene" style={{ backgroundImage: `url(${stageBackground})` }} data-background={result.final ? 'final' : 'normal'}>
        <img className="bowie-despair-figure" src={images.bowieDespair} alt="絶望するボウイ" data-testid="bowie-despair" />
        {/* 最終形態が解けた：切り替わる瞬間に、赤い魔力が短く散って消えます（セリフや戦績への進みは延ばしません） */}
        {result.final && <span className="bowie-despair-dispel" aria-hidden="true" data-testid="bowie-dispel" />}
      </div>
      <SkipBar onSkip={onSkip} />
    </div>
  );
}

function StatsTable({ stats, accent }: { stats: BowieStats; accent: 'gold' | 'silver' }) {
  return (
    <dl className={`bowie-stats is-${accent}`} data-testid="bowie-stats">
      <div className="bst-cell is-big">
        <dt>スコア</dt>
        <dd>
          <strong data-testid="bowie-final-score">{stats.score}</strong>
          <small>点</small>
        </dd>
      </div>
      <div className="bst-cell">
        <dt>解除した問題</dt>
        <dd>
          <strong data-testid="bowie-solved">{stats.solved}</strong>
          <small> / {stats.total}</small>
        </dd>
      </div>
      <div className="bst-cell">
        <dt>ミスタイプ</dt>
        <dd>
          <strong data-testid="bowie-mistypes">{stats.mistypeCount}</strong>
          <small>回</small>
        </dd>
      </div>
      <div className="bst-cell is-big">
        <dt>正確率</dt>
        <dd>
          <strong data-testid="bowie-accuracy">{formatAccuracy(stats.accuracy).replace('%', '')}</strong>
          {stats.accuracy !== null && <small>%</small>}
        </dd>
      </div>
    </dl>
  );
}

function Actions({ onRetry, onSelect }: { onRetry: () => void; onSelect: () => void }) {
  return (
    <div className="brs-actions">
      <button type="button" className="btn brs-btn is-retry" onClick={onRetry} data-testid="bowie-retry">
        もう一度挑戦
      </button>
      <button type="button" className="btn brs-btn is-select" onClick={onSelect} data-testid="bowie-select">
        ゲーム選択へ
      </button>
    </div>
  );
}

/** 勝利の戦績：VICTORY・成績・獲得したエンブレム・全10ランクの一覧（自分のランクに光る枠と矢印） */
function VictoryStats({ result, images, onRetry, onSelect }: { result: Result; images: ResultImages; onRetry: () => void; onSelect: () => void }) {
  const { stats, rank } = result;
  return (
    <div className="bowie-result is-win step-stats" data-testid="bowie-result" data-kind="win" data-step="stats">
      <div className="brs brs-victory" style={{ backgroundImage: `url(${images.resultsBackground})` }} data-testid="bowie-stats-screen">
        <header className="brs-head">
          <h2 className="brs-title is-gold">VICTORY</h2>
          <p className="brs-game">ボウイの爆弾遊戯</p>
          <p className="brs-sub">全{stats.total}問クリア！</p>
        </header>
        <div className="brs-main">
          <div className="brs-face is-gold">
            <img src={images.heroVictory} alt="勝利した主人公" />
          </div>
          <div className="brs-panel">
            {result.newBest && (
              <p className="brs-new" data-testid="bowie-new-record">
                NEW RECORD
              </p>
            )}
            <StatsTable stats={stats} accent="gold" />
            <p className="brs-best" data-testid="bowie-result-best">
              ハイスコア {result.record.best} 点
            </p>
          </div>
          {rank && (
            <figure className="brs-emblem" data-testid="bowie-rank" data-rank={rank.id}>
              <img src={emblemUrl(rank.id, 'full')} alt={`獲得したランク：${rank.name}`} />
            </figure>
          )}
        </div>
        {rank && (
          <section className="brs-ranks" aria-labelledby="brs-ranks-title">
            <h3 id="brs-ranks-title">ランク一覧</h3>
            <ol className="brs-rank-list" data-testid="bowie-rank-list">
              {BOWIE_RANKS.map((r) => {
                const mine = r.id === rank.id;
                return (
                  <li key={r.id} className={mine ? 'is-mine' : ''} data-rank={r.id} data-mine={mine ? 'true' : undefined} aria-current={mine ? 'true' : undefined}>
                    {mine && (
                      <span className="brs-yours" aria-hidden="true">
                        あなたのランク
                      </span>
                    )}
                    <img src={emblemUrl(r.id, 'mark')} alt="" />
                    <span className="brs-rank-name">{r.name}</span>
                    <span className="brs-rank-range">
                      {r.min}〜{r.max}
                    </span>
                    {mine && <span className="sr-only">（あなたのランク）</span>}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
        {!result.saved && <p className="brs-note">記録をこの端末に保存できませんでした（ゲームは続けられます）。</p>}
        <Actions onRetry={onRetry} onSelect={onSelect} />
      </div>
    </div>
  );
}

/** 敗北の戦績：DEFEAT・成績・クリアまでの進み具合（ランクは付けません） */
function DefeatStats({ result, images, onRetry, onSelect }: { result: Result; images: ResultImages; onRetry: () => void; onSelect: () => void }) {
  const { stats } = result;
  const left = Math.max(0, stats.total - stats.solved);
  const pct = stats.total > 0 ? (stats.solved / stats.total) * 100 : 0;
  return (
    <div className="bowie-result is-lose step-stats" data-testid="bowie-result" data-kind="lose" data-step="stats">
      <div className="brs brs-defeat" style={{ backgroundImage: `url(${images.resultsBackground})` }} data-testid="bowie-stats-screen">
        <header className="brs-head">
          <h2 className="brs-title is-silver">DEFEAT</h2>
          <p className="brs-game">ボウイの爆弾遊戯</p>
        </header>
        <div className="brs-main">
          <div className="brs-face is-silver">
            <img src={images.heroHit} alt="爆弾に当たった主人公" />
          </div>
          <div className="brs-panel">
            {result.newBest && (
              <p className="brs-new" data-testid="bowie-new-record">
                NEW RECORD
              </p>
            )}
            <StatsTable stats={stats} accent="silver" />
            <div className="brs-progress" data-testid="bowie-progress-left">
              <span className="brs-left" data-testid="bowie-remaining">
                クリアまで あと{left}問
              </span>
              <span className="brs-bar" role="progressbar" aria-valuemin={0} aria-valuemax={stats.total} aria-valuenow={stats.solved} aria-label="解除した問題">
                <span style={{ width: `${pct}%` }} />
              </span>
              <span className="brs-count">
                {stats.solved} / {stats.total}
              </span>
            </div>
            <p className="brs-best" data-testid="bowie-result-best">
              ハイスコア {result.record.best} 点
            </p>
          </div>
        </div>
        {!result.saved && <p className="brs-note">記録をこの端末に保存できませんでした（ゲームは続けられます）。</p>}
        <Actions onRetry={onRetry} onSelect={onSelect} />
      </div>
    </div>
  );
}
