import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IDLE_LOGOUT_MS, IDLE_WARNING_MS } from '../config';
import { CloudTableMissingError, getClient, loadSettings, logoutCloud, saveExamResult, saveGameResult, saveOwnSettings, saveResult, type Profile } from '../data/cloud';
import type { PracticeConfig, PracticeResult } from '../core/result';
import { APP_DEFAULT_SETTINGS, effectiveSettings, type LearningSettings } from '../core/settings';
import { navigate } from './router';
import { GUEST_HISTORY_KEY, saveGuestRecord } from '../data/guestHistory';
import { recordFromResult } from '../core/history';
import type { ExamProblem } from '../core/exam';
import type { ExamOutcome } from '../core/examResult';
import { GUEST_EXAM_HISTORY_KEY, saveGuestExamRecord } from '../data/guestExamHistory';
import { GUEST_GAME_BESTS_KEY, GUEST_GAME_HISTORY_KEY, saveGuestGameResult } from '../data/guestGameHistory';
import { GUEST_GARDEN_KEY } from '../data/guestGarden';
import type { GameResult } from '../core/game/result';
import type { CourseId } from '../core/game/sakurada';

/** ゲームで始めるプレイ（コース。物語は開始時に1回だけ選びます） */
export interface GameSession {
  courseId: CourseId;
  storyId: string;
  inputMethod: 'keyboard' | 'touch';
}

/** 保存できなかった理由（画面の表示を分けるため） */
export type SaveFailure = 'missing_table' | 'network' | 'device';

/** 検定モードで始める練習（問題・時間・プレビューか） */
export interface ExamSession {
  problem: ExamProblem;
  timeLimitSeconds: number | null;
  /** 先生の「生徒用プレビュー」。記録は保存しません */
  preview: boolean;
}

export type Account = { kind: 'guest' } | { kind: 'user'; profile: Profile };
export type SaveState = 'saving' | 'saved' | 'failed';

interface AppValue {
  account: Account | null;
  settings: LearningSettings;
  settingsSave: 'idle' | 'saving' | 'saved' | 'failed';
  updateSettings: (patch: Partial<LearningSettings>) => void;
  startGuest: () => void;
  startUser: (profile: Profile) => Promise<void>;
  logout: (message?: string) => Promise<void>;
  /** このログイン中（またはゲストの間）の結果（画面表示用。保存は doSave でゲストは端末、ログイン利用者はクラウドへ） */
  sessionResults: PracticeResult[];
  saves: Record<string, SaveState>;
  recordResult: (r: PracticeResult) => void;
  retrySave: (id: string) => void;
  unsavedCount: number;
  lastConfig: PracticeConfig | null;
  setLastConfig: (c: PracticeConfig) => void;
  currentResult: PracticeResult | null;
  setCurrentResult: (r: PracticeResult | null) => void;
  historyFocus: string | null;
  setHistoryFocus: (key: string | null) => void;
  examSession: ExamSession | null;
  setExamSession: (s: ExamSession | null) => void;
  /** このログイン中（またはゲストの間）の検定モードの結果 */
  examOutcomes: ExamOutcome[];
  currentExam: ExamOutcome | null;
  recordExam: (o: ExamOutcome) => void;
  retryExamSave: (id: string) => void;
  gameSession: GameSession | null;
  setGameSession: (s: GameSession | null) => void;
  /** このログイン中（またはゲストの間）のゲームの結果。保存できなかった記録もここに残し、再送できます */
  gameResults: GameResult[];
  currentGame: GameResult | null;
  recordGame: (r: GameResult) => void;
  retryGameSave: (id: string) => void;
  /** 桜ガーデンの、まだアカウントに保存できていない変更の有無（ログアウト前の確認に使います） */
  reportGardenUnsaved: (unsaved: boolean) => void;
  saveFailures: Record<string, SaveFailure>;
  notice: string | null;
  setNotice: (s: string | null) => void;
  idleWarning: boolean;
  keepAlive: () => void;
}

const Ctx = createContext<AppValue | null>(null);
/** 保存の状態の一覧（saves）の中で、桜ガーデンの未送信を表す項目 */
const GARDEN_SAVE_KEY = 'garden-sync';

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider がありません');
  return v;
}

