import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PracticeClock } from '../../core/clock';
import { countExamChars, gradeInfo, isScorable, STANDARD_TIME_SECONDS, timeLabel } from '../../core/exam';
import { buildExamOutcome, type ExamEndReason } from '../../core/examResult';
import { MAX_INPUT_CHARS } from '../../core/examScoring';
import { newResultId } from '../../core/result';
import { examStore } from '../../data/examStore';
import { useApp } from '../../state/AppContext';
import { navigate } from '../../state/router';
import { MaterialViewer, type BlobResolver } from '../../ui/exam/MaterialViewer';
import { isStartKey } from '../Practice';

type Phase = 'ready' | 'running' | 'confirmQuit';

const FONT_STEPS = [0.85, 1, 1.15, 1.3, 1.5, 1.75];

/**
 * 検定モードの練習画面。
 * 左：お手本（文章・画像・PDF）、右：白紙の A4 縦の用紙（入力欄）、上：残り時間・確定済みの文字数・終了。
 *
 * 日本語入力（IME）について
 * - 入力欄は textarea を使い、変換・確定・削除はブラウザと IME にそのまま任せます。
 *   入力中のスペース・Enter をアプリの操作には使いません（開始のスペースは、開始前の待機画面だけで受け付けます）。
 * - 変換中（未確定）の文字は、文字数にも採点にも含めません。確定した時点の入力欄の内容を「確定済みの本文」として持ちます。
 * - 時間になった瞬間の確定済みの本文で終わります。そのあと IME が確定した文字は結果に加えません。
 */
export function ExamPractice() {
  const { examSession } = useApp();
  if (!examSession) {
    return (
      <main>
        <p>練習の設定がありません。</p>
        <button type="button" className="btn" onClick={() => navigate('/exam')}>
          問題をえらぶ
        </button>
      </main>
    );
  }
  return <ExamRunner key={`${examSession.problem.id}:${examSession.problem.revision}:${String(examSession.timeLimitSeconds)}`} />;
}

