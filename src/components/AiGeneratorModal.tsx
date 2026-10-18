import { useState } from 'react';
import { X, Sparkles, Wand2, Check, ShieldAlert } from 'lucide-react';

interface AiGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt: string;
  onSuccess: (result: string) => void;
}

export function AiGeneratorModal({ isOpen, onClose, initialPrompt, onSuccess }: AiGeneratorModalProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState('');

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult('');

    try {
      // Robust Sandbox Simulation (secure server-side proxy required for live calls)
      await new Promise((r) => setTimeout(r, 1200));
      setResult(
        `[Sandbox Demo Mode - Backend AI Not Configured]\n\n- Panel 1: Wide cinematic establishing shot with dramatic lighting and high-contrast ink lines.\n- Panel 2: Close-up on the protagonist's eyes with electric cyan glow and speed lines.\n- Dialogue: "There is no turning back now. The system has already locked our coordinates."\n- Action SFX: [CRASH] [SYSTEM OVERLOAD]`
      );
    } catch (err: any) {
      setResult(`Error during simulation: ${err.message || 'Unknown error'}.`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 text-slate-100 space-y-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Wand2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">AI Studio Generator</h3>
            <p className="text-xs text-amber-400 font-mono flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              SANDBOX DEMO MODE (BACKEND PROXY NOT CONFIGURED)
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Prompt Instructions</label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-5 py-2.5 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors flex items-center gap-2 shadow-lg shadow-cyan-400/20 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isGenerating ? 'Simulating...' : 'Run Sandbox Generation'}</span>
            </button>
          </div>

          {result && (
            <div className="space-y-2 pt-4 border-t border-slate-800 animate-fadeIn">
              <label className="block text-xs font-mono text-cyan-400 uppercase">Simulated Output</label>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 whitespace-pre-wrap max-h-60 overflow-y-auto">
                {result}
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    onSuccess(result);
                    onClose();
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Accept & Insert into Project</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
