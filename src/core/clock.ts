/**
 * 練習時間の計測。開始時刻からの経過で残り時間を求めるため、
 * タブを切り替えたり画面が非表示になったりしても、時間は延長されません（一時停止はありません）。
 * performance.now() は端末の時計を変更しても影響を受けません。
 */
export class PracticeClock {
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;

  constructor(readonly durationMs: number, private readonly now: () => number = () => performance.now()) {}

  start(): void {
    this.startedAt = this.now();
    this.stoppedAt = null;
  }

  get started(): boolean {
    return this.startedAt !== null;
  }

  /** 途中終了（または時間切れ）で止めます */
  stop(): void {
    if (this.startedAt !== null && this.stoppedAt === null) this.stoppedAt = Math.min(this.now(), this.startedAt + this.durationMs);
  }

  /** 経過時間（ミリ秒）。練習時間を超えません */
  elapsedMs(): number {
    if (this.startedAt === null) return 0;
    const end = this.stoppedAt ?? this.now();
    return Math.max(0, Math.min(end - this.startedAt, this.durationMs));
  }

  remainingMs(): number {
    return this.durationMs - this.elapsedMs();
  }

  isOver(): boolean {
    return this.startedAt !== null && this.now() - this.startedAt >= this.durationMs;
  }
}
