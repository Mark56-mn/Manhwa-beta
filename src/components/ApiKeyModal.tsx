import { X, Key, ShieldCheck, Lock } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeyModal({ isOpen, onClose }: ApiKeyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 text-slate-100 space-y-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Security & API Configuration</h3>
            <p className="text-xs text-slate-400">Server-side provider architecture</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
            <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Secure Client Policy
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              To protect customer credentials in this multi-tenant SaaS application, client-side API key storage and direct browser execution have been disabled. All AI provider requests must route securely through authenticated server-side proxies.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 flex items-center gap-3">
            <Key className="w-5 h-5 text-cyan-400 shrink-0" />
            <p className="text-xs text-slate-300">
              Currently operating in <strong className="text-white">Sandbox Demo Mode</strong> with intelligent mock generation.
            </p>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors shadow-lg shadow-cyan-400/20"
            >
              Understood
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
