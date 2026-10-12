/**
 * ボウイの爆弾遊戯の音（Web Audio）。
 *
 * - 音声を画面を開いたときに読み込み（先読み）、利用者の操作のあとで再生できるようにします。
 * - 音は3つの種類に分け、それぞれの音量（サウンド設定）を掛けます：音楽（通常の BGM・クリアの曲）／効果音／ボイス（セリフ・声）。
 *   全体の ON／OFF は桜打の共通の「音」の設定です。最後にリミッターを通し、音量を上げても音が割れないようにします。
 * - 各音の音量（SOUNDS の volume）は、同じ種類の中で平均の大きさがそろうように決めています（ボイスは約 −21.5dB、効果音は約 −21dB）。
 * - 再生した音はすべて記録し、stopAll() で止めます（再挑戦・ホームへ戻るときに、前のゲームの音を残しません）。
 *   通常の BGM は別に管理し（startBgm／stopBgm）、段階やカットインで最初から流し直しません。
 * - 再生できない（読み込みの失敗・ブラウザの拒否）ときも、ended は音の長さのあとに終わるため、演出は先へ進みます。
 *   OFF・音量0のときも、音は無音で流れて本当の長さで終わります。
 */
import manifest from '../../../assets/bowie-source/asset_manifest.json';
import { BOWIE_SOUND_DEFAULTS, type BowieSoundLevels } from '../../data/bowieSound';