/**
 * 端末に残っているかもしれない一時データ（ログインの情報など）を消します。
 * ゲストの練習記録（GUEST_HISTORY_KEY）は、ゲストを終了しても残す仕様のため消しません。
 */
function clearLocalTraces() {
  for (const store of [safeStorage('sessionStorage'), safeStorage('localStorage')]) {
    if (!store) continue;
    try {
      for (const k of Object.keys(store)) {
        if (k === GUEST_HISTORY_KEY || k === GUEST_EXAM_HISTORY_KEY || k === GUEST_GAME_HISTORY_KEY || k === GUEST_GAME_BESTS_KEY || k === GUEST_GARDEN_KEY) continue;
        if (k.startsWith('sakura') || k.startsWith('sb-')) store.removeItem(k);
      }
    } catch {
      /* 使えない環境では何もしません */
    }
  }
}

function safeStorage(name: 'sessionStorage' | 'localStorage'): Storage | null {
  try {
    return window[name];
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [settings, setSettings] = useState<LearningSettings>(APP_DEFAULT_SETTINGS);
  const [settingsSave, setSettingsSave] = useState<AppValue['settingsSave']>('idle');
  const [sessionResults, setSessionResults] = useState<PracticeResult[]>([]);
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  const [lastConfig, setLastConfig] = useState<PracticeConfig | null>(null);
  /** 「練習の記録」を開いたときに最初に選ぶ条件（結果画面から開いたときは今回の条件） */
  const [historyFocus, setHistoryFocus] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<PracticeResult | null>(null);
  const [examSession, setExamSession] = useState<ExamSession | null>(null);
  const [examOutcomes, setExamOutcomes] = useState<ExamOutcome[]>([]);
  const [currentExam, setCurrentExam] = useState<ExamOutcome | null>(null);
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [currentGame, setCurrentGame] = useState<GameResult | null>(null);
  const [saveFailures, setSaveFailures] = useState<Record<string, SaveFailure>>({});
  const gameIds = useRef(new Set<string>());
  const [notice, setNotice] = useState<string | null>(null);
  const [idleWarning, setIdleWarning] = useState(false);
  const accountRef = useRef<Account | null>(null);
  accountRef.current = account;
  const settingsTimer = useRef<number | undefined>(undefined);
  const lastActivity = useRef(Date.now());
  const examIds = useRef(new Set<string>());

  const resetAll = useCallback(() => {
    accountRef.current = null;
    setAccount(null);
    setSettings(APP_DEFAULT_SETTINGS);
    setSettingsSave('idle');
    setSessionResults([]);
    setSaves({});
    setLastConfig(null);
    setCurrentResult(null);
    setHistoryFocus(null);
    setExamSession(null);
    setExamOutcomes([]);
    setCurrentExam(null);
    examIds.current = new Set();
    setGameSession(null);
    setGameResults([]);
    setCurrentGame(null);
    setSaveFailures({});
    gameIds.current = new Set();
    setIdleWarning(false);
    window.clearTimeout(settingsTimer.current);
    clearLocalTraces();
  }, []);

  const logout = useCallback(
    async (message?: string) => {
      const wasUser = accountRef.current?.kind === 'user';
      resetAll();
      if (wasUser) await logoutCloud();
      setNotice(message ?? null);
      navigate('/');
    },
    [resetAll],
  );

  const startGuest = useCallback(() => {
    resetAll();
    setAccount({ kind: 'guest' });
    lastActivity.current = Date.now();
    navigate('/home');
  }, [resetAll]);

  const startUser = useCallback(async (profile: Profile) => {
    setAccount({ kind: 'user', profile });
    lastActivity.current = Date.now();
    try {
      const { own, defaults } = await loadSettings(profile.id);
      setSettings(effectiveSettings(defaults, own));
    } catch {
      setSettings(APP_DEFAULT_SETTINGS);
      setNotice('設定を読み込めませんでした。初期設定で練習できます。');
    }
    navigate(profile.role === 'teacher' ? '/teacher' : '/home');
  }, []);

  const updateSettings = useCallback((patch: Partial<LearningSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      const acc = accountRef.current;
      if (acc?.kind === 'user') {
        window.clearTimeout(settingsTimer.current);
        setSettingsSave('saving');
        settingsTimer.current = window.setTimeout(async () => {
          const ok = await saveOwnSettings(acc.profile.id, next).catch(() => false);
          if (accountRef.current?.kind === 'user') setSettingsSave(ok ? 'saved' : 'failed');
        }, 600);
      }
      return next;
    });
  }, []);

  const doSave = useCallback(async (r: PracticeResult) => {
    // ゲスト：この端末（localStorage）に保存します。クラウドには送りません
    if (accountRef.current?.kind === 'guest') {
      const outcome = saveGuestRecord(recordFromResult(r));
      setSaves((s) => ({ ...s, [r.id]: outcome === 'failed' ? 'failed' : 'saved' }));
      return;
    }
    // ログイン利用者：アカウント（クラウド）に保存します。失敗してもゲストの保存場所には切り替えません
    setSaves((s) => ({ ...s, [r.id]: 'saving' }));
    try {
      await saveResult(r);
      if (accountRef.current?.kind === 'user') setSaves((s) => ({ ...s, [r.id]: 'saved' }));
    } catch {
      if (accountRef.current?.kind === 'user') setSaves((s) => ({ ...s, [r.id]: 'failed' }));
    }
  }, []);

  const recordResult = useCallback(
    (r: PracticeResult) => {
      setSessionResults((list) => [r, ...list.filter((x) => x.id !== r.id)]);
      setCurrentResult(r);
      if (accountRef.current) void doSave(r);
    },
    [doSave],
  );

  const retrySave = useCallback(
    (id: string) => {
      const r = sessionResults.find((x) => x.id === id);
      if (r && accountRef.current) void doSave(r);
    },
    [sessionResults, doSave],
  );

  // 検定モードの記録：ゲストはこの端末、ログイン利用者はアカウント（クラウド）。タイピングの記録とは別に保存します
  const doSaveExam = useCallback(async (o: ExamOutcome) => {
    const id = o.record.id;
    if (o.preview) return;
    if (accountRef.current?.kind === 'guest') {
      const outcome = saveGuestExamRecord(o.record);
      setSaves((s) => ({ ...s, [id]: outcome === 'failed' ? 'failed' : 'saved' }));
      return;
    }
    setSaves((s) => ({ ...s, [id]: 'saving' }));
    try {
      await saveExamResult(o.record);
      if (accountRef.current?.kind === 'user') setSaves((s) => ({ ...s, [id]: 'saved' }));
    } catch {
      if (accountRef.current?.kind === 'user') setSaves((s) => ({ ...s, [id]: 'failed' }));
    }
  }, []);

  const recordExam = useCallback(
    (o: ExamOutcome) => {
      // 同じ記録 ID の結果は一度だけ扱います（終了ボタンの連打などで二重に保存しません）
      if (examIds.current.has(o.record.id)) return;
      examIds.current.add(o.record.id);
      setCurrentExam(o);
      setExamOutcomes((list) => [o, ...list]);
      if (accountRef.current) void doSaveExam(o);
    },
    [doSaveExam],
  );

  const retryExamSave = useCallback(
    (id: string) => {
      const o = examOutcomes.find((x) => x.record.id === id);
      if (o && accountRef.current) void doSaveExam(o);
    },
    [examOutcomes, doSaveExam],
  );

  // ゲームの記録：ゲストはこの端末、ログイン利用者はアカウント（クラウド）。失敗してもゲストの保存場所には切り替えません
  const doSaveGame = useCallback(async (r: GameResult) => {
    const fail = (why: SaveFailure) => {
      setSaves((s) => ({ ...s, [r.id]: 'failed' }));
      setSaveFailures((f) => ({ ...f, [r.id]: why }));
    };
    if (accountRef.current?.kind === 'guest') {
      const outcome = saveGuestGameResult(r);
      if (outcome === 'failed') fail('device');
      else setSaves((s) => ({ ...s, [r.id]: 'saved' }));
      return;
    }
    const owner = accountRef.current?.kind === 'user' ? accountRef.current.profile.id : null;
    setSaves((s) => ({ ...s, [r.id]: 'saving' }));
    try {
      await saveGameResult(r);
      // 送っている間に別のアカウントに変わっていたら、表示を更新しません（記録は送った本人の分です）
      if (accountRef.current?.kind === 'user' && accountRef.current.profile.id === owner) setSaves((s) => ({ ...s, [r.id]: 'saved' }));
    } catch (e) {
      if (accountRef.current?.kind === 'user' && accountRef.current.profile.id === owner) fail(e instanceof CloudTableMissingError ? 'missing_table' : 'network');
    }
  }, []);

  const recordGame = useCallback(
    (r: GameResult) => {
      // 1回のプレイ（同じ ID）は1回だけ保存します
      if (gameIds.current.has(r.id)) return;
      gameIds.current.add(r.id);
      setCurrentGame(r);
      setGameResults((list) => [r, ...list]);
      if (accountRef.current) void doSaveGame(r);
    },
    [doSaveGame],
  );

  const retryGameSave = useCallback(
    (id: string) => {
      const r = gameResults.find((x) => x.id === id);
      if (r && accountRef.current) void doSaveGame(r);
    },
    [gameResults, doSaveGame],
  );

  // 認証基盤側でセッションが終わったとき（停止・期限切れなど）は入口に戻ります
  useEffect(() => {
    const c = getClient();
    if (!c) return;
    const { data } = c.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && accountRef.current?.kind === 'user') {
        resetAll();
        setNotice('ログインの有効期限が切れたか、アカウントが使えなくなりました。もう一度ログインしてください。');
        navigate('/');
      }
    });
    return () => data.subscription.unsubscribe();
  }, [resetAll]);

  // 無操作 15 分で自動ログアウト（練習中のキー操作・入力も操作として扱います）
  useEffect(() => {
    if (!account) return;
    const mark = () => {
      lastActivity.current = Date.now();
    };
    const events = ['keydown', 'pointerdown', 'input', 'compositionupdate', 'touchstart', 'wheel'] as const;
    for (const e of events) window.addEventListener(e, mark, { capture: true, passive: true });
    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_LOGOUT_MS) {
        void logout(
          accountRef.current?.kind === 'user'
            ? '15分間操作がなかったため、自動的にログアウトしました。'
            : '15分間操作がなかったため、ゲストの練習を終了しました。',
        );
      } else {
        setIdleWarning(idle >= IDLE_WARNING_MS);
      }
    }, 5000);
    return () => {
      for (const e of events) window.removeEventListener(e, mark, { capture: true });
      window.clearInterval(timer);
    };
  }, [account, logout]);

  const keepAlive = useCallback(() => {
    lastActivity.current = Date.now();
    setIdleWarning(false);
  }, []);

  const reportGardenUnsaved = useCallback((unsaved: boolean) => {
    setSaves((s) => (s[GARDEN_SAVE_KEY] === (unsaved ? 'failed' : 'saved') ? s : { ...s, [GARDEN_SAVE_KEY]: unsaved ? 'failed' : 'saved' }));
  }, []);

  const unsavedCount = Object.values(saves).filter((s) => s !== 'saved').length;

  const value = useMemo<AppValue>(
    () => ({
      account, settings, settingsSave, updateSettings, startGuest, startUser, logout,
      sessionResults, saves, recordResult, retrySave, unsavedCount,
      lastConfig, setLastConfig, currentResult, setCurrentResult, historyFocus, setHistoryFocus, notice, setNotice, idleWarning, keepAlive,
      examSession, setExamSession, examOutcomes, currentExam, recordExam, retryExamSave,
      gameSession, setGameSession, gameResults, currentGame, recordGame, retryGameSave, saveFailures, reportGardenUnsaved,
    }),
    [gameSession, gameResults, currentGame, recordGame, retryGameSave, saveFailures, reportGardenUnsaved, examSession, examOutcomes, currentExam, recordExam, retryExamSave, historyFocus, account, settings, settingsSave, updateSettings, startGuest, startUser, logout, sessionResults, saves, recordResult, retrySave, unsavedCount, lastConfig, currentResult, notice, idleWarning, keepAlive],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
