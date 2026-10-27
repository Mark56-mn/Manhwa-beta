import { GlobalRegistrator } from '@happy-dom/global-registrator';

/**
 * Scoped DOM harness for the component tests (reconciled from TASK-01).
 *
 * Two deliberate choices, both learned from merging TASK-01 wholesale:
 *
 * 1. This is **not** a `bunfig.toml` preload. A global preload replaces
 *    `Request`, `Response`, `Headers` and `fetch` for the entire run, which
 *    broke 58 Worker route tests that need the real Web APIs. Importing this
 *    module from a DOM test file registers the browser globals only for that
 *    file, and `unregisterDom()` in `afterAll` restores the runtime.
 *
 * 2. `@testing-library/react` is imported **dynamically, after** registration.
 *    `@testing-library/dom` binds `screen` to `document.body` at import time,
 *    so a static import that is hoisted above registration yields a
 *    permanently-throwing stub ("a global document has to be available").
 */

const TEST_ORIGIN = 'http://localhost:3000/';

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: TEST_ORIGIN });
}
// React 19 uses this flag to decide whether `act()` warnings apply.
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const rtl = await import('@testing-library/react');

export const cleanup = rtl.cleanup;
export const fireEvent = rtl.fireEvent;
export const render = rtl.render;
export const screen = rtl.screen;
export const waitFor = rtl.waitFor;

export function unregisterDom(): void {
  if (GlobalRegistrator.isRegistered) GlobalRegistrator.unregister();
}

/**
 * Let React's scheduler finish any task it queued from the last render before
 * the browser globals disappear. Without this, a callback can fire after
 * `unregisterDom()` and throw `ReferenceError: window is not defined` between
 * tests. `cleanup()` should run first so there is nothing left to update.
 */
export async function drainReactWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The app mounts the server-backed shared workspace, which fetches on mount.
 * A component test has no API, so `fetch` answers an immediate 401: the panel
 * renders its honest "not signed in" state, nothing reaches the network, and no
 * timer keeps the run alive. Returns a restore function.
 */
export function stubApiFetch(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    })) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}
