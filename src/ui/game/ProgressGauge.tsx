import { percentFor, type Stage } from '../../core/game/sakurada';

/**
 * 工事の進み具合（ゴールまでの見通し）。色だけでなく、完成率・残り文字数・工程名を文字でも示します。
 * 読み上げは、工程が変わったときだけ短く知らせます（打鍵ごとには読み上げません）。
 */
export function ProgressGauge({ completed, total, stage }: { completed: number; total: number; stage: Stage }) {
  const pct = percentFor(completed, total);
  const left = Math.max(0, total - Math.min(completed, total));
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  return (
    <div className="gauge-box" data-testid="gauge">
      <div className="gauge-head">
        <span className="gauge-title">工事の進み具合</span>
        <span className="gauge-stage" data-testid="gauge-stage">
          工程：<strong>{stage.name}</strong>
        </span>
      </div>
      <div
        className="gauge"
        role="progressbar"
        aria-label="工事の進み具合"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}％（${stage.name}）`}
        data-testid="gauge-bar"
      >
        <div className="gauge-fill" style={{ width: `${ratio * 100}%` }} />
        {[5, 20, 40, 70].map((p) => (
          <span key={p} className="gauge-tick" style={{ left: `${p}%` }} aria-hidden="true" />
        ))}
      </div>
      <div className="gauge-nums">
        <span className="gauge-pct" data-testid="gauge-pct">
          {pct}％
        </span>
        <span className="gauge-left" data-testid="gauge-left">
          完成まであと <strong>{left}</strong> 文字
        </span>
      </div>
      <p className="gauge-note">（読みの文字数で数えています）</p>
      <div className="sr-only" role="status" aria-live="polite" data-testid="stage-announce">
        {`工程：${stage.name}`}
      </div>
    </div>
  );
}
