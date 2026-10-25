import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  Cloud,
  Loader2,
  RefreshCw,
  Server,
  ShieldAlert,
  WifiOff
} from 'lucide-react';
import { api } from '../lib/api';
import { isCrossOriginApi, resolveApiConfig } from '../lib/apiConfig';
import {
  loadCloudWorkspace,
  saveCloudProject,
  type CloudWorkspaceState
} from '../lib/cloudWorkspace';
import { StoryStudio } from './StoryStudio';

/**
 * Shared workspace (server-backed projects).
 *
 * One small, real workflow: read the session, list the caller's server
 * projects and create one. Every state is displayed literally — this panel
 * never shows a saved project, a fake session or demo rows. Browser-local
 * projects elsewhere in the app remain clearly separate.
 */

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; notice: string }
  | { kind: 'error'; message: string };

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace('.000Z', 'Z');
}

export function CloudWorkspacePanel() {
  // Resolved at render time from public build-time configuration so a deploy
  // can be verified by eye: an unset or invalid value is visible here.
  const apiConfig = resolveApiConfig();
  const apiLabel =
    apiConfig.kind === 'configured'
      ? apiConfig.baseUrl
      : apiConfig.kind === 'invalid'
        ? 'VITE_API_BASE_URL is invalid'
        : 'same origin (VITE_API_BASE_URL unset)';
  const crossOriginApi = apiConfig.kind === 'configured' && isCrossOriginApi(apiConfig.baseUrl);

  const [state, setState] = useState<CloudWorkspaceState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void loadCloudWorkspace(api, controller.signal).then((next) => {
      if (!controller.signal.aborted) setState(next);
    });
    return () => controller.abort();
  }, [reloadKey]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saveState.kind === 'saving') return;

    setSaveState({ kind: 'saving' });
    const result = await saveCloudProject(api, { title, genre });
    if (!result.ok) {
      setSaveState({ kind: 'error', message: result.message });
      // Re-render the load state when the failure means the workspace itself
      // is unavailable (signed out, not configured, forbidden).
      if (state.status !== 'ready') setState(result.state);
      return;
    }

    setState((previous) =>
      previous.status === 'ready'
        ? { status: 'ready', projects: [result.project, ...previous.projects] }
        : previous
    );
    setSelectedProjectId(result.project.id);
    setSaveState({ kind: 'saved', notice: result.notice });
    setTitle('');
    setGenre('');
  };

  return (
    <section className="mb-8 bg-[#111827] border border-slate-800 rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              Shared workspace
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-slate-800 border border-slate-700 text-slate-300 rounded-full">
                Server-backed
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Projects stored on the authoritative API — separate from the browser-local projects below.
            </p>
            <p className="text-[10px] font-mono text-slate-500 mt-0.5 break-all" title="Resolved from VITE_API_BASE_URL at build time (public)">
              API: {apiLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {state.status === 'loading' && (
          <p role="status" className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            Connecting to the shared API…
          </p>
        )}

        {state.status === 'signed_out' && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" role="status">
            <p className="flex items-start gap-2 text-xs text-amber-300">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Not signed in to the shared API. Cloud projects stay unavailable, and nothing is
                stored or displayed as saved until a real session exists.
              </span>
            </p>
            <a
              href={`${api.baseUrl}/auth/freebuff/signin?returnTo=%2F`}
              className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors shrink-0"
            >
              Sign in with Freebuff
            </a>
            {crossOriginApi && (
              <p className="text-[10px] text-slate-500 sm:col-span-2">
                Sign-in runs on the API origin ({apiConfig.kind === 'configured' ? apiConfig.baseUrl : ''}).
                Its session cookie is host-only, so a browser on this origin only keeps the session when
                both hosts share a parent domain; otherwise the API must be proxied from this origin.
              </p>
            )}
          </div>
        )}

        {state.status === 'api_misconfigured' && (
          <div className="flex items-start gap-2 text-xs text-amber-300" role="alert">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {state.detail}
              <span className="block mt-1 text-amber-200/70">
                Cloud projects stay unavailable. Browser-local projects below still work and are not
                affected.
              </span>
            </span>
          </div>
        )}

        {state.status === 'not_configured' && (
          <div className="flex items-start gap-2 text-xs text-amber-300" role="status">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{state.detail}</span>
          </div>
        )}

        {state.status === 'forbidden' && (
          <div className="flex items-start gap-2 text-xs text-amber-300" role="status">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{state.detail}</span>
          </div>
        )}

        {state.status === 'unavailable' && (
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3" role="alert">
            <p className="flex items-start gap-2 text-xs text-amber-300">
              <WifiOff className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold">Backend unavailable.</span> {state.detail}
                <span className="block mt-1 text-amber-200/70">
                  Nothing was loaded from the server. An undeployed or sleeping API, a blocked
                  cross-origin request, or an API origin that is not in the Worker&apos;s allow-list all
                  look like this. Browser-local projects below are unaffected.
                </span>
              </span>
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors inline-flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" role="alert">
            <p className="flex items-start gap-2 text-xs text-red-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{state.message}</span>
            </p>
            {state.retryable && (
              <button
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors inline-flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>
        )}

        {state.status === 'ready' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                {state.projects.length === 0
                  ? 'No cloud projects yet. The server returned an empty list.'
                  : `${state.projects.length} cloud project${state.projects.length === 1 ? '' : 's'} on the shared server.`}
              </p>
              <button
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Reload cloud projects"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {state.projects.length > 0 && (
              <ul className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
                {state.projects.map((project) => (
                  <li
                    key={project.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 bg-slate-900/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{project.title}</p>
                      <p className="text-[11px] font-mono text-slate-500 truncate">
                        {project.id} · {project.genre ?? 'no genre'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 uppercase tracking-wider">
                        {project.status.replace('_', ' ')}
                      </span>
                      <span>Updated {formatTimestamp(project.updated_at)}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedProjectId(project.id)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-slate-900 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors"
                      >
                        Open Story Studio
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="New cloud project title"
                maxLength={200}
                className="flex-1 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <input
                type="text"
                value={genre}
                onChange={(event) => setGenre(event.target.value)}
                placeholder="Genre (optional)"
                maxLength={80}
                className="sm:w-40 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <button
                type="submit"
                disabled={saveState.kind === 'saving' || title.trim().length === 0}
                className="px-4 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-lg hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1.5 shrink-0"
              >
                {saveState.kind === 'saving' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Cloud className="w-3.5 h-3.5" />
                    Save to server
                  </>
                )}
              </button>
            </form>

            {saveState.kind === 'saved' && (
              <p role="status" className="text-xs text-emerald-300">
                {saveState.notice}
              </p>
            )}
            {saveState.kind === 'error' && (
              <p role="alert" className="text-xs text-red-300">
                {saveState.message}
              </p>
            )}

            {state.projects.length > 0 && (
              <div className="pt-2 border-t border-slate-800">
                {(() => {
                  const selected = state.projects.find(
                    (project) => project.id === selectedProjectId
                  );
                  if (!selected) {
                    return (
                      <p className="text-xs text-slate-400">
                        Select a cloud project above to open its server-backed Story Studio.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-white">
                          Story Studio · {selected.title}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setSelectedProjectId(null)}
                          className="text-[11px] text-slate-400 hover:text-white self-start sm:self-auto"
                        >
                          Close studio
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Story Bibles, episodes, jobs and writing credits here are stored on the shared
                        server. They are not browser-local drafts.
                      </p>
                      <StoryStudio project={selected} />
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
