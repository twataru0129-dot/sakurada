/**
 * 桜ガーデンの記録の読み込み・保存・同期。
 *
 * - ゲスト：この端末（localStorage）に保存します。クラウドには送りません。
 * - ログイン利用者：アカウント（クラウド）に保存します。送れなかった出来事はこの画面を開いている間だけ覚えて再送します。
 *   失敗してもゲストの保存場所には切り替えません。ログアウト・アカウントの切り替えで記録は混ざりません
 *   （利用者が変わると、読み込んだ記録・送っていない記録を消してから読み込み直します）。
 * - 出来事には ID があり、同じ ID は一度しか数えないため、再送・同期で二重になりません（state.ts）。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from './AppContext';
import { CloudTableMissingError, fetchGardenEvents, saveGardenEvents } from '../data/cloud';
import { appendGuestGarden, loadGuestGarden } from '../data/guestGarden';
import { foldEvents, mergeEvents, newId, type GardenEvent, type GardenEventType, type GardenState } from '../core/garden/state';

export type GardenLoad = 'loading' | 'ready' | 'error';
/** 保存の状態：ゲストは端末への保存、ログイン利用者はアカウントへの同期 */
export type GardenSave = 'idle' | 'saving' | 'saved' | 'failed';
export type GardenFailure = 'missing_table' | 'network' | 'device' | 'incompatible' | null;

interface GardenValue {
  load: GardenLoad;
  failure: GardenFailure;
  save: GardenSave;
  /** ゲストか（端末だけに保存） */
  local: boolean;
  state: GardenState;
  /** 出来事を反映して保存します。反映できない（条件を満たさない・同じ ID がある）ときは false */
  act: (type: GardenEventType, data?: Record<string, unknown>, id?: string) => boolean;
  /** その出来事を反映できるか（保存しません） */
  canAct: (type: GardenEventType, data?: Record<string, unknown>) => boolean;
  retry: () => void;
  reload: () => void;
  /** 桜ガーデンの画面を開いたときに呼びます（それまでは記録を読み込みません） */
  open: () => void;
}

const Ctx = createContext<GardenValue | null>(null);

export function useGarden(): GardenValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('GardenProvider がありません');
  return v;
}

export function GardenProvider({ children }: { children: ReactNode }) {
  const { account, reportGardenUnsaved } = useApp();
  const owner = account ? (account.kind === 'guest' ? 'guest' : `user:${account.profile.id}`) : null;
  const userId = account?.kind === 'user' ? account.profile.id : null;
  const [events, setEvents] = useState<GardenEvent[]>([]);
  const [load, setLoad] = useState<GardenLoad>('loading');
  const [failure, setFailure] = useState<GardenFailure>(null);
  const [save, setSave] = useState<GardenSave>('idle');
  const [reloadKey, setReloadKey] = useState(0);
  /** 桜ガーデンを開いたか（開くまでは記録を読み込みません。ログインのたびに通信しないため） */
  const [wanted, setWanted] = useState(false);
  const eventsRef = useRef<GardenEvent[]>([]);
  eventsRef.current = events;
  /** まだアカウントに送れていない出来事（ログイン利用者だけ） */
  const pending = useRef<GardenEvent[]>([]);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const sending = useRef(false);

  // 利用者が変わったら、前の利用者の記録を消してから読み込み直します
  const loadedOwner = useRef<string | null>(null);
  useEffect(() => {
    if (loadedOwner.current !== owner) {
      loadedOwner.current = owner;
      pending.current = [];
      eventsRef.current = [];
      setEvents([]);
      setSave('idle');
      setWanted(false);
      reportGardenUnsaved(false);
      return;
    }
    setFailure(null);
    if (!owner || !wanted) return;
    setLoad('loading');
    if (owner === 'guest') {
      const r = loadGuestGarden();
      setEvents(r.events);
      if (r.incompatible) setFailure('incompatible');
      else if (r.unavailable) setFailure('device');
      setLoad(r.incompatible ? 'error' : 'ready');
      return;
    }
    let alive = true;
    fetchGardenEvents(userId!)
      .then((list) => {
        if (!alive || ownerRef.current !== owner) return;
        setEvents(mergeEvents(list, pending.current));
        setLoad('ready');
      })
      .catch((e: unknown) => {
        if (!alive || ownerRef.current !== owner) return;
        setFailure(e instanceof CloudTableMissingError ? 'missing_table' : 'network');
        setLoad('error');
      });
    return () => {
      alive = false;
    };
  }, [owner, userId, reloadKey, wanted, reportGardenUnsaved]);

  const flush = useCallback(async () => {
    if (!userId || sending.current || pending.current.length === 0) return;
    const who = ownerRef.current;
    const batch = [...pending.current];
    sending.current = true;
    setSave('saving');
    try {
      await saveGardenEvents(userId, batch);
      if (ownerRef.current !== who) return;
      const sent = new Set(batch.map((e) => e.id));
      pending.current = pending.current.filter((e) => !sent.has(e.id));
      setFailure(null);
      setSave(pending.current.length ? 'failed' : 'saved');
      reportGardenUnsaved(pending.current.length > 0);
    } catch (e) {
      if (ownerRef.current !== who) return;
      setFailure(e instanceof CloudTableMissingError ? 'missing_table' : 'network');
      setSave('failed');
      reportGardenUnsaved(true);
    } finally {
      sending.current = false;
      // 送っている間に増えた分も送ります
      if (ownerRef.current === who && pending.current.some((e) => !batch.includes(e))) void flush();
    }
  }, [userId, reportGardenUnsaved]);

  const state = useMemo(() => foldEvents(events), [events]);

  const build = (type: GardenEventType, data: Record<string, unknown>, id?: string): GardenEvent => {
    const last = eventsRef.current.reduce((m, e) => Math.max(m, e.at), 0);
    return { id: id ?? newId(type), at: Math.max(Date.now(), last + 1), type, data };
  };

  const canAct = useCallback((type: GardenEventType, data: Record<string, unknown> = {}) => {
    const e = build(type, data, '__check__');
    const next = foldEvents([...eventsRef.current, e]);
    return next.rejected === foldEvents(eventsRef.current).rejected;
  }, []);

  const act = useCallback(
    (type: GardenEventType, data: Record<string, unknown> = {}, id?: string) => {
      if (!ownerRef.current || load !== 'ready') return false;
      const cur = eventsRef.current;
      if (id && cur.some((e) => e.id === id)) return false;
      const e = build(type, data, id);
      const before = foldEvents(cur);
      const after = foldEvents([...cur, e]);
      if (after.rejected !== before.rejected) return false;
      const next = [...cur, e];
      eventsRef.current = next;
      setEvents(next);
      if (ownerRef.current === 'guest') {
        const ok = appendGuestGarden([e]);
        setSave(ok ? 'saved' : 'failed');
        setFailure(ok ? null : 'device');
      } else {
        pending.current.push(e);
        reportGardenUnsaved(true);
        void flush();
      }
      return true;
    },
    [flush, load, reportGardenUnsaved],
  );

  const retry = useCallback(() => {
    if (ownerRef.current === 'guest') {
      const ok = appendGuestGarden(eventsRef.current);
      setSave(ok ? 'saved' : 'failed');
      setFailure(ok ? null : 'device');
    } else void flush();
  }, [flush]);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);
  const open = useCallback(() => setWanted(true), []);

  const value = useMemo<GardenValue>(
    () => ({ load, failure, save, local: owner === 'guest', state, act, canAct, retry, reload, open }),
    [load, failure, save, owner, state, act, canAct, retry, reload, open],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
