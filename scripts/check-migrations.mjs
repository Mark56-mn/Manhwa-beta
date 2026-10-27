#!/usr/bin/env node
/**
 * Migration preflight (TASK 09).
 *
 * Runs BEFORE `wrangler d1 migrations apply`, because wrangler aborts at the
 * first failing statement: one unappliable file silently leaves every later
 * migration unapplied. This checks the chain statically, without touching any
 * database, remote or local.
 *
 * Flags:
 *  - BLOCKER  a statement that will fail (or that would destroy data) when the
 *             chain is applied to a database that already has earlier objects.
 *  - WARNING  ambiguous but not fatal.
 *
 * Usage:  node scripts/check-migrations.mjs [migrationsDir]
 * Exit:   0 = safe to apply, 1 = at least one blocker.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Strip `-- line` and `/* block *​/` comments so prose is never scanned. */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const DESTRUCTIVE = [
  { pattern: /\bDROP\s+(TABLE|INDEX|VIEW|TRIGGER)\b/i, label: 'DROP statement' },
  { pattern: /\bALTER\s+TABLE\b/i, label: 'ALTER TABLE (SQLite has no ADD COLUMN IF NOT EXISTS)' },
  { pattern: /\bDELETE\s+FROM\b/i, label: 'DELETE (a migration must not remove data)' },
  { pattern: /\b(TRUNCATE|REPLACE\s+INTO)\b/i, label: 'row replacement' }
];

/**
 * Non-idempotent DDL: `CREATE TABLE x` / `CREATE INDEX x` without
 * IF NOT EXISTS fails with "already exists" on any database where the object
 * was created outside this chain (manually, or by an earlier revision).
 */
function nonIdempotentStatements(sql) {
  const findings = [];
  const bareCreate = /\bCREATE\s+(TABLE|UNIQUE\s+INDEX|INDEX|VIEW|TRIGGER)\s+(?!IF\s+NOT\s+EXISTS\b)/gi;
  for (const match of stripSqlComments(sql).matchAll(bareCreate)) {
    findings.push(match[0].replace(/\s+/g, ' ').trim());
  }
  return findings;
}

/**
 * Analyze an in-memory chain. `files` is [{ name, sql }] in any order; the
 * chain order wrangler uses (filename sort) is applied here.
 */
export function analyzeMigrationChain(files) {
  const blockers = [];
  const warnings = [];
  // Byte order (UTF-16 code units), NOT localeCompare: wrangler applies the
  // chain in plain `Array.prototype.sort()` order, where `.` (0x2E) sorts
  // before `_` (0x5F). That is exactly why an untracked `0002_assets.sql`
  // runs before the tracked `0002_assets_and_replication.sql`.
  const ordered = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const byPrefix = new Map();
  for (const file of ordered) {
    const prefix = file.name.split('_')[0];
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(file.name);
  }
  for (const [prefix, names] of byPrefix) {
    if (names.length > 1) {
      warnings.push(
        `prefix ${prefix} is shared by ${names.join(', ')} — wrangler applies both, in this order: ${names
          .sort()
          .join(' → ')}`
      );
    }
  }

  // The genesis migration is exempt from the idempotency rule: it is the
  // baseline that CREATES the schema (it runs once, on an empty database, and
  // is already applied remotely). Every later file must tolerate objects that
  // already exist, because those are the files a re-run or a drifted database
  // actually replays.
  const genesis = ordered.length > 0 ? ordered[0].name : null;

  for (const file of ordered) {
    const statements = nonIdempotentStatements(file.sql);
    if (statements.length > 0 && file.name !== genesis) {
      blockers.push(
        `${file.name}: ${statements.length} non-idempotent statement(s) — ${statements
          .slice(0, 3)
          .join('; ')}${statements.length > 3 ? '; …' : ''}. ` +
          'Add IF NOT EXISTS, or the apply fails with "already exists" on any database that already has the object.'
      );
    }
    for (const { pattern, label } of DESTRUCTIVE) {
      if (pattern.test(stripSqlComments(file.sql))) {
        blockers.push(`${file.name}: ${label}. Migrations in this repository are additive by policy.`);
      }
    }
    if (file.sql.trim().length === 0) blockers.push(`${file.name}: empty migration file.`);
  }

  return { ordered, blockers, warnings };
}

export function formatReport(result) {
  const lines = [];
  lines.push(`Applied order (${result.ordered.length} file(s)):`);
  for (const file of result.ordered) lines.push(`  ${file.name}`);
  lines.push('');
  if (result.warnings.length > 0) {
    lines.push(`WARNINGS (${result.warnings.length}):`);
    for (const warning of result.warnings) lines.push(`  ! ${warning}`);
    lines.push('');
  }
  if (result.blockers.length > 0) {
    lines.push(`BLOCKERS (${result.blockers.length}) — do NOT apply this chain:`);
    for (const blocker of result.blockers) lines.push(`  ✘ ${blocker}`);
    lines.push('');
    lines.push('Remediation: quarantine the offending file (move it out of migrations/) and re-run.');
    lines.push('A file that duplicates an already-applied object is preserved, not deleted:');
    lines.push('  mv migrations/<file>.sql /tmp/<file>.sql.stray');
    return lines.join('\n');
  }
  lines.push('OK — no blockers. Safe to apply to a database that already has earlier objects.');
  return lines.join('\n');
}

export function analyzeMigrationsDirectory(directory) {
  const names = readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const files = names.map((name) => ({
    name,
    sql: readFileSync(join(directory, name), 'utf8')
  }));
  return analyzeMigrationChain(files);
}

function main() {
  const directory = resolve(process.argv[2] ?? 'migrations');
  let result;
  try {
    result = analyzeMigrationsDirectory(directory);
  } catch (error) {
    console.error(`Could not read migrations from ${directory}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Migration preflight — ${directory}`);
  console.log(formatReport(result));
  process.exit(result.blockers.length > 0 ? 1 : 0);
}

// Portable "run as a script" guard (works under node and bun, not just bun).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
