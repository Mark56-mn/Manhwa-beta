import { GlobalRegistrator } from '@happy-dom/global-registrator';

/**
 * DOM preload for `bun test` (registered in bunfig.toml).
 *
 * Server-render tests worked without this, but anything that needs real event
 * handling, effects, or `localStorage` needs a document. happy-dom gives us
 * that without a browser download.
 */
if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: 'http://localhost:3000/' });
}

// React 19 requires this flag so `act()` does not warn about the test env.
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