const urls = import.meta.glob('../../assets/bowie/audio/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const urlOf = (file: string) => Object.entries(urls).find(([p]) => p.endsWith(`/${file}`))?.[1] ?? '';

export type SoundKey =
  | 'throw'
  | 'disarm'
  | 'disarm_v2'
  | 'typo'
  | 'danger'
  | 'explosion'
  | 'cutin_shine'
  | 'cutin_rumble'
  | 'victory'
  | 'defeat'
  | 'loss_line'
  | 'laugh'
  | 'level_up'
  | 'cutin_voice_02'
  | 'cutin_voice_03'
  | 'cutin_voice_04'
  | 'hero_hit_voice'
  | 'hero_cry'
  | 'bgm'
  | 'hero_clear_bgm'
  | 'levelup_voice_2'
  | 'levelup_voice_3'
  | 'levelup_voice_4';

export type SoundKind = 'music' | 'sfx' | 'voice';

/** 音楽：通常の BGM・クリアのダンスの曲 */
const MUSIC: ReadonlySet<SoundKey> = new Set(['bgm', 'hero_clear_bgm']);
/** ボイス：ボウイのセリフ・笑い声、主人公の声、VICTORY／DEFEAT の音声（タイトルコールは TitleCall.tsx で同じボイスの音量を使います） */
const VOICE: ReadonlySet<SoundKey> = new Set(['victory', 'defeat', 'loss_line', 'laugh', 'level_up', 'cutin_voice_02', 'cutin_voice_03', 'cutin_voice_04', 'hero_hit_voice', 'hero_cry', 'levelup_voice_2', 'levelup_voice_3', 'levelup_voice_4']);
export const kindOf = (key: SoundKey): SoundKind => (MUSIC.has(key) ? 'music' : VOICE.has(key) ? 'voice' : 'sfx');

interface Meta {
  file: string;
  volume: number;
  duration: number;
}
/**
 * 納品の manifest にない、あとから追加した音と、音量を調整し直した音。
 * - v1.5.3：2〜4回目のカットインのセリフ
 * - v1.6.0：通常の BGM、新しい解除の音、主人公の被弾の声・鳴き声、クリアのダンスの曲
 * - v1.6.0：VICTORY（−13.5dB）・DEFEAT（−16.8dB）は納品の音量（0.8）だとほかのボイスより大きいため下げ、
 *   投げる音も少し下げました。クリアの曲は、通常の BGM（1.0）より大きく（2.0）して演出として聞こえるようにしています。
 */
const EXTRA: Record<string, Meta> = {
  cutin_voice_02: { file: 'bowie_cutin_02_voice.mp3', volume: 0.7, duration: 2.429388 },
  cutin_voice_03: { file: 'bowie_cutin_03_voice.mp3', volume: 0.7, duration: 3.369796 },
  cutin_voice_04: { file: 'bowie_cutin_04_voice.mp3', volume: 0.75, duration: 1.776327 },
  bgm: { file: 'bowie_bgm.mp3', volume: 1, duration: 116.323265 },
  disarm_v2: { file: 'bowie_disarm_v2.mp3', volume: 0.75, duration: 1.201633 },
  hero_hit_voice: { file: 'bowie_hero_hit_voice.mp3', volume: 0.95, duration: 3.369796 },
  hero_cry: { file: 'bowie_hero_cry.mp3', volume: 1, duration: 3.552653 },
  hero_clear_bgm: { file: 'bowie_hero_clear_bgm.mp3', volume: 2, duration: 5.903673 },
  // v1.6.1：段階アップのボイス（第2段階＝212302「賢いものは…」、第3段階＝212407「それで？…」、第4段階＝212220「勝負を決めますよ！」）。
  // 平均の大きさ（−19.3dB・−19.3dB・−16.1dB）をほかのボイス（約 −21.5dB）にそろえています
  levelup_voice_2: { file: 'bowie_voice_212302.mp3', volume: 0.78, duration: 3.500408 },
  levelup_voice_3: { file: 'bowie_voice_212407.mp3', volume: 0.78, duration: 3.761633 },
  levelup_voice_4: { file: 'bowie_voice_212220.mp3', volume: 0.55, duration: 1.541224 },
};
const RETUNE: Partial<Record<SoundKey, number>> = { victory: 0.45, defeat: 0.6, throw: 0.5 };
export const SOUNDS: Record<SoundKey, Meta> = (() => {
  const base = Object.fromEntries(
    (manifest.audio as { file: string; volume: number; duration_seconds: number }[]).map((a) => [
      a.file.replace(/^bowie_/, '').replace(/\.mp3$/, ''),
      { file: a.file, volume: a.volume, duration: a.duration_seconds },
    ]),
  ) as Record<string, Meta>;
  for (const [k, v] of Object.entries(RETUNE)) if (base[k]) base[k] = { ...base[k]!, volume: v! };
  return { ...base, ...EXTRA } as Record<SoundKey, Meta>;
})();

export interface Playing {
  /** 音が終わったとき（再生できなかったときも、音の長さのあとに終わります） */
  ended: Promise<void>;
  stop: () => void;
  setGain: (v: number, rampMs?: number) => void;
}

/** BGM のつなぎ目：曲の先頭の無音を飛ばし、曲の終わりを短く消して、先頭へ戻るときのプツッという音を防ぎます */
const BGM_TAIL_FADE_S = 0.015;
const BGM_HEAD_THRESHOLD = 1e-3;

export class BowieAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<SoundKind, GainNode> | null = null;
  /** 音楽の一時的な下げ（カットインのセリフの間）。音楽の音量の設定とは別に掛けます */
  private duck: GainNode | null = null;
  private raw = new Map<SoundKey, Promise<ArrayBuffer | null>>();
  private buffers = new Map<SoundKey, AudioBuffer>();
  private decoding = new Map<SoundKey, Promise<AudioBuffer | null>>();
  private active = new Set<{ stop: () => void }>();
  private levels: BowieSoundLevels = { ...BOWIE_SOUND_DEFAULTS };
  private muted = false;
  private lastTypo = 0;
  /** 通常の BGM：流したい状態か・いま流している音 */
  private bgmWanted = false;
  private bgm: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  /** BGM を流し始めた回数（確認用：重複していないことを調べます） */
  bgmStarts = 0;
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

  /** 利用者の操作のあと（開始ボタン・スペース・ゲームの選択）に呼び、音を出せるようにします */
  unlock(): void {
    this.preload();
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        this.ctx = ctx;
        // 全体 → リミッター → スピーカー（音量を上げても割れないように）
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -4;
        limiter.knee.value = 4;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.2;
        limiter.connect(ctx.destination);
        this.master = ctx.createGain();
        this.master.connect(limiter);
        const music = ctx.createGain();
        const duck = ctx.createGain();
        music.connect(duck).connect(this.master);
        const sfx = ctx.createGain();
        const voice = ctx.createGain();
        sfx.connect(this.master);
        voice.connect(this.master);
        this.buses = { music, sfx, voice };
        this.duck = duck;
        this.apply();
        for (const key of this.raw.keys()) void this.decode(key);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  private decode(key: SoundKey): Promise<AudioBuffer | null> {
    const have = this.decoding.get(key);
    if (have) return have;
    const p = (this.raw.get(key) ?? Promise.resolve(null)).then(async (buf) => {
      const ctx = this.ctx;
      if (!buf || !ctx) {
        if (!buf) this.failed++;
        return null;
      }
      try {
        const b = await ctx.decodeAudioData(buf.slice(0));
        if (this.ctx !== ctx) return null;
        this.buffers.set(key, b);
        return b;
      } catch {
        this.failed++;
        return null;
      }
    });
    this.decoding.set(key, p);
    return p;
  }

  /** 音の長さ（ミリ秒）。読み込めていれば実際の長さ、まだなら登録した長さです */
  durationMs(key: SoundKey): number {
    const b = this.buffers.get(key);
    return Math.round((b ? b.duration : SOUNDS[key].duration) * 1000);
  }

  /** サウンド設定（音楽・効果音・ボイスの音量 0〜1）と、全体の OFF */
  setLevels(levels: BowieSoundLevels, muted: boolean): void {
    this.levels = { ...levels };
    this.muted = muted;
    this.apply();
  }
  private apply() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.buses) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.015);
    for (const k of ['music', 'sfx', 'voice'] as const) this.buses[k].gain.setTargetAtTime(this.levels[k], t, 0.015);
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
      src.connect(g).connect(this.buses[kindOf(key)]);
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

  /**
   * 段階アップの文字が出るときの短い金属音（約0.5秒、効果音の音量）。素材の音声はないため、
   * 少しずれた高さの音（倍音）を重ねて、すぐに消える「キン」という音を作ります。
   */
  metal(): void {
    const ctx = this.ctx;
    if (!ctx || !this.buses) return;
    try {
      const t = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.value = 0.32;
      out.connect(this.buses.sfx);
      const nodes: OscillatorNode[] = [];
      for (const [f, a, d] of [
        [1180, 1, 0.45],
        [1835, 0.55, 0.32],
        [2920, 0.35, 0.22],
        [4410, 0.2, 0.14],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0008, t + d);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + d + 0.05);
        nodes.push(o);
      }
      const handle = {
        stop: () => {
          for (const o of nodes) {
            try {
              o.stop();
            } catch {
              /* もう止まっています */
            }
          }
        },
      };
      this.active.add(handle);
      nodes[0]!.onended = () => this.active.delete(handle);
    } catch {
      /* 鳴らせなくても演出は進みます */
    }
  }

  /**
   * 最終形態への変身（v1.8.0）の効果音（効果音の音量）。素材の音声はないため、Web Audio で作ります。
   * - charge：魔力が集まる上昇音（ノイズを通す帯域と、のこぎり波の高さを durMs かけて上げます）
   * - impact：閃光のピークの重い衝撃音（低い音が下がりながら消える音と、こもったノイズ）
   * gain は BOWIE_TRANSFORM の音量（段階のボイスが聞き取れるように小さめ）。止めるときは stopAll で止まります。
   */
  transformSound(kind: 'charge' | 'impact', durMs: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.buses) return;
    try {
      const t = ctx.currentTime;
      const d = Math.max(0.05, durMs / 1000);
      const out = ctx.createGain();
      out.gain.value = gain;
      out.connect(this.buses.sfx);
      const sources: AudioScheduledSourceNode[] = [];
      const noise = (len: number) => {
        const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        return src;
      };
      if (kind === 'charge') {
        const n = noise(d + 0.1);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 6;
        bp.frequency.setValueAtTime(300, t);
        bp.frequency.exponentialRampToValueAtTime(2600, t + d);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.9, t + d);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.08);
        n.connect(bp).connect(ng).connect(out);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(90, t);
        o.frequency.exponentialRampToValueAtTime(420, t + d);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1400;
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, t);
        og.gain.exponentialRampToValueAtTime(0.25, t + d);
        og.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.08);
        o.connect(lp).connect(og).connect(out);
        sources.push(n, o);
        n.start(t);
        o.start(t);
        n.stop(t + d + 0.1);
        o.stop(t + d + 0.1);
      } else {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(32, t + d);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0, t);
        og.gain.linearRampToValueAtTime(1, t + 0.008);
        og.gain.exponentialRampToValueAtTime(0.0008, t + d);
        o.connect(og).connect(out);
        const n = noise(d);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1800, t);
        lp.frequency.exponentialRampToValueAtTime(120, t + d * 0.6);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.7, t);
        ng.gain.exponentialRampToValueAtTime(0.0008, t + d * 0.6);
        n.connect(lp).connect(ng).connect(out);
        sources.push(o, n);
        o.start(t);
        n.start(t);
        o.stop(t + d + 0.05);
        n.stop(t + d + 0.05);
      }
      const handle = {
        stop: () => {
          for (const s of sources) {
            try {
              s.stop();
            } catch {
              /* もう止まっています */
            }
          }
        },
      };
      this.active.add(handle);
      sources[0]!.onended = () => this.active.delete(handle);
    } catch {
      /* 鳴らせなくても演出は進みます */
    }
  }

  /** ミスの音：続けてミスしても、短い間隔をあけて鳴らします */
  typo(minGapMs: number): void {
    const now = performance.now();
    if (now - this.lastTypo < minGapMs) return;
    this.lastTypo = now;
    this.play('typo');
  }

  // ---------------------------------------------------------------- 通常の BGM

  /** 通常の BGM を最初から流します（すでに流れていれば何もしません。何度呼んでも1つだけです） */
  startBgm(): void {
    this.bgmWanted = true;
    if (this.bgm) return;
    if (!this.ctx) this.unlock();
    void this.decode('bgm').then((buffer) => {
      const ctx = this.ctx;
      if (!buffer || !ctx || !this.buses || !this.bgmWanted || this.bgm) return;
      prepareLoop(buffer);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = headOf(buffer);
      src.loopEnd = buffer.duration;
      const gain = ctx.createGain();
      gain.gain.value = SOUNDS.bgm.volume;
      src.connect(gain).connect(this.buses.music);
      src.start();
      this.bgm = { src, gain };
      this.bgmStarts++;
    });
  }

  /** 通常の BGM を止めます（短く消してから止めます） */
  stopBgm(fadeMs = 80): void {
    this.bgmWanted = false;
    const b = this.bgm;
    this.bgm = null;
    this.setDuck(1, 0);
    if (!b || !this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      b.gain.gain.cancelScheduledValues(t);
      b.gain.gain.setValueAtTime(b.gain.gain.value, t);
      b.gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
      b.src.stop(t + fadeMs / 1000 + 0.01);
    } catch {
      /* もう止まっています */
    }
  }

  get bgmPlaying(): boolean {
    return this.bgm !== null || this.bgmWanted;
  }

  /** 音楽を一時的に下げる（1 で元に戻す）。音楽の音量の設定はそのままです */
  setDuck(level: number, rampMs = 200): void {
    const ctx = this.ctx;
    if (!ctx || !this.duck) return;
    const t = ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(this.duck.gain.value, t);
    this.duck.gain.linearRampToValueAtTime(level, t + rampMs / 1000);
  }

  /** 一時停止の間は、鳴っている音も止めます（再開すると続きから鳴ります） */
  suspend(): void {
    void this.ctx?.suspend().catch(() => undefined);
  }
  resume(): void {
    void this.ctx?.resume().catch(() => undefined);
  }

  /** 効果音・ボイス・クリアの曲をすべて止めます（通常の BGM は stopBgm で止めます） */
  stopAll(): void {
    for (const h of [...this.active]) h.stop();
    this.active.clear();
  }

  dispose(): void {
    this.stopAll();
    this.stopBgm(0);
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.buffers.clear();
    this.decoding.clear();
  }
}

const prepared = new WeakSet<AudioBuffer>();
/** 曲の終わりの数ミリ秒を消して、先頭へ戻るときの段差（プツッという音）をなくします（1つの音につき1回だけ） */
function prepareLoop(buffer: AudioBuffer) {
  if (prepared.has(buffer)) return;
  prepared.add(buffer);
  const n = Math.min(buffer.length, Math.round(buffer.sampleRate * BGM_TAIL_FADE_S));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const j = buffer.length - 1 - i;
      d[j] = (d[j] ?? 0) * (i / n);
    }
  }
}
/** 曲の先頭の無音（エンコードで付く分を含む）のあと、音が始まる少し前の時刻（2回目からの戻り先） */
function headOf(buffer: AudioBuffer): number {
  const d = buffer.getChannelData(0);
  const limit = Math.min(d.length, buffer.sampleRate * 0.5);
  for (let i = 0; i < limit; i++) if (Math.abs(d[i]!) > BGM_HEAD_THRESHOLD) return Math.max(0, i - buffer.sampleRate * 0.002) / buffer.sampleRate;
  return 0;
}
