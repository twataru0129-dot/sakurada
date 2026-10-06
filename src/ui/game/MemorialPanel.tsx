import { useEffect, useRef, useState } from 'react';
import type { GameResult } from '../../core/game/result';
import { STAGE_IMAGES } from './stageImages';
import { memorialContent, memorialFileName, NICKNAME_MAX, renderMemorialBlob, type MemorialContent } from './memorial';

/**
 * 完成記念画像の保存。成績の記録とは別の処理で、何度保存しても記録は増えません。
 * 画像は端末の中で作り、アプリから外部へ送ることはしません（共有するときは、共有先を本人が選びます）。
 */
export function MemorialPanel({ result, storyTitle, courseLabel, displayName }: { result: GameResult; storyTitle: string; courseLabel: string; displayName: string | null }) {
  const [open, setOpen] = useState(false);
  const [withName, setWithName] = useState(false);
  const [name, setName] = useState(displayName ?? '');
  const [state, setState] = useState<'idle' | 'making' | 'ready' | 'error'>('idle');
  const [png, setPng] = useState<{ blob: Blob; url: string; content: MemorialContent } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const fileName = memorialFileName(result.finishedAt);
  // 名前を入力している間は作り直さず、少し待ってから作ります
  const [nameForImage, setNameForImage] = useState(name);
  useEffect(() => {
    const t = window.setTimeout(() => setNameForImage(name), 300);
    return () => window.clearTimeout(t);
  }, [name]);

  // 作り直し（名前の有無・内容が変わったとき）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState('making');
    setNote(null);
    const content = memorialContent(result, storyTitle, courseLabel, withName ? nameForImage : null);
    renderMemorialBlob(STAGE_IMAGES[5]!, content)
      .then(({ blob }) => {
        if (cancelled) return;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setPng({ blob, url, content });
        setState('ready');
      })
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, [open, withName, nameForImage, result, storyTitle, courseLabel]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const file = png ? new File([png.blob], fileName, { type: 'image/png' }) : null;
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: '完成記念画像' });
      setNote('共有の画面を開きました。「画像を保存」などを選ぶと保存できます。');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setNote('共有できませんでした。下の画像を長押しして保存するか、「PNGを保存する」を使ってください。');
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)} data-testid="memorial-open">
        完成記念画像を保存
      </button>
    );
  }

  return (
    <section className="panel memorial-panel" aria-labelledby="memorial-title" data-testid="memorial-panel">
      <h2 id="memorial-title">完成記念画像</h2>
      <div className="memorial">
        <div className="memorial-preview">
          {state === 'making' && <p>画像を作っています…</p>}
          {state === 'error' && (
            <p className="msg msg-ng" role="alert">
              画像を作れませんでした。ページを再読み込みしてから、もう一度試してください（記録はそのまま残っています）。
            </p>
          )}
          {png && (
            <img
              src={png.url}
              alt={`完成記念画像：${png.content.title}、${png.content.yearLabel} ${png.content.year}、記録タイム ${png.content.time}`}
              data-testid="memorial-img"
              data-content={JSON.stringify(png.content)}
              hidden={state !== 'ready'}
            />
          )}
          <p className="hint">iPhone・iPad で保存できないときは、この画像を長押しして「"写真"に保存」（または「写真に追加」）を選んでください。</p>
        </div>
        <div className="memorial-form">
          <label className="switch">
            <input type="checkbox" checked={withName} onChange={(e) => setWithName(e.target.checked)} data-testid="memorial-with-name" />
            ニックネームを載せる
          </label>
          {withName && (
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor="memorial-name">{displayName ? '載せる名前（表示名）' : 'ニックネーム'}</label>
              <input
                id="memorial-name"
                type="text"
                maxLength={NICKNAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                data-testid="memorial-name"
              />
              <span className="hint">本名は入れないでください。{NICKNAME_MAX}文字まで。画像の中にだけ入り、どこにも送られません。</span>
            </div>
          )}
          <div className="btn-row" style={{ marginTop: 12 }}>
            <a
              className={`btn btn-primary ${state !== 'ready' ? 'is-disabled' : ''}`}
              href={png?.url}
              download={fileName}
              aria-disabled={state !== 'ready'}
              onClick={(e) => {
                if (state !== 'ready') e.preventDefault();
                else setNote(`「${fileName}」を保存しました（ブラウザのダウンロードの場所を確認してください）。`);
              }}
              data-testid="memorial-download"
            >
              PNGを保存する
            </a>
            {canShare && (
              <button type="button" className="btn" onClick={() => void share()} disabled={state !== 'ready'} data-testid="memorial-share">
                共有・写真に保存
              </button>
            )}
            <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
              閉じる
            </button>
          </div>
          {note && (
            <p className="hint" role="status" data-testid="memorial-note">
              {note}
            </p>
          )}
          <p className="hint">画像はこの端末の中で作ります。保存しても、成績の記録は増えません。</p>
        </div>
      </div>
    </section>
  );
}
