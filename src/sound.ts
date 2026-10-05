/** 効果音（設定で ON にしたときだけ鳴らします。初期状態は OFF） */
let ctx: AudioContext | null = null;

function tone(freq: number, ms: number, volume: number) {
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.value = volume;
    osc.connect(gain).connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.start(t);
    osc.stop(t + ms / 1000);
  } catch {
    /* 音が出せない環境では何もしません */
  }
}

export const sound = {
  miss: () => tone(220, 120, 0.08),
  complete: () => tone(880, 140, 0.05),
  finish: () => tone(660, 300, 0.06),
};
