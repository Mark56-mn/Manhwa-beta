/**
 * Browser authentication state machine (TASK 11).
 *
 * Kept out of React so every branch — register (with or without email
 * confirmation), sign in, restore, sign out, password reset — is testable
 * without a browser or a network. The `AuthGateway` seam is the exact subset of
 * supabase-js this app uses; src/lib/supabase.ts adapts the real client to it.
 *
 * Honesty rules encoded here:
 *  - Nothing is ever reported as signed in unless Supabase returned a session.
 *  - Registration with email confirmation enabled returns a user but NO
 *    session; that is reported as `confirmation_required`, never as success.
 *  - Error text is mapped to actionable, non-leaking messages; provider detail
 *    is not echoed verbatim.
 */

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface AuthFailure {
  message: string;
  status?: number;
  code?: string;
}

export interface AuthGateway {
  signUp(input: { email: string; password: string }): Promise<{
    session: AuthSession | null;
    user: AuthUser | null;
    error: AuthFailure | null;
  }>;
  signInWithPassword(input: { email: string; password: string }): Promise<{
    session: AuthSession | null;
    error: AuthFailure | null;
  }>;
  signOut(): Promise<{ error: AuthFailure | null }>;
  getSession(): Promise<{ session: AuthSession | null; error: AuthFailure | null }>;
  resetPasswordForEmail(email: string, redirectTo: string): Promise<{ error: AuthFailure | null }>;
  updatePassword(password: string): Promise<{ error: AuthFailure | null }>;
}

export type AuthOutcome =
  | { kind: 'authenticated'; user: AuthUser }
  | { kind: 'confirmation_required'; email: string }
  | { kind: 'signed_out' }
  | { kind: 'reset_sent'; email: string }
  | { kind: 'password_updated' }
  | { kind: 'invalid_input'; message: string }
  | { kind: 'error'; message: string; retryable: boolean };

/** Minimum length this app asks for; Supabase's own project setting still wins. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (email.length === 0) return 'Enter your email address.';
  if (email.length > 254) return 'That email address is too long.';
  if (!EMAIL_PATTERN.test(email)) return 'That does not look like an email address.';
  return null;
}

export function validatePassword(raw: string): string | null {
  if (raw.length === 0) return 'Enter a password.';
  if (raw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (raw.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  return null;
}

function mapFailure(error: AuthFailure): { message: string; retryable: boolean } {
  const text = error.message ?? '';
  const status = error.status;

  // Supabase's own status codes are authoritative where present; message
  // matching only sharpens the wording.
  if (/invalid login credentials/i.test(text)) {
    return { message: 'Email or password is incorrect.', retryable: false };
  }
  if (/email not confirmed/i.test(text)) {
    return {
      message:
        'This email has not been confirmed yet. Open the confirmation link Supabase emailed you, then sign in.',
      retryable: false
    };
  }
  if (/user already registered|already been registered/i.test(text)) {
    return {
      message: 'An account with this email may already exist. Try signing in, or reset the password.',
      retryable: false
    };
  }
  if (/password/i.test(text) && /(weak|strength|least|characters)/i.test(text)) {
    return {
      message: `Supabase rejected that password. Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      retryable: false
    };
  }
  if (/rate limit|too many/i.test(text) || status === 429) {
    return { message: 'Too many attempts. Wait a moment and try again.', retryable: true };
  }
  if (status === undefined || status === 0 || /fetch|network/i.test(text)) {
    return {
      message: 'Could not reach the authentication service. Check your connection and try again.',
      retryable: true
    };
  }
  return {
    message: text.length > 0 ? text : 'The authentication service rejected the request.',
    retryable: typeof status === 'number' && status >= 500
  };
}

function failure(error: AuthFailure): AuthOutcome {
  const mapped = mapFailure(error);
  return { kind: 'error', message: mapped.message, retryable: mapped.retryable };
}

/**
 * Create an account.
 *
 * With "Confirm email" enabled (the Supabase default) no session is returned
 * until the user opens the emailed link, so this reports
 * `confirmation_required` — and says so instead of claiming a login.
 */
export async function signUpWithPassword(
  gateway: AuthGateway | null,
  input: { email: string; password: string }
): Promise<AuthOutcome> {
  if (!gateway) {
    return { kind: 'error', message: 'Authentication is not configured for this build.', retryable: false };
  }
  const email = normalizeEmail(input.email);
  const emailError = validateEmail(email);
  if (emailError) return { kind: 'invalid_input', message: emailError };
  const passwordError = validatePassword(input.password);
  if (passwordError) return { kind: 'invalid_input', message: passwordError };

  const { session, error } = await gateway.signUp({ email, password: input.password });
  if (error) return failure(error);
  if (session) return { kind: 'authenticated', user: session.user };
  return { kind: 'confirmation_required', email };
}

export async function signInWithPassword(
  gateway: AuthGateway | null,
  input: { email: string; password: string }
): Promise<AuthOutcome> {
  if (!gateway) {
    return { kind: 'error', message: 'Authentication is not configured for this build.', retryable: false };
  }
  const email = normalizeEmail(input.email);
  const emailError = validateEmail(email);
  if (emailError) return { kind: 'invalid_input', message: emailError };
  if (input.password.length === 0) return { kind: 'invalid_input', message: 'Enter your password.' };

  const { session, error } = await gateway.signInWithPassword({ email, password: input.password });
  if (error) return failure(error);
  if (!session) {
    // No error and no session is not a success; say what is actually true.
    return {
      kind: 'error',
      message: 'Supabase returned no session, so you are not signed in.',
      retryable: true
    };
  }
  return { kind: 'authenticated', user: session.user };
}

export async function signOutSession(gateway: AuthGateway | null): Promise<AuthOutcome> {
  if (!gateway) return { kind: 'signed_out' };
  const { error } = await gateway.signOut();
  if (error) return failure(error);
  return { kind: 'signed_out' };
}

/** Restore a persisted session on page load. */
export async function restoreSession(gateway: AuthGateway | null): Promise<AuthOutcome> {
  if (!gateway) {
    return {
      kind: 'error',
      message: 'Authentication is not configured for this build.',
      retryable: false
    };
  }
  const { session, error } = await gateway.getSession();
  if (error) return failure(error);
  return session ? { kind: 'authenticated', user: session.user } : { kind: 'signed_out' };
}

/**
 * Send a password-reset email. Supabase does not reveal whether the address
 * exists, and neither does this.
 */
export async function requestPasswordReset(
  gateway: AuthGateway | null,
  rawEmail: string,
  redirectTo: string
): Promise<AuthOutcome> {
  if (!gateway) {
    return { kind: 'error', message: 'Authentication is not configured for this build.', retryable: false };
  }
  const email = normalizeEmail(rawEmail);
  const emailError = validateEmail(email);
  if (emailError) return { kind: 'invalid_input', message: emailError };

  const { error } = await gateway.resetPasswordForEmail(email, redirectTo);
  if (error) return failure(error);
  return { kind: 'reset_sent', email };
}

/** Complete a reset after the user followed the emailed recovery link. */
export async function changePassword(
  gateway: AuthGateway | null,
  password: string
): Promise<AuthOutcome> {
  if (!gateway) {
    return { kind: 'error', message: 'Authentication is not configured for this build.', retryable: false };
  }
  const passwordError = validatePassword(password);
  if (passwordError) return { kind: 'invalid_input', message: passwordError };

  const { error } = await gateway.updatePassword(password);
  if (error) return failure(error);
  return { kind: 'password_updated' };
}
