import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { errorMessage, gate, sessionExpired, type Whoami } from './logic';
import { rpc, supabase } from './supabase';

const SIGNED_IN_AT = 'onlyswap-admin-signed-in-at';

/**
 * G-LOGIN (P12-ADM-02): email code, then TOTP (enroll the first time), then
 * `requireAdmin` via admin_whoami; sessions end after 8 hours.
 */
export function AdminGate({
  children,
}: {
  children: (who: Whoami, signOut: () => void) => ReactNode;
}) {
  const [state, setState] = useState<'loading' | 'login' | 'denied' | 'mfa' | 'ok'>('loading');
  const [who, setWho] = useState<Whoami | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const at = Number(localStorage.getItem(SIGNED_IN_AT)) || null;
    if (data.session && sessionExpired(at, Date.now())) {
      await supabase.auth.signOut();
      localStorage.removeItem(SIGNED_IN_AT);
      setState('login');
      return;
    }
    const w = data.session ? await rpc<Whoami>('admin_whoami').catch(() => null) : null;
    setWho(w);
    setState(gate(!!data.session, w));
  }, []);

  useEffect(() => {
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    const t = setInterval(() => void refresh(), 60_000);
    return () => {
      data.subscription.unsubscribe();
      clearInterval(t);
    };
  }, [refresh]);

  const signOut = () => {
    localStorage.removeItem(SIGNED_IN_AT);
    void supabase.auth.signOut().then(refresh);
  };

  if (state === 'loading') return <p className="pad">Loading…</p>;
  if (state === 'login') return <EmailLogin onDone={refresh} />;
  if (state === 'denied')
    return (
      <div className="pad">
        <h1>Not an admin</h1>
        <p>This account doesn't have admin access.</p>
        <button onClick={signOut}>Sign out</button>
      </div>
    );
  if (state === 'mfa') return <Mfa onDone={refresh} onSignOut={signOut} />;
  return <>{children(who!, signOut)}</>;
}

function EmailLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card login"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (!sent) {
          const { error: err } = await supabase.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: false },
          });
          if (err) setError(errorMessage(err));
          else setSent(true);
          return;
        }
        const { error: err } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
        if (err) setError(errorMessage(err));
        else {
          localStorage.setItem('onlyswap-admin-signed-in-at', String(Date.now()));
          onDone();
        }
      }}
    >
      <h1>OnlySwap admin</h1>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>
      {sent ? (
        <label>
          Code from your email
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        </label>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <button type="submit">{sent ? 'Sign in' : 'Send code'}</button>
    </form>
  );
}

function Mfa({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp.find((f) => f.status === 'verified');
      if (totp) {
        setFactorId(totp.id);
        return;
      }
      const enrolled = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'OnlySwap admin',
      });
      if (enrolled.error) setError(errorMessage(enrolled.error));
      else {
        setFactorId(enrolled.data.id);
        setQr(enrolled.data.totp.qr_code);
      }
    })();
  }, []);

  return (
    <form
      className="card login"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!factorId) return;
        const ch = await supabase.auth.mfa.challenge({ factorId });
        if (ch.error) return setError(errorMessage(ch.error));
        const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
        if (v.error) setError(errorMessage(v.error));
        else onDone();
      }}
    >
      <h1>Two-step check</h1>
      {qr ? (
        <>
          <p>Scan this with an authenticator app, then enter the 6-digit code.</p>
          <img src={qr} alt="Authenticator QR code" width={180} height={180} />
        </>
      ) : (
        <p>Enter the 6-digit code from your authenticator app.</p>
      )}
      <label>
        Code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          required
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit">Verify</button>
      <button type="button" className="link" onClick={onSignOut}>
        Sign out
      </button>
    </form>
  );
}