function ExamRunner() {
  const { examSession, recordExam } = useApp();
  const session = examSession!;
  const { problem, timeLimitSeconds, preview } = session;
  const clock = useMemo(() => new PracticeClock(timeLimitSeconds === null ? Number.POSITIVE_INFINITY : timeLimitSeconds * 1000), [timeLimitSeconds]);
  const [phase, setPhase] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  phaseRef.current = phase;
  const [now, setNow] = useState(0);
  const [count, setCount] = useState(0);
  const [fontIdx, setFontIdx] = useState(1);
  const area = useRef<HTMLTextAreaElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const committed = useRef('');
  const composing = useRef(false);
  const finished = useRef(false);
  const startedAt = useRef(new Date());
  const resultId = useRef(newResultId());
  const scored = isScorable(problem);
  const g = gradeInfo(problem.grade);
  const fontScale = FONT_STEPS[fontIdx] ?? 1;

  const resolve = useCallback<BlobResolver>(async (id) => (await examStore().getFile(id))?.blob ?? null, []);

  const finish = useCallback(
    (reason: ExamEndReason) => {
      if (finished.current || !clock.started) return;
      finished.current = true;
      clock.stop();
      const el = area.current;
      if (el) {
        el.readOnly = true;
        el.blur();
      }
      const elapsedMs = reason === 'time_up' && timeLimitSeconds !== null ? timeLimitSeconds * 1000 : clock.elapsedMs();
      recordExam(
        buildExamOutcome({
          id: resultId.current,
          startedAt: startedAt.current,
          problem,
          timeLimitSeconds,
          elapsedMs,
          endReason: reason,
          inputText: committed.current,
          preview,
        }),
      );
      navigate('/exam/result');
    },
    [clock, problem, timeLimitSeconds, preview, recordExam],
  );

  const start = useCallback(() => {
    if (clock.started) return;
    startedAt.current = new Date();
    clock.start();
    setPhase('running');
  }, [clock]);

  // 開始後は入力欄にフォーカスします
  useEffect(() => {
    if (phase === 'running' && area.current && document.activeElement !== area.current && !finished.current) area.current.focus();
  }, [phase]);

  // 待機画面：スペースキーで開始（開始のスペースは本文に入りません。変換中のスペースでは開始しません）
  useEffect(() => {
    if (phase !== 'ready') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.code !== 'Space') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isStartKey(e)) start();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [phase, start]);

  // 時間の確認。開始時刻からの経過で計算するため、別のタブに切り替えている間も時間は進みます
  useEffect(() => {
    if (phase === 'ready') return;
    const tick = () => {
      setNow(clock.elapsedMs());
      if (clock.isOver()) finish('time_up');
    };
    tick();
    const t = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [phase, clock, finish]);

  // 練習中に画面を離れたとき（ブラウザの戻るなど）は、その時点の確定済みの本文で終了として扱います
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(
    () => () => {
      if (clock.started && !finished.current) finishRef.current('user_end');
    },
    [clock],
  );

  /** 入力のたびに：時間を過ぎていたら、この入力は受け付けずに締め切ります */
  const overdue = () => {
    if (finished.current) return true;
    if (clock.isOver()) {
      finish('time_up');
      return true;
    }
    return false;
  };

  const commit = (value: string) => {
    committed.current = value;
    setCount(countExamChars(value));
  };

  // 用紙の高さを、入力した内容に合わせて伸ばします（長い文章でも紙の下で切れません）
  const grow = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(grow, [fontIdx]);

  // A4 縦の比率で、1ページの高さ（ページの区切り線の間隔）を求めます
  useLayoutEffect(() => {
    const el = paper.current;
    if (!el) return;
    const update = () => el.style.setProperty('--page-h', `${Math.round(el.clientWidth * 1.4142)}px`);
    update();
    const ro = new ResizeObserver(() => {
      update();
      grow();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const remainingMs = timeLimitSeconds === null ? null : Math.max(0, timeLimitSeconds * 1000 - now);
  const shownSec = remainingMs === null ? Math.floor(now / 1000) : Math.ceil(remainingMs / 1000);
  const mm = Math.floor(shownSec / 60);
  const ss = String(shownSec % 60).padStart(2, '0');

  return (
    <main className="exam-main">
      <div className="exam-bar" role="region" aria-label="練習の状態">
        {remainingMs === null ? (
          <span className="timer" aria-label={`経過時間 ${mm}分${ss}秒`} data-testid="exam-timer">
            経過 {mm}:{ss}
          </span>
        ) : (
          <span className="timer" aria-label={`残り時間 ${mm}分${ss}秒`} data-testid="exam-timer">
            残り {mm}:{ss}
          </span>
        )}
        <span className="exam-count" data-testid="exam-count" aria-live="off">
          入力 <strong>{count}</strong> 文字<span className="hint">（確定済み）</span>
        </span>
        <span className="hint exam-label">
          {problem.title}・{g.label}・{timeLimitSeconds === STANDARD_TIME_SECONDS ? '10分（標準）' : timeLabel(timeLimitSeconds)}・{scored ? '自動採点あり' : '採点なし'}
          {preview && '・プレビュー（記録しません）'}
        </span>
        <span className="font-tools" role="group" aria-label="文字の大きさ">
          <button type="button" className="btn btn-small" onClick={() => setFontIdx((i) => Math.max(0, i - 1))} disabled={fontIdx === 0} aria-label="文字を小さく">
            A−
          </button>
          <button type="button" className="btn btn-small" onClick={() => setFontIdx((i) => Math.min(FONT_STEPS.length - 1, i + 1))} disabled={fontIdx === FONT_STEPS.length - 1} aria-label="文字を大きく">
            A＋
          </button>
        </span>
        {phase !== 'ready' && (
          <button type="button" className="btn btn-small exam-end" onClick={() => setPhase('confirmQuit')} data-testid="exam-end">
            終了する
          </button>
        )}
      </div>

      <div className="exam-layout">
        <section className="exam-pane exam-model" aria-label="お手本">
          <div className="exam-pane-head">
            <h2>お手本</h2>
            {problem.material.kind === 'text' && (
              <p className="hint">
                画面の幅に合わせた行の折り返しは、入力しなくてかまいません。改行（Enter）が必要なのは、段落の終わり（<span className="para-mark">↵</span>）だけです。
              </p>
            )}
          </div>
          <MaterialViewer problem={problem} resolve={resolve} fontScale={fontScale} fill />
        </section>

        <section className="exam-pane exam-paper-pane" aria-label="入力用紙">
          <div className="exam-pane-head">
            <h2>入力用紙（A4）</h2>
            <p className="hint">入力中に誤りは表示しません。終わったあとで答え合わせをします。</p>
          </div>
          <div className="exam-paper" ref={paper} style={{ fontSize: `${fontScale}rem` }}>
            <textarea
              ref={area}
              className="exam-textarea"
              data-testid="exam-input"
              aria-label="入力用紙。お手本の文章を入力してください"
              lang="ja"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
              maxLength={MAX_INPUT_CHARS}
              readOnly={phase === 'ready'}
              placeholder={phase === 'ready' ? 'スタートすると、ここに入力できます' : ''}
              onPaste={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={(e) => {
                composing.current = false;
                if (overdue()) return;
                // 終了の確認を出したときに入力欄から離れて確定した変換は、確定済みの本文に入れません
                if (phaseRef.current === 'confirmQuit') return;
                commit(e.currentTarget.value);
                grow();
              }}
              onInput={(e) => {
                grow();
                if (overdue()) return;
                const native = e.nativeEvent as InputEvent;
                // 変換中の入力は確定済みの本文に入れません
                if (composing.current || native.isComposing) return;
                commit(e.currentTarget.value);
              }}
            />
          </div>
        </section>
      </div>

      {phase === 'ready' && (
        <div className="exam-ready" role="dialog" aria-modal="false" aria-labelledby="exam-ready-title">
          <h2 id="exam-ready-title">準備ができたら、スペースキーかスタートボタンでスタート</h2>
          <ul>
            <li>
              {g.label}・{timeLimitSeconds === STANDARD_TIME_SECONDS ? '10分（標準）' : timeLabel(timeLimitSeconds)}
              {timeLimitSeconds !== STANDARD_TIME_SECONDS && '（10分基準の目安達成は判定しません）'}
            </li>
            <li>{scored ? `自動採点あり：1ミスで ${g.penaltyPerError}文字を引きます。` : '採点なし：入力文字数・経過時間・入力した文章だけを表示します。'}</li>
            <li>日本語入力（IME）をオンにして、漢字に変換しながら入力してください。変換中の文字は数えません。</li>
            {preview && <li>先生のプレビューです。記録は保存しません。</li>}
          </ul>
          <button
            type="button"
            className="btn btn-primary btn-large"
            onClick={start}
            onKeyDown={(e) => {
              if (e.key === ' ') e.preventDefault();
            }}
            data-testid="exam-go"
          >
            スタート
          </button>
        </div>
      )}

      {phase === 'confirmQuit' && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="exam-quit-title">
          <div className="modal">
            <h2 id="exam-quit-title">終了しますか？</h2>
            <p>
              {timeLimitSeconds === null
                ? 'ここまでに確定した文章で答え合わせをします。'
                : '時間は止まりません。終了すると、ここまでに確定した文章で答え合わせをします（10分の計測を最後まで行わないときは、目安達成の判定はしません）。'}
            </p>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => finish('user_end')} data-testid="exam-end-confirm">
                終了して答え合わせ
              </button>
              <button
                type="button"
                className="btn btn-quiet"
                autoFocus
                onClick={() => {
                  setPhase('running');
                  window.setTimeout(() => area.current?.focus(), 0);
                }}
              >
                続ける
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
