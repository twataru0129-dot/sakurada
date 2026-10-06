import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ExamProblem, Rotation } from '../../core/exam';
import { openPdf, PdfError, renderPdfPage, type PdfDoc } from '../../data/pdf';

/** お手本のファイルを取り出す関数（保存済みの問題は端末の保存先から、編集中はその場のファイルから） */
export type BlobResolver = (fileId: string) => Promise<Blob | null>;

interface Props {
  problem: Pick<ExamProblem, 'material' | 'answerText' | 'title'>;
  resolve: BlobResolver;
  /** 文字の大きさ（テキストのお手本） */
  fontScale: number;
  /** 練習画面：左側いっぱいに表示 */
  fill?: boolean;
}

/** お手本の表示（テキスト／画像／PDF） */
export function MaterialViewer({ problem, resolve, fontScale, fill = false }: Props) {
  if (problem.material.kind === 'text') return <TextModel text={problem.answerText ?? ''} fontScale={fontScale} />;
  return <PagedModel problem={problem} resolve={resolve} fill={fill} />;
}

function TextModel({ text, fontScale }: { text: string; fontScale: number }) {
  const paragraphs = text.normalize('NFC').split('\n');
  return (
    <div className="exam-model-text" style={{ fontSize: `${fontScale}rem` }} data-testid="model-text" lang="ja">
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p}
          {i < paragraphs.length - 1 && (
            <span className="para-mark" aria-label="（段落の終わり：ここで改行）" title="段落の終わり（ここで改行）">
              ↵
            </span>
          )}
        </p>
      ))}
    </div>
  );
}

type Page = { fileId: string; pdfPage: number | null; rotation: Rotation };

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];

