import { describe, expect, it } from 'bun:test';
import {
  MIN_PASSWORD_LENGTH,
  changePassword,
  normalizeEmail,
  requestPasswordReset,
  restoreSession,
  signInWithPassword,
  signOutSession,
  signUpWithPassword,
  validateEmail,
  validatePassword,
  type AuthFailure,
  type AuthGateway,
  type AuthSession
} from '../src/lib/authSession';
import { inspectKeyKind, resolveSupabaseConfig } from '../src/lib/supabaseConfig';

/**
 * Frontend authentication logic (TASK 11).
 *
 * The gateway is a fake here: these tests prove the state machine and the
 * message mapping, which is where "signed in" claims are made or avoided. Live
 * Supabase behaviour (real emails, real confirmation links) is not exercised —
 * there is no project configured in this environment.
 */

const SESSION: AuthSession = {
  accessToken: 'access-token-value',
  user: { id: '8f1a-uuid', email: 'ada@example.com' }
};

interface Calls {
  signUp: number;
  signIn: number;
}

function gateway(
  overrides: Partial<AuthGateway> = {},
  calls: Calls = { signUp: 0, signIn: 0 }
): AuthGateway {
  const base: AuthGateway = {
    async signUp() {
      calls.signUp += 1;
      return { session: null, user: null, error: null };
    },
    async signInWithPassword() {
      calls.signIn += 1;
      return { session: null, error: null };
    },
    async signOut() {
      return { error: null };
    },
    async getSession() {
      return { session: null, error: null };
    },
    async resetPasswordForEmail() {
      return { error: null };
    },
    async updatePassword() {
      return { error: null };
    }
  };
  return { ...base, ...overrides };
}

describe('input validation', () => {
  it('normalizes email without changing its meaning', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });

  it('rejects empty, malformed and over-long emails', () => {
    expect(validateEmail('')).not.toBeNull();
    expect(validateEmail('not-an-email')).not.toBeNull();
    expect(validateEmail('a@b')).not.toBeNull();
    expect(validateEmail(`${'a'.repeat(250)}@example.com`)).not.toBeNull();
    expect(validateEmail('ada@example.com')).toBeNull();
  });

  it('enforces the password boundaries it advertises', () => {
    expect(validatePassword('')).not.toBeNull();
    expect(validatePassword('short')).not.toBeNull();
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).not.toBeNull();
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(validatePassword('a'.repeat(201))).not.toBeNull();
  });
});

describe('registration', () => {
  it('reports confirmation_required when Supabase returns a user but no session', async () => {
    const outcome = await signUpWithPassword(
      gateway({
        async signUp() {
          return { session: null, user: { id: 'u-1', email: 'ada@example.com' }, error: null };
        }
      }),
      { email: 'ada@example.com', password: 'correct horse' }
    );
    expect(outcome).toEqual({ kind: 'confirmation_required', email: 'ada@example.com' });
  });

  it('reports authenticated only when a session really came back', async () => {
    const outcome = await signUpWithPassword(
      gateway({ async signUp() { return { session: SESSION, user: SESSION.user, error: null }; } }),
      { email: 'Ada@Example.com', password: 'correct horse' }
    );
    expect(outcome).toEqual({ kind: 'authenticated', user: SESSION.user });
  });

  it('validates before calling Supabase', async () => {
    const calls: Calls = { signUp: 0, signIn: 0 };
    const client = gateway({}, calls);
    expect((await signUpWithPassword(client, { email: 'nope', password: 'correct horse' })).kind).toBe(
      'invalid_input'
    );
    expect((await signUpWithPassword(client, { email: 'ada@example.com', password: 'short' })).kind).toBe(
      'invalid_input'
    );
    expect(calls.signUp).toBe(0);
  });

  it('maps an already-registered error without confirming the account exists', async () => {
    const outcome = await signUpWithPassword(
      gateway({
        async signUp() {
          return { session: null, user: null, error: { message: 'User already registered', status: 400 } };
        }
      }),
      { email: 'ada@example.com', password: 'correct horse' }
    );
    expect(outcome.kind).toBe('error');
    if (outcome.kind !== 'error') throw new Error('expected error');
    expect(outcome.message).toContain('may already exist');
    expect(outcome.retryable).toBe(false);
  });
});

describe('sign-in', () => {
  it('returns the session user on success', async () => {
    const outcome = await signInWithPassword(
      gateway({ async signInWithPassword() { return { session: SESSION, error: null }; } }),
      { email: 'ada@example.com', password: 'correct horse' }
    );
    expect(outcome).toEqual({ kind: 'authenticated', user: SESSION.user });
  });

  it('explains bad credentials without leaking detail', async () => {
    const failure: AuthFailure = { message: 'Invalid login credentials', status: 400 };
    const outcome = await signInWithPassword(
      gateway({ async signInWithPassword() { return { session: null, error: failure }; } }),
      { email: 'ada@example.com', password: 'wrong' }
    );
    expect(outcome).toEqual({ kind: 'error', message: 'Email or password is incorrect.', retryable: false });
  });

  it('reports an unconfirmed email as such', async () => {
    const outcome = await signInWithPassword(
      gateway({
        async signInWithPassword() {
          return { session: null, error: { message: 'Email not confirmed', status: 400 } };
        }
      }),
      { email: 'ada@example.com', password: 'correct horse' }
    );
    if (outcome.kind !== 'error') throw new Error('expected error');
    expect(outcome.message).toContain('has not been confirmed');
  });

  it('treats a missing session as a failure, never as success', async () => {
    const outcome = await signInWithPassword(
      gateway({ async signInWithPassword() { return { session: null, error: null }; } }),
      { email: 'ada@example.com', password: 'correct horse' }
    );
    expect(outcome.kind).toBe('error');
  });

  it('marks network and rate-limit failures retryable', async () => {
    const network = await signInWithPassword(
      gateway({
        async signInWithPassword() {
          return { session: null, error: { message: 'Failed to fetch', status: 0 } };
        }
      }),
      { email: 'ada@example.com', password: 'correct horse' }
    );
    if (network.kind !== 'error') throw new Error('expected error');
    expect(network.retryable).toBe(true);

    const limited = await signInWithPassword(
      gateway({
        async signInWithPassword() {
          return { session: null, error: { message: 'Too many requests', status: 429 } };
        }
      }),
      { email: 'ada@example.com', password: 'correct horse' }
    );
    if (limited.kind !== 'error') throw new Error('expected error');
    expect(limited.retryable).toBe(true);
  });
});

