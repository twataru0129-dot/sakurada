import type { ReactNode } from 'react';
import { APP_VERSION } from '../config';
import { useApp } from '../state/AppContext';
import { navigate } from '../state/router';

export const logoUrl = `${import.meta.env.BASE_URL}icons/logo-320.png`;
/** 入口・ホームでロゴを大きく表示するときの高解像度版（同じ元画像を縮小したもの） */
export const logoSrcSet = `${logoUrl} 320w, ${import.meta.env.BASE_URL}icons/logo-640.png 640w`;

/** 画面上部。右上に小さくバージョンを表示します（クリック不要・ほかの要素と重なりません） */
export function Header({ practicing = false }: { practicing?: boolean }) {
  const { account, logout, unsavedCount } = useApp();
  const onLogout = () => {
    if (unsavedCount > 0 && !window.confirm('保存できていない記録があります。ログアウトすると、この記録は消えます。ログアウトしますか？')) return;
    void logout(account?.kind === 'user' ? 'ログアウトしました。' : 'ゲストの練習を終了しました。');
  };
  return (
    <header className={`app-header ${practicing ? 'header-compact' : ''}`}>
      <a
        className="brand"
        href={account ? '#/home' : '#/'}
        onClick={(e) => {
          if (practicing) e.preventDefault();
        }}
        aria-label="桜打 ホームへ"
      >
        <img src={logoUrl} alt="" width={36} height={36} />
        <span className="brand-text">桜打 — SAKURA TYPE</span>
      </a>
      <span className="spacer" />
      {account && (
        <span className="who">
          {account.kind === 'guest' ? 'ゲスト' : `${account.profile.displayName}（${account.profile.loginId}）`}
        </span>
      )}
      {account && !practicing && (
        <button type="button" className="btn btn-logout" onClick={onLogout}>
          {account.kind === 'user' ? '終了してログアウト' : 'ゲストを終了'}
        </button>
      )}
      <span className="version" aria-label={`バージョン ${APP_VERSION}`}>
        v{APP_VERSION}
      </span>
    </header>
  );
}

export function IdleWarning() {
  const { idleWarning, keepAlive, account } = useApp();
  if (!idleWarning || !account) return null;
  return (
    <div className="modal-back" role="alertdialog" aria-modal="true" aria-labelledby="idle-title">
      <div className="modal">
        <h2 id="idle-title">まもなく自動的に終了します</h2>
        <p>しばらく操作がありません。あと1分ほどで{account.kind === 'user' ? 'ログアウト' : 'ゲストの練習を終了'}します。</p>
        <button type="button" className="btn btn-primary" autoFocus onClick={keepAlive}>
          続ける
        </button>
      </div>
    </div>
  );
}

export function Notice() {
  const { notice, setNotice } = useApp();
  if (!notice) return null;
  return (
    <div className="msg msg-info" role="status">
      {notice}{' '}
      <button type="button" className="btn btn-quiet btn-small" onClick={() => setNotice(null)}>
        閉じる
      </button>
    </div>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <button type="button" className="btn btn-quiet btn-small" onClick={() => navigate(to)}>
      ← {children}
    </button>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}：{checked ? 'ON' : 'OFF'}
        {hint && <span className="hint">（{hint}）</span>}
      </span>
    </label>
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
