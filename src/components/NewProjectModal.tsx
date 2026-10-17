import { useState } from 'react';
import { X, Sparkles, Film } from 'lucide-react';
import { Project } from '../types/manhwa';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (project: Project) => void;
}

export function NewProjectModal({ isOpen, onClose, onCreateProject }: NewProjectModalProps) {
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('Cyberpunk Action / Thriller');
  const [synopsis, setSynopsis] = useState('');
  const [artStyle, setArtStyle] = useState('Modern Dark Webtoon (Neon cyan & violet accents)');
  const [author, setAuthor] = useState('Studio Author');
  const [targetAudience, setTargetAudience] = useState('18-35 Seinen');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newProj: Project = {
      id: `proj-${Date.now()}`,
      title,
      genre,
      synopsis: synopsis || 'A gripping new webtoon series ready for production.',
      artStyle,
      status: 'draft',
      updatedAt: new Date().toISOString().split('T')[0],
      coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
      author,
      targetAudience,
      storyBible: {
        premise: synopsis || 'Enter the uncharted world and forge your destiny.',
        logline: 'The ultimate battle for survival and power begins.',
        worldRules: [
          { id: 'r1', rule: 'Core rule 1: Establish the primary energy or power system.' },
          { id: 'r2', rule: 'Core rule 2: Define faction boundaries and societal hierarchy.' }
        ],
        characters: [
          {
            id: 'c1',
            name: 'Protagonist',
            role: 'Lead Hero',
            description: 'Determined hero with a mysterious past and unique awakened ability.',
            visualAnchor: 'Distinctive glowing signature accessory or eye scar',
            personality: 'Resolute, intelligent, and driven.'
          }
        ],
        terminology: [
          { id: 't1', term: 'Main Faction', definition: 'The governing force of the world.' }
        ]
      },
      episodes: [
        {
          id: `ep-${Date.now()}`,
          episodeNumber: 1,
          title: 'Episode 1: The Awakening',
          synopsis: 'Introduction to the world and the inciting incident.',
          outline: ['Scene 1: Opening hook', 'Scene 2: Inciting clash'],
          scenes: [
            {
              id: `s-${Date.now()}`,
              sceneNumber: 1,
              setting: 'Opening Sector - Dawn',
              action: 'The protagonist surveys the sprawling skyline.',
              dialogue: 'Hero: "This is where everything changes."',
              narration: 'Every great saga starts with a single step into the unknown.',
              sfx: '[WIND HOWLING]',
              imagePrompt: 'Webtoon panel style, cinematic sunrise over futuristic metropolis, dramatic lighting.'
            }
          ]
        }
      ],
      approvals: []
    };

    onCreateProject(newProj);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Create New Manhwa Project</h2>
            <p className="text-xs text-cyan-400 font-mono">ESTABLISH NEW SERIES BIBLE & PIPELINE</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Series Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Neon Horizon"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Genre</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
              >
                <option value="Cyberpunk Action / Thriller">Cyberpunk Action / Thriller</option>
                <option value="Dark Fantasy / Dungeon RPG">Dark Fantasy / Dungeon RPG</option>
                <option value="Modern Urban Romance / Drama">Modern Urban Romance / Drama</option>
                <option value="Supernatural Action / Shonen">Supernatural Action / Shonen</option>
                <option value="Sci-Fi Space Opera">Sci-Fi Space Opera</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Target Audience</label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Art Style & Aesthetic</label>
            <input
              type="text"
              value={artStyle}
              onChange={(e) => setArtStyle(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Series Synopsis / Premise</label>
            <textarea
              rows={3}
              required
              placeholder="Summarize the core premise, inciting incident, and stakes..."
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors flex items-center gap-1.5 shadow-lg shadow-cyan-400/20"
            >
              <Sparkles className="w-4 h-4" />
              <span>Initialize Project Bible</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
