/**
 * 育成カード：えらんだ桜の名前・成長段階・水の量（今の量／満開に必要な量）と水やり。
 * 水やりは在庫と満開までの残りの小さい方までしか使いません。満開の桜には水を使わず「鑑賞する」になります。
 */
import { useEffect, useState } from 'react';
import { COPY, fill, WATER_STEP, type Stage } from '../../core/garden/config';
import { remainingToBloom, stageOf, thresholdsOf, type GardenState, type TreeInstance } from '../../core/garden/state';
import { treeSprite, type SpecialSprites } from './assets';
import { treeName } from './GardenScene';

interface Props {
  state: GardenState;
  tree: TreeInstance | null;
  special: SpecialSprites | null;
  specialName: string | null;
  /** 水やり（反映できたら true） */
  onWater: (tree: TreeInstance, amount: number) => boolean;
  onView: (tree: TreeInstance) => void;
  onReceiveFirst: () => void;
  /** 特別な桜が満開になったときの文章 */
  specialBloomText?: string | null;
  compact?: boolean;
}

export function GrowCard({ state, tree, special, specialName, onWater, onView, onReceiveFirst, specialBloomText, compact }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setMessage(null), [tree?.id]);

  if (!tree) {
    return (
      <section className={`gcard ${compact ? 'is-compact' : ''}`} aria-label={COPY.labels.selected_tree} data-testid="grow-card">
        {state.firstGranted ? (
          <p>{COPY.growth.select}</p>
        ) : (
          <>
            <p>{COPY.growth.no_tree}</p>
            <button type="button" className="btn btn-primary gbtn" onClick={onReceiveFirst} data-testid="receive-first">
              {COPY.shop.receive}
            </button>
            <p className="hint">{COPY.growth.first_tree_note}</p>
          </>
        )}
      </section>
    );
  }

  const stage = stageOf(tree);
  const th = thresholdsOf(tree);
  const rest = remainingToBloom(tree);
  const sprite = treeSprite(tree.species, stage, special);
  const name = treeName(tree.species, specialName);
  const water = (amount: number) => {
    const before: Stage = stageOf(tree);
    const use = Math.min(amount, state.water, rest);
    if (use <= 0) {
      setMessage(state.water <= 0 ? COPY.growth.not_enough_water : COPY.growth.already_bloomed);
      return;
    }
    if (!onWater(tree, use)) return;
    const after = stageOf({ ...tree, water: tree.water + use });
    // いくつかの段階をまとめて越えたときは、最後の段階だけを知らせます
    let text = fill(COPY.growth.watered, { amount: use });
    if (after !== before) text = after === 'bloom' && tree.species === 'special' && specialBloomText ? specialBloomText : COPY.growth.stage_messages[after];
    if (after === 'bloom' && !state.bloomed.has(tree.species)) text += ` ${COPY.growth.registered}`;
    setMessage(text);
  };

  return (
    <section className={`gcard ${compact ? 'is-compact' : ''}`} aria-label={COPY.labels.selected_tree} data-testid="grow-card">
      <div className="gcard-head">
        {sprite && <img src={sprite.url} alt="" className="gcard-img" />}
        <div>
          <p className="gcard-name" data-testid="grow-name">
            {name}
          </p>
          <p className="gcard-stage" data-testid="grow-stage">
            {COPY.growth.stages[stage]}
          </p>
        </div>
      </div>
      <div className="gcard-progress">
        <span className="gcard-label">{COPY.labels.growth}</span>
        <span className="gbar" role="progressbar" aria-label={`${COPY.labels.growth}（満開まで）`} aria-valuemin={0} aria-valuemax={th.bloom} aria-valuenow={tree.water}>
          <span className="gbar-fill" style={{ width: `${(tree.water / th.bloom) * 100}%` }} />
          {[th.young, th.buds].map((v) => (
            <span key={v} className="gbar-tick" style={{ left: `${(v / th.bloom) * 100}%` }} aria-hidden="true" />
          ))}
        </span>
        <span className="gcard-num" data-testid="grow-water">
          水 {tree.water} / {th.bloom}
        </span>
      </div>
      {stage === 'bloom' ? (
        <button type="button" className="btn btn-primary gbtn" onClick={() => onView(tree)} data-testid="grow-view">
          {COPY.buttons.view}
        </button>
      ) : (
        <>
          <p className="gcard-rest">{fill(COPY.labels.remaining_to_bloom, { water: rest })}</p>
          <div className="gcard-actions">
            <button type="button" className="btn gbtn" onClick={() => water(1)} disabled={state.water <= 0} data-testid="water-1">
              {COPY.buttons.water_one}
            </button>
            <button type="button" className="btn gbtn" onClick={() => water(WATER_STEP)} disabled={state.water <= 0} data-testid="water-5">
              {COPY.buttons.water_five}
            </button>
            <button type="button" className="btn btn-primary gbtn" onClick={() => water(rest)} disabled={state.water <= 0} data-testid="water-bloom">
              {COPY.buttons.water_to_bloom}
            </button>
          </div>
          {state.water <= 0 && <p className="hint">{COPY.growth.not_enough_water}</p>}
        </>
      )}
      <p className="gcard-msg" aria-live="polite" data-testid="grow-message">
        {message}
      </p>
    </section>
  );
}
