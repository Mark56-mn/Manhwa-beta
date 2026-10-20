import { Project } from '../types/manhwa';
import { ShieldCheck, Film, Youtube, AlertTriangle } from 'lucide-react';

interface ApprovalCenterProps {
  project: Project;
  onUpdateProject: (updated: Project) => void;
}

/**
 * Approval Center — honest disconnected state.
 *
 * This build has no server-side YouTube OAuth, no upload path, and no rendered
 * video files, so this screen only displays locally stored approval records and
 * explicit "not connected" / "blocked" states. No action here simulates a real
 * connection, upload, or publication.
 */
export function ApprovalCenter({ project }: ApprovalCenterProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2 text-amber-400 text-xs font-mono tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>GOVERNANCE & PUBLISHING</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Approval Center & YouTube Publisher</h2>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Approval records below are stored in this browser's local project data. Publishing is{' '}
            <strong className="text-amber-400">not connected</strong> in this build: there is no server-side
            YouTube OAuth, no upload path, and no rendered video files yet.
          </p>
        </div>

        <div
          className="px-4 py-2 text-xs font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl flex items-center gap-2 shrink-0"
          title="No OAuth flow is implemented in this build"
        >
          <Youtube className="w-4 h-4" />
          <span>YouTube: Not connected</span>
        </div>
      </div>

      {/* Rendered Video / Upload Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Film className="w-5 h-5 text-cyan-400" />
              Rendered Motion Comic Artifacts
            </h3>
            <span className="text-xs font-mono text-slate-400">No rendered version exists</span>
          </div>

          {/* Honest empty state: no video file has ever been produced by this build */}
          <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900/60 border border-dashed border-slate-700 flex items-center justify-center">
            <div className="text-center space-y-2 px-8">
              <Film className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">No rendered video exists for this project</p>
              <p className="text-xs text-slate-500 max-w-md">
                Video rendering and quality control are not implemented in this build. When they are, this
                panel will show the actual file, its version, duration, and QC results.
              </p>
            </div>
          </div>

          {/* Blocked publishing state */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
            <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Publishing blocked — not available in this build
            </p>
            <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
              <li>A rendered video version must exist (rendering worker: not implemented).</li>
              <li>Server-side YouTube OAuth must be configured (not implemented).</li>
              <li>Explicit owner approval of that exact version must be recorded (not implemented).</li>
            </ul>
            <button
              disabled
              className="px-4 py-2.5 text-xs font-semibold text-slate-500 bg-slate-800 border border-slate-700 rounded-xl cursor-not-allowed flex items-center gap-2"
              aria-disabled="true"
              title="YouTube upload is not connected in this build"
            >
              <Youtube className="w-4 h-4" />
              <span>Upload to YouTube — unavailable</span>
            </button>
          </div>
        </div>

        {/* Approval History */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-bold text-white">Approval Log</h3>
          <p className="text-xs text-slate-400">Records stored in this browser's local project data.</p>

          <div className="space-y-3 pt-2">
            {project.approvals.map((app) => (
              <div key={app.id} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{app.artifactTitle}</span>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {app.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{app.notes}</p>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-2 border-t border-slate-800/80">
                  <span>By {app.approver}</span>
                  <span>{app.timestamp}</span>
                </div>
              </div>
            ))}

            {project.approvals.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-500">No approval records yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
