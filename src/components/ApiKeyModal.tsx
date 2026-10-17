import { useState } from 'react';
import { X, Key, ShieldCheck, Check } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
}

export function ApiKeyModal({ isOpen, onClose, apiKey, onSaveApiKey }: ApiKeyModalProps) {
  const [keyInput, setKeyInput] = useState(apiKey);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveApiKey(keyInput.trim());
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 600);
  };

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
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Gemini API Key Settings</h3>
            <p className="text-xs text-slate-400">Configure your runtime API key for live AI generation</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">GEMINI_API_KEY</label>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Your key stays in your browser session and is never stored on public servers. Leave blank to use Sandbox Mode.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-xs text-slate-300">
              {keyInput ? 'Live API mode enabled with provided key.' : 'Currently running in robust offline Sandbox Simulation mode.'}
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors flex items-center gap-1.5 shadow-lg shadow-cyan-400/20"
            >
              {saved ? <Check className="w-4 h-4" /> : <Key className="w-4 h-4" />}
              <span>{saved ? 'Saved!' : 'Save Key'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
