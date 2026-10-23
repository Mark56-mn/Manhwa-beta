import type { Env } from './env';

/**
 * Tenancy primitives shared by every protected route.
 *
 * Ownership is derived from the sessions's OIDC `sub` and the membership table,
 * never from an organization id supplied by the client.
 */

/** First (and today only) organization the user belongs to. */
export async function firstOrganizationForUser(
  env: Env,
  userSub: string
): Promise<string | null> {
  if (!env.DB) return null;
  const row = await env.DB.prepare(
    `SELECT organization_id FROM organization_memberships WHERE user_sub = ? ORDER BY created_at, id LIMIT 1`
  )
    .bind(userSub)
    .first<{ organization_id: string } | null>();
  return row?.organization_id ?? null;
}

/** True only when the authenticated user really is a member of the org. */
export async function isOrganizationMember(
  env: Env,
  organizationId: string,
  userSub: string
): Promise<boolean> {
  if (!env.DB) return false;
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM organization_memberships WHERE organization_id = ? AND user_sub = ?`
  )
    .bind(organizationId, userSub)
    .first<{ ok: number } | null>();
  return row != null;
}
