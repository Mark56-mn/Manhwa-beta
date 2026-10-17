import { useState } from 'react';
import { Project, Character, WorldRule, TerminologyItem } from '../types/manhwa';
import { BookOpen, Users, Globe, FileText, Plus, Trash2, Edit3, Save, Sparkles } from 'lucide-react';

interface StoryBibleEditorProps {
  project: Project;
  onUpdateProject: (updated: Project) => void;
  onOpenAiGenerator: (promptContext: string, callback: (result: string) => void) => void;
}

export function StoryBibleEditor({ project, onUpdateProject, onOpenAiGenerator }: StoryBibleEditorProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'characters' | 'rules' | 'terminology'>('overview');
  const [premise, setPremise] = useState(project.storyBible.premise);
  const [logline, setLogline] = useState(project.storyBible.logline);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveOverview = () => {
    setIsSaving(true);
    const updated: Project = {
      ...project,
      storyBible: {
        ...project.storyBible,
        premise,
        logline
      },
      updatedAt: new Date().toISOString().split('T')[0]
    };
    onUpdateProject(updated);
    setTimeout(() => setIsSaving(false), 600);
  };

  const handleAddCharacter = () => {
    const newChar: Character = {
      id: `char-${Date.now()}`,
      name: 'New Character',
      role: 'Supporting Role',
      description: 'Describe physical appearance, attire, and background.',
      visualAnchor: 'Signature hair color or clothing mark',
      personality: 'Determined and complex.'
    };
    const updated: Project = {
      ...project,
      storyBible: {
        ...project.storyBible,
        characters: [...project.storyBible.characters, newChar]
      }
    };
    onUpdateProject(updated);
  };

  const handleUpdateCharacter = (id: string, field: keyof Character, value: string) => {
    const updatedChars = project.storyBible.characters.map((c) =>
      c.id === id ? { ...c, [field]: value } : c
    );
    const updated: Project = {
      ...project,
      storyBible: { ...project.storyBible, characters: updatedChars }
    };
    onUpdateProject(updated);
  };

  const handleDeleteCharacter = (id: string) => {
    const updatedChars = project.storyBible.characters.filter((c) => c.id !== id);
    const updated: Project = {
      ...project,
      storyBible: { ...project.storyBible, characters: updatedChars }
    };
    onUpdateProject(updated);
  };

  const handleAddRule = () => {
    const newRule: WorldRule = {
      id: `rule-${Date.now()}`,
      rule: 'New world building rule or law of physics.'
    };
    const updated: Project = {
      ...project,
      storyBible: {
        ...project.storyBible,
        worldRules: [...project.storyBible.worldRules, newRule]
      }
    };
    onUpdateProject(updated);
  };

  const handleUpdateRule = (id: string, ruleText: string) => {
    const updatedRules = project.storyBible.worldRules.map((r) =>
      r.id === id ? { ...r, rule: ruleText } : r
    );
    const updated: Project = {
      ...project,
      storyBible: { ...project.storyBible, worldRules: updatedRules }
    };
    onUpdateProject(updated);
  };

  const handleDeleteRule = (id: string) => {
    const updatedRules = project.storyBible.worldRules.filter((r) => r.id !== id);
    const updated: Project = {
      ...project,
      storyBible: { ...project.storyBible, worldRules: updatedRules }
    };
    onUpdateProject(updated);
  };

  const handleAddTerm = () => {
    const newTerm: TerminologyItem = {
      id: `term-${Date.now()}`,
      term: 'New Term',
      definition: 'Definition of in-universe technology, magic, or faction.'
    };
    const updated: Project = {
      ...project,
      storyBible: {
        ...project.storyBible,
        terminology: [...project.storyBible.terminology, newTerm]
      }
    };
    onUpdateProject(updated);
  };

  const handleUpdateTerm = (id: string, field: 'term' | 'definition', value: string) => {
    const updatedTerms = project.storyBible.terminology.map((t) =>
      t.id === id ? { ...t, [field]: value } : t
    );
    const updated: Project = {
      ...project,
      storyBible: { ...project.storyBible, terminology: updatedTerms }
    };
    onUpdateProject(updated);
  };

  const handleDeleteTerm = (id: string) => {
    const updatedTerms = project.storyBible.terminology.filter((t) => t.id !== id);
    const updated: Project = {
      ...project,
      storyBible: { ...project.storyBible, terminology: updatedTerms }
    };
    onUpdateProject(updated);
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
              : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          Premise & Logline
        </button>

        <button
          onClick={() => setActiveTab('characters')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'characters'
              ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
              : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          Characters ({project.storyBible.characters.length})
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'rules'
              ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
              : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Globe className="w-4 h-4" />
          World Rules ({project.storyBible.worldRules.length})
        </button>

        <button
          onClick={() => setActiveTab('terminology')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'terminology'
              ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
              : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Terminology ({project.storyBible.terminology.length})
        </button>
      </div>

      {/* Tab 1: Premise & Logline */}
      {activeTab === 'overview' && (
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Series Universe & Canon</h3>
              <p className="text-xs text-slate-400">Establish the high-level premise and logline for your manhwa series.</p>
            </div>

            <button
              onClick={() =>
                onOpenAiGenerator(
                  `Expand this manhwa premise for "${project.title}" (${project.genre}): ${premise}`,
                  (result) => setPremise(result)
                )
              }
              className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Expand Premise</span>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Logline (One sentence hook)</label>
              <input
                type="text"
                value={logline}
                onChange={(e) => setLogline(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Detailed Premise & Lore</label>
              <textarea
                rows={6}
                value={premise}
                onChange={(e) => setPremise(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors leading-relaxed resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              onClick={handleSaveOverview}
              className="px-5 py-2.5 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors flex items-center gap-2 shadow-lg shadow-cyan-400/20"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saved!' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Characters */}
      {activeTab === 'characters' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Character Continuity Anchors</h3>
              <p className="text-xs text-slate-400">Define appearance, visual anchor details, and personality for consistent panel rendering.</p>
            </div>
            <button
              onClick={handleAddCharacter}
              className="px-4 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors flex items-center gap-1.5 shadow-md shadow-cyan-400/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Character</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {project.storyBible.characters.map((char) => (
              <div key={char.id} className="bg-[#111827] border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={char.name}
                    onChange={(e) => handleUpdateCharacter(char.id, 'name', e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-bold text-white focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={() => handleDeleteCharacter(char.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">Role</label>
                    <input
                      type="text"
                      value={char.role}
                      onChange={(e) => handleUpdateCharacter(char.id, 'role', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono text-cyan-400 mb-1">Visual Anchor</label>
                    <input
                      type="text"
                      value={char.visualAnchor}
                      onChange={(e) => handleUpdateCharacter(char.id, 'visualAnchor', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={char.description}
                    onChange={(e) => handleUpdateCharacter(char.id, 'description', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">Personality</label>
                  <input
                    type="text"
                    value={char.personality}
                    onChange={(e) => handleUpdateCharacter(char.id, 'personality', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: World Rules */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">World Rules & Laws</h3>
              <p className="text-xs text-slate-400">Establish the immutable physical, magical, or technological laws governing your universe.</p>
            </div>
            <button
              onClick={handleAddRule}
              className="px-4 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors flex items-center gap-1.5 shadow-md shadow-cyan-400/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Rule</span>
            </button>
          </div>

          <div className="space-y-3">
            {project.storyBible.worldRules.map((rule, idx) => (
              <div key={rule.id} className="flex items-center gap-3 bg-[#111827] border border-slate-800 rounded-xl p-4">
                <span className="text-xs font-mono text-cyan-400 font-bold shrink-0">#{idx + 1}</span>
                <input
                  type="text"
                  value={rule.rule}
                  onChange={(e) => handleUpdateRule(rule.id, e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Terminology */}
      {activeTab === 'terminology' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Terminology Glossary</h3>
              <p className="text-xs text-slate-400">Define special tech, locations, artifacts, or factions mentioned in your scripts.</p>
            </div>
            <button
              onClick={handleAddTerm}
              className="px-4 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors flex items-center gap-1.5 shadow-md shadow-cyan-400/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Term</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {project.storyBible.terminology.map((item) => (
              <div key={item.id} className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={item.term}
                    onChange={(e) => handleUpdateTerm(item.id, 'term', e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={() => handleDeleteTerm(item.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={item.definition}
                  onChange={(e) => handleUpdateTerm(item.id, 'definition', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
