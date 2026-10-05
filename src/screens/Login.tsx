import { useState, type FormEvent } from 'react';
import { enrollTotp, loginWithId, logoutCloud, verifyMfa, type Profile, type TotpEnrollment } from '../data/cloud';
import { useApp } from '../state/AppContext';
import { navigate } from '../state/router';
import { BackLink } from '../ui/common';

type Step =
  | { kind: 'password' }
  | { kind: 'mfa'; profile: Profile; factorId: string }
  | { kind: 'enroll'; profile: Profile; enrollment: TotpEnrollment | null };

export function Login() {
  const { startUser } = useApp();
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await loginWithId(loginId, password);
    setPassword('');
    setBusy(false);
    if (r.status === 'error') return setError(r.message);
    if (r.status === 'ok') return startUser(r.profile);
    if (r.status === 'mfa_required') return setStep({ kind: 'mfa', profile: r.profile, factorId: r.factorId });
    setStep({ kind: 'enroll', profile: r.profile, enrollment: null });
    try {
      const en = await enrollTotp();
      setStep({ kind: 'enroll', profile: r.profile, enrollment: en });
    } catch {
      setError('二段階認証の登録を始められませんでした。管理者に、Supabase の多要素認証（TOTP）が有効か確認してください。');
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (step.kind === 'password') return;
    const factorId = step.kind === 'mfa' ? step.factorId : step.enrollment?.factorId;
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const err = await verifyMfa(factorId, code);
    setBusy(false);
    setCode('');
    if (err) return setError(err);
    await startUser(step.profile);
  };

  const cancel = async () => {
    await logoutCloud();
    setStep({ kind: 'password' });
    setError(null);
    navigate('/');
  };

  return (
    <main>
      <BackLink to="/">入口にもどる</BackLink>
      <section className="panel" style={{ maxWidth: 560, margin: '16px auto' }}>
        {step.kind === 'password' && (
          <form onSubmit={submitPassword} noValidate>
            <h1>ログイン</h1>
            <p>先生からもらった ID とパスワードを入力してください。</p>
            <div className="field">
              <label htmlFor="login-id">ID（英字と数字）</label>
              <input
                id="login-id"
                type="text"
                inputMode="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="login-pw">パスワード</label>
              <input
                id="login-pw"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="msg msg-ng" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy || !loginId || !password}>
              {busy ? '確認しています…' : 'ログイン'}
            </button>
            <p className="hint" style={{ marginTop: 12 }}>
              パスワードを忘れたときは、先生に再設定をお願いしてください。何回も続けて間違えると、しばらくログインできなくなります。
            </p>
          </form>
        )}

        {step.kind !== 'password' && (
          <form onSubmit={submitCode} noValidate>
            <h1>二段階認証（先生用）</h1>
            {step.kind === 'enroll' && (
              <>
                <p>
                  先生のアカウントでは、パスワードに加えて、スマートフォンなどの認証アプリ（Google Authenticator、Microsoft Authenticator など）で作る6けたのコードが必要です。
                </p>
                <ol>
                  <li>認証アプリで、下の QR コードを読み取ります。</li>
                  <li>アプリに表示された6けたの数字を入力します。</li>
                </ol>
                {step.enrollment ? (
                  <>
                    <img src={step.enrollment.qrCode} alt="二段階認証の登録用QRコード" width={200} height={200} style={{ background: '#fff' }} />
                    <p className="hint">
                      QR コードを読み取れないときは、このキーを入力します：<span className="mono">{step.enrollment.secret}</span>
                    </p>
                  </>
                ) : (
                  <p>準備しています…</p>
                )}
              </>
            )}
            {step.kind === 'mfa' && <p>認証アプリに表示されている6けたの数字を入力してください。</p>}
            <div className="field">
              <label htmlFor="mfa-code">確認コード（6けた）</label>
              <input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
            </div>
            {error && (
              <p className="msg msg-ng" role="alert">
                {error}
              </p>
            )}
            <div className="btn-row">
              <button type="submit" className="btn btn-primary" disabled={busy || code.replace(/\s/g, '').length < 6}>
                確認する
              </button>
              <button type="button" className="btn btn-quiet" onClick={cancel}>
                やめる
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
