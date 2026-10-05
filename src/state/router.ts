import { useEffect, useState } from 'react';

/**
 * 画面の切り替えは URL のハッシュ（例: #/home）で行います。
 * サブディレクトリに置いても、サーバー側の設定なしで動きます。
 */
export function navigate(path: string): void {
  const target = `#${path}`;
  if (window.location.hash !== target) window.location.hash = target;
  else window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const on = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}
