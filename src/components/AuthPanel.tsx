import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, KeyRound, Loader2, LogIn, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { SUPABASE_NOT_CONFIGURED_HINT, resolveSupabaseConfig } from '../lib/supabaseConfig';
import { supabaseAuthGateway } from '../lib/supabase';
import {
  requestPasswordReset,
  restoreSession,
  signInWithPassword,
  signOutSession,
  signUpWithPassword,
  type AuthOutcome,
  type AuthUser
} from '../lib/authSession';

/**
 * Supabase Auth panel (TASK 11).
 *
 * Registration, sign-in, sign-out, session restoration and password reset all
 * happen here, in the browser, against Supabase Auth directly. The API never
 * sees a password; it only verifies the resulting access token.
 *
 * Every state is displayed literally: no form claims success without a session,
 * and an unconfigured build shows the missing variables instead of a dead form.
 */

interface AuthPanelProps {
  /** Called when the session appears or disappears, so callers can reload. */
  onSessionChange?: (signedIn: boolean) => void;
}

type Mode = 'signin' | 'register' | 'reset';
type Notice = { kind: 'ok' | 'error' | 'info'; message: string } | null;

function currentOrigin(): string {
  try {
    const location = (globalThis as { location?: { origin?: string } }).location;
    return location?.origin ?? '';
  } catch {
    return '';
  }
}

const inputClass =
  'w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors';

export function AuthPanel({ onSessionChange }: AuthPanelProps) {
  const config = resolveSupabaseConfig();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // Keep the newest callback without re-running the restore effect.
  const onSessionChangeRef = useRef(onSessionChange);
  useEffect(() => {
    onSessionChangeRef.current = onSessionChange;
  }, [onSessionChange]);

  useEffect(() => {
    let cancelled = false;
    void restoreSession(supabaseAuthGateway()).then((outcome) => {
      if (cancelled) return;
      setRestoring(false);
      if (outcome.kind === 'authenticated') {
        setUser(outcome.user);
        onSessionChangeRef.current?.(true);
      } else if (outcome.kind === 'error') {
        setNotice({ kind: 'error', message: outcome.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyAuthenticated = (nextUser: AuthUser, message: string) => {
    setUser(nextUser);
    setPassword('');
    setNotice({ kind: 'ok', message });
    onSessionChangeRef.current?.(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    const gateway = supabaseAuthGateway();
    setBusy(true);

    let outcome: AuthOutcome;
    if (mode === 'signin') {
      outcome = await signInWithPassword(gateway, { email, password });
    } else if (mode === 'register') {
      outcome = await signUpWithPassword(gateway, { email, password });
    } else {
      const redirectTo = `${currentOrigin()}/`;
      outcome = await requestPasswordReset(gateway, email, redirectTo);
    }

    setBusy(false);

    switch (outcome.kind) {
      case 'authenticated':
        applyAuthenticated(outcome.user, 'Signed in. The shared API now receives this session’s access token.');
        return;
      case 'confirmation_required':
        setPassword('');
        setNotice({
          kind: 'info',
          message:
            `Check ${outcome.email} for a confirmation link. This project requires email confirmation, ` +
            'so no session exists until that link is opened. If the address already had an account, no new one was created.'
        });
        return;
      case 'reset_sent':
        setNotice({
          kind: 'info',
          message: `If ${outcome.email} has an account, Supabase emailed a password-reset link. Open it on this origin to set a new password.`
        });
        return;
      case 'invalid_input':
        setNotice({ kind: 'error', message: outcome.message });
        return;
      case 'error':
        setNotice({ kind: 'error', message: outcome.message });
        return;
      default:
        setNotice({ kind: 'error', message: 'The request did not complete.' });
    }
  };

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    const outcome = await signOutSession(supabaseAuthGateway());
    setBusy(false);
    if (outcome.kind === 'error') {
      setNotice({ kind: 'error', message: outcome.message });
      return;
    }
    setUser(null);
    setPassword('');
    setNotice({ kind: 'info', message: 'Signed out. The shared API is unavailable until you sign in again.' });
    onSessionChangeRef.current?.(false);
  };

  if (config.kind !== 'configured') {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200" role="status">
        <p className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {config.kind === 'not_configured' ? (
              <>
                Authentication is not configured for this build. Missing:{' '}
                <span className="font-mono">{config.missing.join(', ')}</span>.
              </>
            ) : (
              config.reason
            )}
            <span className="block mt-1 text-amber-200/70">{SUPABASE_NOT_CONFIGURED_HINT}</span>
          </span>
        </p>
      </div>
    );
  }

  if (restoring) {
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
        Checking your Supabase session…
      </p>
    );
  }

  if (user) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" role="status">
        <p className="flex items-start gap-2 text-xs text-emerald-300">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Signed in with Supabase Auth as{' '}
            <span className="font-mono">{user.email ?? user.id}</span>. Requests to the shared API
            carry this session’s access token.
          </span>
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={busy}
          className="px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5 shrink-0"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
          Sign out
        </button>
      </div>
    );
  }

  const label = mode === 'signin' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-cyan-400" />
            Sign in to the shared API
          </h3>
          <p className="text-[11px] text-slate-500">
            Supabase Auth, called directly from this browser. Your password is never sent to this API.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(['signin', 'register', 'reset'] as Mode[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => {
                setMode(option);
                setNotice(null);
                setPassword('');
              }}
              className={`px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
                mode === option
                  ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {option === 'signin' ? 'Sign in' : option === 'register' ? 'Register' : 'Reset'}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <label className="flex-1 text-[11px] text-slate-400">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            maxLength={254}
            required
            className={`mt-1 ${inputClass}`}
          />
        </label>

        {mode !== 'reset' && (
          <label className="flex-1 text-[11px] text-slate-400">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={mode === 'register' ? 8 : undefined}
              maxLength={200}
              required
              className={`mt-1 ${inputClass}`}
            />
          </label>
        )}

        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-lg hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1.5 shrink-0"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : mode === 'reset' ? (
            <Mail className="w-3.5 h-3.5" />
          ) : (
            <LogIn className="w-3.5 h-3.5" />
          )}
          {label}
        </button>
      </form>

      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`mt-3 text-xs ${
            notice.kind === 'error'
              ? 'text-red-300'
              : notice.kind === 'ok'
                ? 'text-emerald-300'
                : 'text-amber-200'
          }`}
        >
          {notice.message}
        </p>
      )}

      {mode === 'register' && (
        <p className="mt-2 text-[10px] text-slate-500">
          Accounts are created in Supabase Auth. If the project requires email confirmation, you must
          open the emailed link before a session exists.
        </p>
      )}
    </div>
  );
}
