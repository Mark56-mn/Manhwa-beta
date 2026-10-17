import { useState } from 'react';
import { Project, ApprovalRecord } from '../types/manhwa';
import { ShieldCheck, CheckCircle2, AlertTriangle, Upload, Youtube, Lock, Globe, Film, Check } from 'lucide-react';

interface ApprovalCenterProps {
  project: Project;
  onUpdateProject: (updated: Project) => void;
}

export function ApprovalCenter({ project, onUpdateProject }: ApprovalCenterProps) {
  const [isConnectingOAuth, setIsConnectingOAuth] = useState(false);
  const [isConnectedToYouTube, setIsConnectedToYouTube] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>(project.episodes[0]?.id || '');
  const [publicConfirmationChecked, setPublicConfirmationChecked] = useState(false);

  const handleConnectYouTube = () => {
    setIsConnectingOAuth(true);
    setTimeout(() => {
      setIsConnectingOAuth(false);
      setIsConnectedToYouTube(true);
    }, 1000);
  };

  const handleSimulateUpload = (visibility: 'private' | 'unlisted' | 'public') => {
    const newApproval: ApprovalRecord = {
      id: `app-${Date.now()}`,
      artifactId: selectedArtifactId,
      artifactTitle: `Episode ${selectedArtifactId} Motion Comic Render`,
      type: 'video',
      status: 'approved',
      approver: 'Studio Owner',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      notes: `Successfully uploaded via YouTube Data API v3 (${visibility} mode).`,
      youtubeUploadState: visibility === 'public' ? 'published' : 'private_uploaded',
      youtubeVideoId: 'dQw4w9WgXcQ'
    };

    const updated: Project = {
      ...project,
      approvals: [newApproval, ...project.approvals]
    };
    onUpdateProject(updated);
    setUploadModalOpen(false);
    setPublicConfirmationChecked(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2 text-amber-400 text-xs font-mono tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>GOVERNANCE & PUBLISHING SECURITY</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Approval Center & YouTube Publisher</h2>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Per platform safety rules, video uploads require explicit review and authorized OAuth connection. Videos default to Private/Unlisted during initial upload, and public release requires an extra dual-confirmation step.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {!isConnectedToYouTube ? (
            <button
              onClick={handleConnectYouTube}
              disabled={isConnectingOAuth}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors rounded-xl flex items-center gap-2 shadow-lg shadow-red-600/20"
            >
              <Youtube className="w-4 h-4" />
              <span>{isConnectingOAuth ? 'Connecting OAuth...' : 'Connect YouTube Account'}</span>
            </button>
          ) : (
            <div className="px-4 py-2 text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>YouTube Connected (@StudioCreator)</span>
            </div>
          )}
        </div>
      </div>

      {/* Rendered Video Preview & Upload Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Film className="w-5 h-5 text-cyan-400" />
              Rendered Motion Comic Artifacts
            </h3>
            <span className="text-xs font-mono text-slate-400">Ready for Review</span>
          </div>

          <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center group">
            <img
              src={project.coverImage}
              alt="Video Preview"
              className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-bold text-white">{project.title} - Final Motion Assembly</h4>
                  <p className="text-xs text-slate-300">Duration: 02:45 · 1080p 60FPS · Audio Track Synchronized</p>
                </div>
                <button
                  onClick={() => setUploadModalOpen(true)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors flex items-center gap-2 shadow-lg shadow-cyan-400/20"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload to YouTube</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Approval History */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-bold text-white">Approval Log</h3>
          <p className="text-xs text-slate-400">Audited decisions and security sign-offs.</p>

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
              <div className="py-8 text-center text-xs text-slate-500">
                No approval records yet. Upload an artifact to initiate review.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal with Dual Confirmation for Public Release */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 text-slate-100 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500">
                <Youtube className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">YouTube Upload Wizard</h3>
                <p className="text-xs text-slate-400">Secure API v3 Upload & Visibility Controls</p>
              </div>
            </div>

            {!isConnectedToYouTube ? (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-3">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  YouTube Account Not Connected
                </p>
                <p>Please connect your YouTube account above before initiating automated uploads.</p>
                <button
                  onClick={handleConnectYouTube}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-500 transition-colors"
                >
                  Connect Now
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Select Episode to Publish</label>
                  <select
                    value={selectedArtifactId}
                    onChange={(e) => setSelectedArtifactId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    {project.episodes.map((ep) => (
                      <option key={ep.id} value={ep.id}>
                        Episode {ep.episodeNumber}: {ep.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Publication Safety Rules</h4>
                  <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                    <li>Initial uploads default to <strong className="text-cyan-400">Private / Unlisted</strong>.</li>
                    <li>Public release requires explicit owner confirmation and approval sign-off.</li>
                    <li>All metadata and rights tags are verified before transmission.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/20 space-y-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={publicConfirmationChecked}
                      onChange={(e) => setPublicConfirmationChecked(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
                    />
                    <span className="text-xs text-slate-300">
                      I confirm that I own the rights to all visual and audio assets in this video, and I authorize publication.
                    </span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    onClick={() => setUploadModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSimulateUpload('private')}
                    className="px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-200 rounded-xl hover:bg-white transition-colors flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Upload Private / Unlisted</span>
                  </button>
                  <button
                    onClick={() => handleSimulateUpload('public')}
                    disabled={!publicConfirmationChecked}
                    className={`px-4 py-2 text-xs font-semibold text-white rounded-xl transition-colors flex items-center gap-1.5 ${
                      publicConfirmationChecked
                        ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/20'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Publish Publicly</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
