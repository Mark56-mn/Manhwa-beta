import { useState } from 'react';
import { X, Sparkles, Wand2, ShieldAlert } from 'lucide-react';

interface AiGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt: string;
}

export function AiGeneratorModal({ isOpen, onClose, initialPrompt }: AiGeneratorModalProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState('');

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult('');
    try {
      // This is intentionally a fixed sample, not a real model response.
      await new Promise((resolve) => setTimeout(resolve, 500));
      setResult(
        'DEMO SAMPLE ONLY — your prompt was not sent to an AI model.\n\n' +
        'Example panel: Wide cinematic establishing shot with dramatic lighting and high-contrast ink lines.\n' +
        'Example close-up: The protagonist looks toward the approaching danger.\n' +
        'Example dialogue: “There is no turning back now.”\n\n' +
        'No story, image, audio, or video asset has been generated.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 text-slate-100 space-y-6">
        <button
          onClick={onClose}
          aria-label="Close demo generator"
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
              DEMO ONLY — AI BACKEND NOT CONNECTED
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-sm text-amber-100">
          This preview uses fixed example text. Your prompt is not sent anywhere, and this sample cannot be inserted into your project.
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Prompt (preview only)</label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
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
              <span>{isGenerating ? 'Loading sample…' : 'Show Demo Sample'}</span>
            </button>
          </div>

          {result && (
            <div className="space-y-2 pt-4 border-t border-slate-800 animate-fadeIn">
              <label className="block text-xs font-mono text-amber-400 uppercase">Non-persistent demo sample</label>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 whitespace-pre-wrap max-h-60 overflow-y-auto">
                {result}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
