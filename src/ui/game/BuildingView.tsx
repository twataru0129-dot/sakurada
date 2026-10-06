import { STAGES } from '../../core/game/sakurada';
import { STAGE_ALTS, STAGE_IMAGES } from './stageImages';

/**
 * 建物の画像。6枚を同じ枠に重ね、いまの工程の画像だけを表示します（短いクロスフェード）。
 * 画像は object-fit: contain で、上端・地面を切らず、引き伸ばしません。
 */
export function BuildingView({ stage, loadState, sparkle, large = false }: { stage: number; loadState: 'loading' | 'ready' | 'error'; sparkle?: number; large?: boolean }) {
  return (
    <div className={`building ${large ? 'building-large' : ''}`} data-testid="building" data-stage={stage}>
      {loadState === 'error' ? (
        <div className="building-fallback" role="img" aria-label={`工程：${STAGES[stage]!.name}`} data-testid="building-fallback">
          <p>建物の画像を読み込めませんでした。ページを再読み込みしてください。</p>
          <p className="building-fallback-stage">いまの工程：{STAGES[stage]!.name}</p>
        </div>
      ) : (
        STAGE_IMAGES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={i === stage ? STAGE_ALTS[i] : ''}
            aria-hidden={i === stage ? undefined : true}
            className={`building-img ${i === stage ? 'is-current' : ''}`}
            width={1536}
            height={1024}
            draggable={false}
            data-testid={i === stage ? 'building-current' : undefined}
          />
        ))
      )}
      {loadState === 'loading' && <p className="building-loading">画像を読み込んでいます…</p>}
      {sparkle !== undefined && sparkle > 0 && <span key={sparkle} className="building-sparkle" aria-hidden="true" />}
    </div>
  );
}
