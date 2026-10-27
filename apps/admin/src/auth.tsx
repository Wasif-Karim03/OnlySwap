import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { errorMessage, gate, sessionExpired, type Whoami } from './logic';
import { rpc, supabase } from './supabase';
import { Button, Field } from './ui';

const SIGNED_IN_AT = 'onlyswap-admin-signed-in-at';
/** The loading line waits like the skeleton (tokens.json motion.skeleton.delay). */
const CHECKING_DELAY_MS = 300;
/** After this long the loading screen offers a reload. */
const SLOW_AFTER_MS = 10_000;
const CODE_LENGTH = 6;

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

  if (state === 'loading') return <GateLoading />;
  if (state === 'login') return <EmailLogin onDone={refresh} />;
  if (state === 'denied')
    return (
      <GateCard title="No access">
        <p className="lede">
          This account is not on the admin list. Ask an owner to add you, or sign in with another
          account.
        </p>
        <Button variant="primary" onClick={signOut}>
          Sign out
        </Button>
      </GateCard>
    );
  if (state === 'mfa') return <Mfa onDone={refresh} onSignOut={signOut} />;
  return <>{children(who!, signOut)}</>;
}

/** The logo mark, then "Checking your session" after 300 ms and a reload offer after 10 s. */
function GateLoading() {
  const [phase, setPhase] = useState<'quiet' | 'checking' | 'slow'>('quiet');
  useEffect(() => {
    const checking = setTimeout(() => setPhase('checking'), CHECKING_DELAY_MS);
    const slow = setTimeout(() => setPhase('slow'), SLOW_AFTER_MS);
    return () => {
      clearTimeout(checking);
      clearTimeout(slow);
    };
  }, []);
  return (
    <div className="gate" aria-busy="true">
      <div className="gate-wait" role="status">
        <span className="mark lg" aria-hidden="true" />
        {phase !== 'quiet' ? <p className="ink2 fade-in">Checking your session</p> : null}
        {phase === 'slow' ? (
          <>
            <p className="muted fade-in">This is taking longer than usual.</p>
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Centered sign-in card: logo mark, one title, at most one line of help. */
function GateCard({
  title,
  lede,
  children,
  onSubmit,
}: {
  title: string;
  lede?: string;
  children: ReactNode;
  onSubmit?: (e: FormEvent) => void;
}) {
  const body = (
    <>
      <span className="mark lg" aria-hidden="true" />
      <div className="stack tight">
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
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
        localStorage.setItem(SIGNED_IN_AT, String(Date.now()));
        onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  const changeEmail = () => {
    setSent(false);
    setCode('');
    setError(null);
  };

  return (
    <GateCard title="Sign in" lede={sent ? undefined : 'For the OnlySwap team.'} onSubmit={submit}>
      {sent ? (
        <div className="row">
          <p className="ink2 grow-text">We sent a code to {email}.</p>
          <Button variant="ghost" size="sm" onClick={changeEmail}>
            Change
          </Button>
        </div>
      ) : (
        <Field label="Email" error={error}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            aria-invalid={error ? true : undefined}
          />
        </Field>
      )}
      {sent ? (
        <Field label="Code" error={error}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            aria-invalid={error ? true : undefined}
          />
        </Field>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        pending={busy}
        pendingLabel={sent ? 'Signing in…' : 'Sending…'}
      >
        {sent ? 'Sign in' : 'Send code'}
      </Button>
    </GateCard>
  );
}

function Mfa({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!factorId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ch = await supabase.auth.mfa.challenge({ factorId });
      if (ch.error) {
        setError(errorMessage(ch.error));
        setCode('');
        return;
      }
      const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
      if (v.error) {
        setError(errorMessage(v.error));
        setCode('');
      } else onDone();
    } finally {
      setBusy(false);
    }
  };

  const copyKey = () => {
    if (!secret) return;
    navigator.clipboard
      .writeText(secret)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  const preparing = !factorId && !error;

  return (
    <GateCard title="Two-step sign-in" onSubmit={submit}>
      {preparing ? (
        <p className="ink2" role="status">
          Preparing your setup code…
        </p>
      ) : null}
      {qr ? (
        <>
          <p className="ink2">
            Scan this code with an authenticator app, then enter the 6-digit code.
          </p>
          <img className="qr" src={qr} alt="QR code for your authenticator app" />
          {secret ? (
            <div className="stack tight">
              <span className="muted small">Can't scan? Enter this key instead.</span>
              <div className="row secret-row">
                <code className="secret" aria-label="Setup key">
                  {secret}
                </code>
                <Button variant="ghost" size="sm" onClick={copyKey}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : factorId ? (
        <p className="ink2">Enter the 6-digit code from your authenticator app.</p>
      ) : null}
      <Field label="Code" error={error}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={CODE_LENGTH}
          autoComplete="one-time-code"
          autoFocus
          required
          aria-invalid={error ? true : undefined}
        />
      </Field>
      <Button
        type="submit"
        variant="primary"
        disabled={!factorId}
        pending={busy}
        pendingLabel="Checking…"
      >
        Verify
      </Button>
      <Button variant="ghost" onClick={onSignOut}>
        Sign out
      </Button>
    </GateCard>
  );
}
