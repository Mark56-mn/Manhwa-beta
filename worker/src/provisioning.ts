import type { Env } from './env';
import type { AuthenticatedUser } from './identity';
import { firstOrganizationForUser } from './tenancy';

/**
 * First-use organization provisioning (TASK 09).
 *
 * The gap this closes: every protected route derives its tenant from
 * `organization_memberships`, and nothing in the running system ever created a
 * row there — so a successfully signed-in user was answered
 * `403 Not a member of any organization` forever.
 *
 * Rules:
 *  - It runs ONLY after a session has been verified. There is no route that
 *    provisions for an unauthenticated caller, and no request field (header,
 *    query, body) participates in the decision. The organization and the
 *    membership are keyed by the verified OIDC `sub` alone.
 *  - Every identifier is DERIVED FROM the `sub` by a stable hash, so two
 *    concurrent first sign-ins compute the identical primary keys. Each write
 *    is `ON CONFLICT DO NOTHING`, which makes the losing request a no-op
 *    instead of a duplicate organization. D1 exposes no interactive
 *    transaction, so deterministically-keyed idempotent writes are the
 *    concurrency control.
 *  - An existing membership ALWAYS wins. A user who was invited into someone
 *    else's organization never gets a second one.
 *  - The created membership role is the least privilege that works for a
 *    workspace owner: `owner` (the schema's only elevated role) — never
 *    `admin`, and never a role supplied by the caller.
 */

export const MAX_SUBJECT_LENGTH = 255;
export const MAX_ORGANIZATION_NAME_LENGTH = 120;
export const DEFAULT_ORGANIZATION_NAME = 'Personal workspace';

export interface ProvisionedOrganization {
  organizationId: string;
  /** True only when this call created the organization row. */
  created: boolean;
}

/**
 * Eligibility policy for automatic provisioning.
 *
 * Today: any subject the identity layer has already verified. The identity
 * layer (`worker/src/identity.ts`) is the only source of a `sub` — it verifies
 * the session signature/issuer/audience/expiry and normalizes the claim — so
 * there is deliberately no separate allow-list, email domain check or
 * environment flag here. Adding one would create a second, weaker path to an
 * identity than the one that already exists.
 */
export function isEligibleForProvisioning(user: AuthenticatedUser | null | undefined): boolean {
  if (!user || typeof user.sub !== 'string') return false;
  if (user.sub.length === 0 || user.sub.length > MAX_SUBJECT_LENGTH) return false;
  // A subject with surrounding whitespace is not a canonical identity: two
  // spellings would produce two different derived keys for one person.
  return user.sub.trim() === user.sub;
}

const encoder = new TextEncoder();

/** Stable, non-reversible hex digest. Never a secret; never reversible to a sub. */
async function digestHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** Deterministic organization id for a verified subject. */
export async function organizationIdForSubject(sub: string): Promise<string> {
  return `org-${(await digestHex(`manhwa-studio:organization:${sub}`)).slice(0, 32)}`;
}

/** Deterministic membership id for a verified subject. */
export async function membershipIdForSubject(sub: string): Promise<string> {
  return `mem-${(await digestHex(`manhwa-studio:membership:${sub}`)).slice(0, 32)}`;
}

/**
 * Deterministic slug. `organizations.slug` is UNIQUE, so deriving it from the
 * same stable input keeps a retry from colliding on an unrelated slug.
 */
export async function organizationSlugForSubject(sub: string): Promise<string> {
  return `workspace-${(await digestHex(`manhwa-studio:slug:${sub}`)).slice(0, 24)}`;
}

/** Control characters are stripped; the schema only requires a non-empty name. */
function organizationNameFor(user: AuthenticatedUser): string {
  const raw = typeof user.name === 'string' ? user.name : '';
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (cleaned.length === 0) return DEFAULT_ORGANIZATION_NAME;
  return cleaned.length > MAX_ORGANIZATION_NAME_LENGTH
    ? cleaned.slice(0, MAX_ORGANIZATION_NAME_LENGTH)
    : cleaned;
}

function displayNameFor(user: AuthenticatedUser): string | null {
  const raw = typeof user.name === 'string' ? user.name.trim() : '';
  return raw.length === 0 ? null : raw.slice(0, MAX_ORGANIZATION_NAME_LENGTH);
}

/** D1 reports affected rows in `meta.changes`; anything else is "unknown". */
function changesOf(result: unknown): number {
  const meta = (result as { meta?: { changes?: unknown } } | null | undefined)?.meta;
  return typeof meta?.changes === 'number' ? meta.changes : 0;
}

/**
 * Append-only record that an organization was created for a subject.
 * Best-effort: a failure here must not deny a user the workspace that already
 * exists, and no secret, token or provider claim is ever written.
 */
async function recordProvisioning(env: Env, organizationId: string, sub: string): Promise<void> {
  try {
    await env.DB!.prepare(
      `INSERT INTO audit_events (organization_id, actor_sub, action, target_type, target_id)
       VALUES (?, ?, 'organization.provisioned', 'organization', ?)`
    )
      .bind(organizationId, sub, organizationId)
      .run();
  } catch {
    // Intentionally swallowed: the audit trail is not the authorization.
  }
}

/**
 * Idempotent: returns the caller's organization, creating exactly one on first
 * use. Returns null when there is no database, the subject is ineligible, or
 * the row cannot be observed afterwards.
 */
export async function ensureOrganizationForUser(
  env: Env,
  user: AuthenticatedUser
): Promise<ProvisionedOrganization | null> {
  if (!env.DB) return null;
  if (!isEligibleForProvisioning(user)) return null;

  // An existing membership always wins — provisioning never adds a second
  // organization to a user who already belongs to one.
  const existing = await firstOrganizationForUser(env, user.sub);
  if (existing) return { organizationId: existing, created: false };

  const organizationId = await organizationIdForSubject(user.sub);
  const membershipId = await membershipIdForSubject(user.sub);
  const slug = await organizationSlugForSubject(user.sub);

  // Order matters: the membership and every project row reference `users(id)`.
  await env.DB.prepare(
    `INSERT INTO users (id, display_name) VALUES (?, ?)
     ON CONFLICT DO NOTHING`
  )
    .bind(user.sub, displayNameFor(user))
    .run();

  const organization = await env.DB.prepare(
    `INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)
     ON CONFLICT DO NOTHING`
  )
    .bind(organizationId, organizationNameFor(user), slug)
    .run();

  await env.DB.prepare(
    `INSERT INTO organization_memberships (id, organization_id, user_sub, role)
     VALUES (?, ?, ?, 'owner')
     ON CONFLICT DO NOTHING`
  )
    .bind(membershipId, organizationId, user.sub)
    .run();

  // Only the request that actually inserted the row records the event, so
  // concurrent sign-ins produce exactly one audit entry.
  const created = changesOf(organization) === 1;
  if (created) await recordProvisioning(env, organizationId, user.sub);

  // Re-read rather than trusting the computed id: this is authoritative and
  // also covers a membership written concurrently by another request.
  const resolved = await firstOrganizationForUser(env, user.sub);
  return resolved ? { organizationId: resolved, created } : null;
}

/**
 * The single tenant-resolution entry point for protected routes: the caller's
 * organization, provisioned on first use. Replaces a read-only lookup so a
 * brand-new user lands in a workspace instead of a permanent 403.
 */
export async function resolveOrganizationForUser(
  env: Env,
  user: AuthenticatedUser
): Promise<string | null> {
  const outcome = await ensureOrganizationForUser(env, user);
  return outcome ? outcome.organizationId : null;
}