describe('session restoration and sign-out', () => {
  it('restores a persisted session', async () => {
    const outcome = await restoreSession(
      gateway({ async getSession() { return { session: SESSION, error: null }; } })
    );
    expect(outcome).toEqual({ kind: 'authenticated', user: SESSION.user });
  });

  it('reports signed_out when there is no session', async () => {
    await expect(restoreSession(gateway())).resolves.toEqual({ kind: 'signed_out' });
  });

  it('reports signed_out after sign-out', async () => {
    await expect(signOutSession(gateway())).resolves.toEqual({ kind: 'signed_out' });
  });
});

describe('password reset', () => {
  it('confirms only that a link was requested', async () => {
    const outcome = await requestPasswordReset(gateway(), 'ada@example.com', 'https://app.example/');
    expect(outcome).toEqual({ kind: 'reset_sent', email: 'ada@example.com' });
  });

  it('validates the email before sending anything', async () => {
    const outcome = await requestPasswordReset(gateway(), 'nope', 'https://app.example/');
    expect(outcome.kind).toBe('invalid_input');
  });

  it('reports a completed password change', async () => {
    await expect(changePassword(gateway(), 'a new passphrase')).resolves.toEqual({
      kind: 'password_updated'
    });
    expect((await changePassword(gateway(), 'short')).kind).toBe('invalid_input');
  });
});

describe('an unconfigured build never pretends', () => {
  it('fails every auth action with an honest message', async () => {
    const outcomes = [
      await signUpWithPassword(null, { email: 'ada@example.com', password: 'correct horse' }),
      await signInWithPassword(null, { email: 'ada@example.com', password: 'correct horse' }),
      await restoreSession(null),
      await requestPasswordReset(null, 'ada@example.com', 'https://app.example/'),
      await changePassword(null, 'correct horse')
    ];
    for (const outcome of outcomes) {
      expect(outcome.kind).toBe('error');
      if (outcome.kind !== 'error') throw new Error('expected error');
      expect(outcome.message).toContain('not configured');
    }
    await expect(signOutSession(null)).resolves.toEqual({ kind: 'signed_out' });
  });
});

describe('build-time Supabase configuration', () => {
  it('names the missing variables instead of guessing', () => {
    const config = resolveSupabaseConfig('', '');
    expect(config.kind).toBe('not_configured');
    if (config.kind !== 'not_configured') throw new Error('expected not_configured');
    expect(config.missing).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']);
  });

  it('rejects an unusable project URL', () => {
    for (const url of [
      'https://project.supabase.co/auth/v1',
      'ftp://project.supabase.co',
      'https://user:pass@project.supabase.co',
      'http://project.supabase.co',
      'not-a-url'
    ]) {
      expect(resolveSupabaseConfig(url, 'sb_publishable_abc').kind).toBe('invalid');
    }
  });

  it('accepts https and a local http Supabase', () => {
    const online = resolveSupabaseConfig('https://project.supabase.co', 'sb_publishable_abc');
    expect(online).toMatchObject({ kind: 'configured', url: 'https://project.supabase.co' });
    expect(resolveSupabaseConfig('http://127.0.0.1:54321', 'sb_publishable_abc').kind).toBe('configured');
  });

  it('refuses a secret or service-role key outright', () => {
    for (const key of ['sb_secret_abc123', 'a-key-containing-service_role']) {
      expect(inspectKeyKind(key)).toBe('secret');
      const config = resolveSupabaseConfig('https://project.supabase.co', key);
      expect(config.kind).toBe('invalid');
      if (config.kind !== 'invalid') throw new Error('expected invalid');
      expect(config.reason).toContain('secret/service-role');
    }
  });

  it('recognises a legacy anon JWT and refuses a service-role JWT', () => {
    const jwt = (role: string) => {
      const encode = (value: unknown) =>
        btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'supabase' })}.signature`;
    };

    expect(inspectKeyKind(jwt('anon'))).toBe('legacy-anon');
    expect(inspectKeyKind(jwt('service_role'))).toBe('secret');
    expect(resolveSupabaseConfig('https://project.supabase.co', jwt('service_role')).kind).toBe('invalid');
    expect(resolveSupabaseConfig('https://project.supabase.co', jwt('anon'))).toMatchObject({
      kind: 'configured',
      keyKind: 'legacy-anon'
    });
  });

  it('rejects a value that is not a Supabase key at all', () => {
    expect(inspectKeyKind('hello')).toBe('unknown');
    expect(resolveSupabaseConfig('https://project.supabase.co', 'hello').kind).toBe('invalid');
  });
});
