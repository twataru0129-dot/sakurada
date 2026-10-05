import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IDLE_LOGOUT_MS, IDLE_WARNING_MS } from '../config';
import { getClient, loadSettings, logoutCloud, saveOwnSettings, saveResult, type Profile } from '../data/cloud';
import type { PracticeConfig, PracticeResult } from '../core/result';
import { APP_DEFAULT_SETTINGS, effectiveSettings, type LearningSettings } from '../core/settings';
import { navigate } from './router';

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
  /** このログイン中（またはゲストの間）の結果。端末やクラウドには保存しません（ゲスト） */
  sessionResults: PracticeResult[];
  saves: Record<string, SaveState>;
  recordResult: (r: PracticeResult) => void;
  retrySave: (id: string) => void;
  unsavedCount: number;
  lastConfig: PracticeConfig | null;
  setLastConfig: (c: PracticeConfig) => void;
  currentResult: PracticeResult | null;
  setCurrentResult: (r: PracticeResult | null) => void;
  notice: string | null;
  setNotice: (s: string | null) => void;
  idleWarning: boolean;
  keepAlive: () => void;
}

const Ctx = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider がありません');
  return v;
}

/** 端末に残っているかもしれない一時データを消します（このアプリは保存しませんが、念のため） */
function clearLocalTraces() {
  for (const store of [safeStorage('sessionStorage'), safeStorage('localStorage')]) {
    if (!store) continue;
    try {
      for (const k of Object.keys(store)) if (k.startsWith('sakura') || k.startsWith('sb-')) store.removeItem(k);
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
  const [currentResult, setCurrentResult] = useState<PracticeResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [idleWarning, setIdleWarning] = useState(false);
  const accountRef = useRef<Account | null>(null);
  accountRef.current = account;
  const settingsTimer = useRef<number | undefined>(undefined);
  const lastActivity = useRef(Date.now());

  const resetAll = useCallback(() => {
    accountRef.current = null;
    setAccount(null);
    setSettings(APP_DEFAULT_SETTINGS);
    setSettingsSave('idle');
    setSessionResults([]);
    setSaves({});
    setLastConfig(null);
    setCurrentResult(null);
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
      if (accountRef.current?.kind === 'user') void doSave(r);
    },
    [doSave],
  );

  const retrySave = useCallback(
    (id: string) => {
      const r = sessionResults.find((x) => x.id === id);
      if (r && accountRef.current?.kind === 'user') void doSave(r);
    },
    [sessionResults, doSave],
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

  const unsavedCount = Object.values(saves).filter((s) => s !== 'saved').length;

  const value = useMemo<AppValue>(
    () => ({
      account, settings, settingsSave, updateSettings, startGuest, startUser, logout,
      sessionResults, saves, recordResult, retrySave, unsavedCount,
      lastConfig, setLastConfig, currentResult, setCurrentResult, notice, setNotice, idleWarning, keepAlive,
    }),
    [account, settings, settingsSave, updateSettings, startGuest, startUser, logout, sessionResults, saves, recordResult, retrySave, unsavedCount, lastConfig, currentResult, notice, idleWarning, keepAlive],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
