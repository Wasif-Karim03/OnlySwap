import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';

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

  if (state === 'loading')
    return (
      <div className="gate" aria-busy="true">
        <span className="mark lg" aria-hidden="true" />
      </div>
    );
  if (state === 'login') return <EmailLogin onDone={refresh} />;
  if (state === 'denied')
    return (
      <GateCard title="Not an admin">
        <p className="lede">This account doesn't have access to the console.</p>
        <button className="btn primary" onClick={signOut}>
          Sign out
        </button>
      </GateCard>
    );
  if (state === 'mfa') return <Mfa onDone={refresh} onSignOut={signOut} />;
  return <>{children(who!, signOut)}</>;
}

/** Centered sign-in card with the logo mark and the one line about who it's for. */
function GateCard({
  title,
  children,
  onSubmit,
}: {
  title: string;
  children: ReactNode;
  onSubmit?: (e: FormEvent) => void;
}) {
  const body = (
    <>
      <span className="mark lg" aria-hidden="true" />
      <div>
        <h1>{title}</h1>
        <p className="lede">For the OnlySwap team. Two-step sign-in required.</p>
      </div>
      {children}
    </>
  );
  return (
    <main className="gate">
      {onSubmit ? (
        <form className="gate-card" onSubmit={onSubmit}>
          {body}
        </form>
      ) : (
        <div className="gate-card">{body}</div>
      )}
    </main>
  );
}

function EmailLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <GateCard
      title="Sign in to OnlySwap admin"
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
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>
      {sent ? (
        <label className="field">
          <span>Code from your email</span>
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
      <button type="submit" className="btn primary">
        {sent ? 'Sign in' : 'Send code'}
      </button>
    </GateCard>
  );
}

function Mfa({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
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
      // A setup that was left before the first code (reload, closed tab) keeps an
      // unverified factor with the same name, and enroll refuses a duplicate name.
      for (const f of data?.all ?? []) {
        if (f.factor_type === 'totp' && f.status === 'unverified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const enrolled = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'OnlySwap admin',
      });
      if (enrolled.error) setError(errorMessage(enrolled.error));
      else {
        setFactorId(enrolled.data.id);
        setQr(enrolled.data.totp.qr_code);
        setSecret(enrolled.data.totp.secret);
      }
    })();
  }, []);

  return (
    <GateCard
      title={qr ? 'Set up two-step sign-in' : 'Two-step check'}
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
      {qr ? (
        <>
          <p className="ink2">
            Scan this with an authenticator app, then enter the 6-digit code it shows.
          </p>
          <img className="qr" src={qr} alt="QR code for your authenticator app" />
          {secret ? (
            <div className="stack tight">
              <span className="muted small">Can't scan? Type this key into the app instead:</span>
              <code className="secret" aria-label="Setup key">
                {secret}
              </code>
            </div>
          ) : null}
        </>
      ) : (
        <p className="ink2">Enter the 6-digit code from your authenticator app.</p>
      )}
      <label className="field">
        <span>Code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          required
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit" className="btn primary">
        Verify
      </button>
      <button type="button" className="btn ghost" onClick={onSignOut}>
        Sign out
      </button>
    </GateCard>
  );
}
