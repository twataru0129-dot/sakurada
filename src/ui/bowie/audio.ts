/**
 * ボウイの爆弾遊戯の音（Web Audio）。
 *
 * - 12種類の音声を画面を開いたときに読み込み（先読み）、開始の操作（ボタン・スペース）で再生できるようにします。
 * - 全体の音量・ミュートのほか、効果音とボイスを別の経路にして、ボイスが効果音に埋もれないようにします。
 * - 再生した音はすべて記録し、stopAll() で止めます（再挑戦・ホームへ戻るときに、前のゲームの音を残しません）。
 * - 再生できない（読み込みの失敗・ブラウザの拒否・ミュート）ときも、ended は音の長さのあとに終わるため、演出は先へ進みます。
 */
import manifest from '../../../assets/bowie-source/asset_manifest.json';
import { BOWIE_VOLUME_KEY } from '../../data/bowieRecords';

const urls = import.meta.glob('../../assets/bowie/audio/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const urlOf = (file: string) => Object.entries(urls).find(([p]) => p.endsWith(`/${file}`))?.[1] ?? '';

export type SoundKey =
  | 'throw'
  | 'disarm'
  | 'typo'
  | 'danger'
  | 'explosion'
  | 'cutin_shine'
  | 'cutin_rumble'
  | 'victory'
  | 'defeat'
  | 'loss_line'
  | 'laugh'
  | 'level_up';

/** ボイス（セリフ・笑い声・元動画の勝利・敗北の音）は、効果音とは別の経路で少し大きめにします */
const VOICE: ReadonlySet<SoundKey> = new Set(['victory', 'defeat', 'loss_line', 'laugh', 'level_up']);

interface Meta {
  file: string;
  volume: number;
  duration: number;
}
export const SOUNDS: Record<SoundKey, Meta> = Object.fromEntries(
  (manifest.audio as { file: string; volume: number; duration_seconds: number }[]).map((a) => [
    a.file.replace(/^bowie_/, '').replace(/\.mp3$/, ''),
    { file: a.file, volume: a.volume, duration: a.duration_seconds },
  ]),
) as Record<SoundKey, Meta>;

export interface Playing {
  /** 音が終わったとき（再生できなかったときも、音の長さのあとに終わります） */
  ended: Promise<void>;
  stop: () => void;
  setGain: (v: number, rampMs?: number) => void;
}

const BUS_GAIN = { sfx: 0.8, voice: 1 };

export class BowieAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: { sfx: GainNode; voice: GainNode } | null = null;
  private raw = new Map<SoundKey, Promise<ArrayBuffer | null>>();
  private buffers = new Map<SoundKey, AudioBuffer>();
  private active = new Set<{ stop: () => void }>();
  private volume = 0.8;
  private muted = false;
  private lastTypo = 0;
  failed = 0;

  /** 音声のファイルを読み込みます（再生の許可は要りません） */
  preload(): void {
    for (const key of Object.keys(SOUNDS) as SoundKey[]) {
      if (this.raw.has(key)) continue;
      const url = urlOf(SOUNDS[key].file);
      this.raw.set(
        key,
        url
          ? fetch(url)
              .then((r) => (r.ok ? r.arrayBuffer() : null))
              .catch(() => null)
          : Promise.resolve(null),
      );
    }
  }

  /** 利用者の操作（開始ボタン・スペース）の中で呼び、音を出せるようにします */
  unlock(): void {
    this.preload();
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        const sfx = this.ctx.createGain();
        const voice = this.ctx.createGain();
        sfx.gain.value = BUS_GAIN.sfx;
        voice.gain.value = BUS_GAIN.voice;
        sfx.connect(this.master);
        voice.connect(this.master);
        this.buses = { sfx, voice };
        this.applyVolume();
        for (const [key, p] of this.raw) {
          void p.then(async (buf) => {
            if (!buf || !this.ctx) return void (this.failed += buf ? 0 : 1);
            try {
              this.buffers.set(key, await this.ctx.decodeAudioData(buf.slice(0)));
            } catch {
              this.failed++;
            }
          });
        }
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number, muted: boolean): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.muted = muted;
    this.applyVolume();
  }
  private applyVolume() {
    if (this.master && this.ctx) this.master.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
  }

  play(key: SoundKey, opts: { gain?: number } = {}): Playing {
    const meta = SOUNDS[key];
    const fallbackMs = Math.round(meta.duration * 1000);
    let done!: () => void;
    const ended = new Promise<void>((r) => (done = r));
    let timer = window.setTimeout(() => done(), fallbackMs + 50);
    const buffer = this.buffers.get(key);
    const ctx = this.ctx;
    if (!buffer || !ctx || !this.buses) {
      return { ended, stop: () => (window.clearTimeout(timer), done()), setGain: () => undefined };
    }
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      g.gain.value = meta.volume * (opts.gain ?? 1);
      src.connect(g).connect(VOICE.has(key) ? this.buses.voice : this.buses.sfx);
      const handle = {
        stop: () => {
          try {
            src.stop();
          } catch {
            /* もう止まっています */
          }
          window.clearTimeout(timer);
          done();
        },
      };
      this.active.add(handle);
      src.onended = () => {
        this.active.delete(handle);
        window.clearTimeout(timer);
        done();
      };
      window.clearTimeout(timer);
      timer = window.setTimeout(() => done(), buffer.duration * 1000 + 300);
      src.start();
      return {
        ended,
        stop: handle.stop,
        setGain: (v, rampMs = 120) => {
          const t = ctx.currentTime;
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(meta.volume * v, t + rampMs / 1000);
        },
      };
    } catch {
      return { ended, stop: () => (window.clearTimeout(timer), done()), setGain: () => undefined };
    }
  }

  /** ミスの音：続けてミスしても、短い間隔をあけて鳴らします */
  typo(minGapMs: number): void {
    const now = performance.now();
    if (now - this.lastTypo < minGapMs) return;
    this.lastTypo = now;
    this.play('typo');
  }

  /** 一時停止の間は、鳴っている音も止めます（再開すると続きから鳴ります） */
  suspend(): void {
    void this.ctx?.suspend().catch(() => undefined);
  }
  resume(): void {
    void this.ctx?.resume().catch(() => undefined);
  }

  stopAll(): void {
    for (const h of [...this.active]) h.stop();
    this.active.clear();
  }

  dispose(): void {
    this.stopAll();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.buffers.clear();
  }
}

/** 全体の音量（この端末に保存します。ミュートは桜打の共通の「音」の設定を使います） */
const VOLUME_KEY = BOWIE_VOLUME_KEY;
export function loadVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.8;
  } catch {
    return 0.8;
  }
}
export function saveVolume(v: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
  } catch {
    /* 保存できなくても遊べます */
  }
}
