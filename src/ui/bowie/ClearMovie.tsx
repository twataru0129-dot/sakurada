/**
 * ボウイの爆弾遊戯：クリアのスペシャルムービー（v1.9.0）。勝利が決まった直後、クリアのダンスの前に1回だけ流します。
 *
 * - 画面全体（ゲームの表示の上）に専用の黒い画面を出し、動画は縦横比を保って全体を見せます（余白は黒。引き伸ばし・切り取りなし）。
 *   得点・入力の欄・キャラクターは重ねません。スマートフォンでも画面の中で再生し（playsInline）、全画面表示には頼りません。
 * - 先頭から1回だけ（ループなし）。終わりは実際の ended で決めます（固定の時間ではありません）。
 * - 音は「音楽」の音量に合わせ、共通の音 OFF ではミュートします（設定の値は変えません）。
 * - 「ムービーをスキップ」は動画の外（下の帯）。音つきの自動再生を拒否されたときは「再生する」も出します。
 * - 読み込み・再生のエラー、読み込みが始まらないまま MOVIE_STALL_MS が過ぎたときは、そのまま次（クリアのダンス）へ進みます。
 * - タブが見えなくなったら一時停止し、戻ったら続きから（再開を拒否されたら「再生する」）。
 * - 終わり・スキップ・エラーが重なっても、onDone は1回だけ呼びます。画面から外れたら再生を止め、古い ended は無視します。
 */
import { useEffect, useRef, useState } from 'react';

const urls = import.meta.glob('../../assets/bowie/video/*.{mp4,webm}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** 配信用の動画：納品の MP4（H.264＋AAC）を先に、同じ映像・音声の WebM（VP9＋Opus。H.264 を再生できないブラウザー用）を2番目に */
export const CLEAR_MOVIE_SOURCES: readonly { src: string; type: string }[] = [
  { src: urls['../../assets/bowie/video/bowie_clear_special.mp4'] ?? '', type: 'video/mp4' },
  { src: urls['../../assets/bowie/video/bowie_clear_special.webm'] ?? '', type: 'video/webm' },
].filter((s) => s.src);
/** 納品の動画の長さ（秒）。表示と説明用で、進行は ended で決めます */
export const CLEAR_MOVIE_SECONDS = 15.117;
/** 読み込みが始まらない（データが1つも届かない）まま、これだけ過ぎたらエラーとして先へ進みます */
export const MOVIE_STALL_MS = 8000;

/** このブラウザーで再生できる最初の動画（先読み用） */
export function clearMovieUrl(): string | null {
  try {
    const v = document.createElement('video');
    return CLEAR_MOVIE_SOURCES.find((s) => v.canPlayType(s.type) !== '')?.src ?? null;
  } catch {
    return null;
  }
}

export type MovieEnd = 'ended' | 'skip' | 'error';

export function ClearMovie({ muted, volume, onDone }: { muted: boolean; volume: number; onDone: (why: MovieEnd) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const done = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  /** 自動再生（または再開）を拒否されて、利用者の操作を待っているか */
  const [blocked, setBlocked] = useState(false);
  const [state, setState] = useState<'loading' | 'playing' | 'paused' | 'blocked'>('loading');

  const finish = (why: MovieEnd) => {
    if (done.current) return;
    done.current = true;
    const v = ref.current;
    if (v) {
      try {
        v.pause();
      } catch {
        /* もう止まっています */
      }
    }
    doneRef.current(why);
  };
  const tryPlay = () => {
    const v = ref.current;
    if (!v || done.current) return;
    const p = v.play();
    if (p && typeof p.then === 'function') {
      p.then(
        () => {
          setBlocked(false);
          setState('playing');
        },
        (e: unknown) => {
          if (done.current) return;
          // 音つきの自動再生の拒否（NotAllowedError）は操作を待ちます。そのほかの失敗（再生できない形式など）は先へ進みます
          if ((e as { name?: string } | null)?.name === 'NotAllowedError') {
            setBlocked(true);
            setState('blocked');
          } else if ((e as { name?: string } | null)?.name !== 'AbortError') finish('error');
        },
      );
    }
  };

  // 音量・ミュート（「音楽」の音量と共通の音の設定に合わせます。設定が変わればすぐに反映）
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = muted;
    v.volume = Math.min(1, Math.max(0, volume));
  }, [muted, volume]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = muted;
    v.volume = Math.min(1, Math.max(0, volume));
    v.currentTime = 0;
    tryPlay();
    // 読み込みが始まらないまま止まったとき（ネットワークの失敗など）も、先へ進めます
    const stall = window.setTimeout(() => {
      if (!done.current && v.readyState < 2) finish('error');
    }, MOVIE_STALL_MS);
    const onHide = () => {
      if (done.current) return;
      if (document.visibilityState === 'hidden') v.pause();
      else if (v.paused && !v.ended) tryPlay();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearTimeout(stall);
      document.removeEventListener('visibilitychange', onHide);
      // 画面から外れた（再挑戦・画面の移動・飛ばした）：再生を止め、あとから ended などが来ても何もしません
      done.current = true;
      try {
        v.pause();
        v.removeAttribute('src');
        for (const s of Array.from(v.querySelectorAll('source'))) s.removeAttribute('src');
        v.load();
      } catch {
        /* もう止まっています */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bowie-result is-win step-movie" data-testid="bowie-result" data-kind="win" data-step="movie">
      <div className="bowie-movie" data-testid="bowie-movie" data-state={state}>
        <video
          ref={ref}
          className="bowie-movie-video"
          playsInline
          preload="auto"
          disablePictureInPicture
          controls={false}
          onEnded={() => finish('ended')}
          // <source> のエラーは React では親の <video> にも伝わります。候補の1つ目（MP4）を再生できないだけなら、
          // ブラウザーが次の候補（WebM）を読むので、ここでは <video> 自身のエラーだけを扱います
          onError={(e) => {
            if (e.target === e.currentTarget) finish('error');
          }}
          onPlaying={() => setState('playing')}
          onPause={() => setState((s) => (s === 'blocked' ? s : 'paused'))}
          aria-label="クリアのスペシャルムービー"
          data-testid="bowie-movie-video"
        >
          {CLEAR_MOVIE_SOURCES.map((s, i) => (
            // 最後の候補も読み込めなかったら、エラーとして先へ進みます
            <source
              key={s.type}
              src={s.src}
              type={s.type}
              onError={(e) => {
                e.stopPropagation();
                if (i === CLEAR_MOVIE_SOURCES.length - 1) finish('error');
              }}
            />
          ))}
        </video>
        {blocked && (
          <button type="button" className="btn btn-primary bowie-movie-play" onClick={tryPlay} data-testid="bowie-movie-play">
            ▶ ムービーを再生する
          </button>
        )}
      </div>
      <div className="bowie-defeat-bar">
        <button type="button" className="btn bowie-skip-quiet" onClick={() => finish('skip')} data-testid="bowie-movie-skip">
          ムービーをスキップ
        </button>
      </div>
    </div>
  );
}