function PagedModel({ problem, resolve, fill }: { problem: Props['problem']; resolve: BlobResolver; fill: boolean }) {
  const m = problem.material;
  const pages: Page[] =
    m.kind === 'image'
      ? m.pages.map((p) => ({ fileId: p.fileId, pdfPage: null, rotation: p.rotation }))
      : m.kind === 'pdf'
        ? m.pages.map((p) => ({ fileId: m.fileId, pdfPage: p.page, rotation: p.rotation }))
        : [];
  const pagesKey = JSON.stringify(pages);
  const [index, setIndex] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(2);
  const [extraRot, setExtraRot] = useState<Rotation>(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<{ fileId: string; doc: Promise<PdfDoc> } | null>(null);
  const imgRef = useRef<{ fileId: string; img: Promise<HTMLImageElement> } | null>(null);
  const page = pages[Math.min(index, pages.length - 1)];
  const zoom = ZOOMS[zoomIdx] ?? 1;

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, pages.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesKey]);

  // 表示する幅（左側の枠の幅）に合わせて描き直します
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setWidth(Math.max(200, el.clientWidth - 24));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // PDF は開いたままにして、ページだけ描き直します。ほかの問題に変わったら閉じます
  useEffect(
    () => () => {
      void pdfRef.current?.doc.then((d) => d.loadingTask.destroy()).catch(() => {});
      pdfRef.current = null;
    },
    [],
  );

  const loadImage = useCallback(
    (fileId: string) => {
      if (imgRef.current?.fileId === fileId) return imgRef.current.img;
      const img = (async () => {
        const blob = await resolve(fileId);
        if (!blob) throw new Error('missing');
        const url = URL.createObjectURL(blob);
        try {
          const el = new Image();
          el.decoding = 'async';
          el.src = url;
          await el.decode();
          return el;
        } finally {
          // 描いたあとは URL を残しません（保存しているのはファイル本体です）
          window.setTimeout(() => URL.revokeObjectURL(url), 0);
        }
      })();
      imgRef.current = { fileId, img };
      img.catch(() => {
        if (imgRef.current?.img === img) imgRef.current = null;
      });
      return img;
    },
    [resolve],
  );

  const loadPdf = useCallback(
    (fileId: string) => {
      if (pdfRef.current?.fileId === fileId) return pdfRef.current.doc;
      void pdfRef.current?.doc.then((d) => d.loadingTask.destroy()).catch(() => {});
      const doc = (async () => {
        const blob = await resolve(fileId);
        if (!blob) throw new Error('missing');
        return openPdf(blob);
      })();
      pdfRef.current = { fileId, doc };
      doc.catch(() => {
        if (pdfRef.current?.doc === doc) pdfRef.current = null;
      });
      return doc;
    },
    [resolve],
  );

  useEffect(() => {
    if (!page || !canvas.current || width === 0) return;
    let cancelled = false;
    const c = canvas.current;
    const rot = ((page.rotation + extraRot) % 360) as Rotation;
    setBusy(true);
    setError(null);
    (async () => {
      if (page.pdfPage !== null) {
        const doc = await loadPdf(page.fileId);
        if (cancelled) return;
        if (page.pdfPage > doc.numPages) throw new Error('page');
        const p = await doc.getPage(page.pdfPage);
        const vp = p.getViewport({ scale: 1, rotation: (p.rotate + rot) % 360 });
        if (cancelled) return;
        await renderPdfPage(doc, page.pdfPage, c, (width / vp.width) * zoom, rot);
      } else {
        const img = await loadImage(page.fileId);
        if (cancelled) return;
        const turned = rot === 90 || rot === 270;
        const w0 = turned ? img.naturalHeight : img.naturalWidth;
        const h0 = turned ? img.naturalWidth : img.naturalHeight;
        const cssW = Math.max(50, Math.round(width * zoom));
        const cssH = Math.round((h0 / w0) * cssW);
        let ratio = Math.min(window.devicePixelRatio || 1, 2);
        if (cssW * cssH * ratio * ratio > 16_000_000) ratio = Math.sqrt(16_000_000 / (cssW * cssH));
        c.width = Math.floor(cssW * ratio);
        c.height = Math.floor(cssH * ratio);
        c.style.width = `${cssW}px`;
        c.style.height = `${cssH}px`;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('canvas');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate((rot * Math.PI) / 180);
        const dw = turned ? c.height : c.width;
        const dh = turned ? c.width : c.height;
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      }
    })()
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof PdfError
            ? e.message
            : (e as Error)?.message === 'missing'
              ? 'お手本のファイルが見つかりません。この端末に保存されていないか、削除された可能性があります。'
              : 'お手本を表示できませんでした。ファイルが壊れているか、この端末では表示できない形式です。',
        );
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page?.fileId, page?.pdfPage, page?.rotation, extraRot, zoom, width, loadImage, loadPdf]); // eslint-disable-line react-hooks/exhaustive-deps

  // マウス・ペンでドラッグして、拡大した本文を動かせます（指ではそのままスクロールできます）
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const onDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'touch' || !scroller.current) return;
    drag.current = { x: e.clientX, y: e.clientY, left: scroller.current.scrollLeft, top: scroller.current.scrollTop };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current || !scroller.current) return;
    scroller.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
    scroller.current.scrollTop = drag.current.top - (e.clientY - drag.current.y);
  };
  const onUp = () => {
    drag.current = null;
  };

  if (pages.length === 0) return <p className="hint">お手本のページがありません。</p>;
  return (
    <div className={`paged-model ${fill ? 'paged-fill' : ''}`}>
      <div className="viewer-tools" role="toolbar" aria-label="お手本の表示">
        <button type="button" className="btn btn-small" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} aria-label="前のページ">
          ◀
        </button>
        <span className="viewer-page" data-testid="viewer-page" aria-live="polite">
          {index + 1} / {pages.length} ページ
        </span>
        <button type="button" className="btn btn-small" onClick={() => setIndex((i) => Math.min(pages.length - 1, i + 1))} disabled={index >= pages.length - 1} aria-label="次のページ">
          ▶
        </button>
        <span className="viewer-sep" />
        <button type="button" className="btn btn-small" onClick={() => setZoomIdx((z) => Math.max(0, z - 1))} disabled={zoomIdx === 0} aria-label="縮小">
          −
        </button>
        <span className="viewer-zoom" data-testid="viewer-zoom">
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" className="btn btn-small" onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoomIdx === ZOOMS.length - 1} aria-label="拡大">
          ＋
        </button>
        <button type="button" className="btn btn-small btn-quiet" onClick={() => setZoomIdx(2)}>
          幅に合わせる
        </button>
        <button type="button" className="btn btn-small btn-quiet" onClick={() => setExtraRot((r) => (((r + 90) % 360) as Rotation))} aria-label="右に90度回す">
          ↻ 回転
        </button>
      </div>
      <div
        ref={scroller}
        className={`viewer-scroll ${zoom > 1 ? 'can-pan' : ''}`}
        data-testid="viewer-scroll"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {error && (
          <p className="msg msg-ng" role="alert">
            {error}
          </p>
        )}
        <canvas
          ref={canvas}
          className="viewer-canvas"
          hidden={!!error}
          data-testid="viewer-canvas"
          role="img"
          aria-label={`${problem.title} のお手本 ${index + 1}ページ目`}
        />
        {busy && !error && <p className="hint viewer-busy">表示しています…</p>}
      </div>
    </div>
  );
}
