import { X, BookOpen, Sparkles, Film, ShieldCheck, Play, ArrowRight } from 'lucide-react';

interface GettingStartedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGetStarted: () => void;
}

export function GettingStartedModal({ isOpen, onClose, onGetStarted }: GettingStartedModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Film className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              Welcome to Manhwa Studio
            </h2>
            <p className="text-xs text-cyan-400 font-mono">
              GETTING STARTED & CORE WORKFLOW GUIDE
            </p>
          </div>
        </div>

        <div className="space-y-6 text-sm text-slate-300">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <h3 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              What is Manhwa Studio?
            </h3>
            <p className="leading-relaxed text-slate-300">
              Manhwa Studio is an AI-powered production pipeline designed to take your comic concept from a raw premise to a structured Story Bible, scene-by-scene script breakdown, and final motion comic approval. Whether you are building a Cyberpunk thriller or a Dark Fantasy dungeon epic, this workspace keeps your creative canon consistent and professional.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-5 h-5 text-cyan-400" />
                <h4 className="font-semibold text-white">1. Story Bible & Universe</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Define your series premise, logline, strict world rules, character continuity profiles (with visual anchors), and glossary terminology to prevent plot holes.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <Film className="w-5 h-5 text-violet-400" />
                <h4 className="font-semibold text-white">2. Episode Scripts & Scenes</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Plan episode outlines and breakdown individual scenes into Action, Dialogue, Narration, SFX, and AI Image prompts optimized for panel generation.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h4 className="font-semibold text-white">3. AI Studio Generator</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Preview the demo generator. It shows fixed example text only: no AI backend is connected, prompts are never sent anywhere, and sample output cannot be inserted into a project.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                <h4 className="font-semibold text-white">4. Approval & YouTube Publisher</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Review approval records stored in this browser's local project data. YouTube publishing is not connected in this build: there is no server-side OAuth, no upload path, and no rendered video yet.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 to-violet-950/40 border border-cyan-500/20">
            <h4 className="text-xs font-mono text-cyan-400 uppercase tracking-wider mb-1">
              Quick Start Tip
            </h4>
            <p className="text-xs text-slate-300">
              We have preloaded two fully realized sample projects (<strong className="text-white">Cyber Awakening: Neo Seoul</strong> and <strong className="text-white">Shadow Monarch Chronicles</strong>) for you to explore immediately. Click below to dive right in!
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            Close Guide
          </button>
          <button
            onClick={() => {
              onClose();
              onGetStarted();
            }}
            className="px-5 py-2.5 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors flex items-center gap-2 shadow-lg shadow-cyan-400/20"
          >
            <span>Explore Projects</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
