import { useState } from 'react';
import { Project, Episode, Scene } from '../types/manhwa';
import { Film, Plus, Trash2, Sparkles, Download, Play, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

interface EpisodeScriptEditorProps {
  project: Project;
  onUpdateProject: (updated: Project) => void;
  onOpenAiGenerator: (promptContext: string, callback: (result: string) => void) => void;
}

export function EpisodeScriptEditor({ project, onUpdateProject, onOpenAiGenerator }: EpisodeScriptEditorProps) {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>(
    project.episodes[0]?.id || ''
  );
  const [expandedScenes, setExpandedScenes] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const currentEpisode = project.episodes.find((ep) => ep.id === selectedEpisodeId) || project.episodes[0];

  const handleAddEpisode = () => {
    const newEp: Episode = {
      id: `ep-${Date.now()}`,
      episodeNumber: project.episodes.length + 1,
      title: `Episode ${project.episodes.length + 1}: New Chapter`,
      synopsis: 'Summary of the upcoming episode events and turning points.',
      outline: ['Scene 1: Opening hook', 'Scene 2: Rising tension', 'Scene 3: Climax cliffhanger'],
      scenes: [
        {
          id: `s-${Date.now()}`,
          sceneNumber: 1,
          setting: 'Location - Time',
          action: 'Describe character actions and camera framing.',
          dialogue: 'Character: "Dialogue line here."',
          narration: 'Voiceover narration setting the tone.',
          sfx: '[SOUND EFFECT]',
          imagePrompt: 'Webtoon panel style, dramatic lighting, high contrast.'
        }
      ]
    };

    const updated: Project = {
      ...project,
      episodes: [...project.episodes, newEp]
    };
    onUpdateProject(updated);
    setSelectedEpisodeId(newEp.id);
  };

  const handleUpdateEpisodeField = (field: keyof Episode, value: any) => {
    if (!currentEpisode) return;
    const updatedEpisodes = project.episodes.map((ep) =>
      ep.id === currentEpisode.id ? { ...ep, [field]: value } : ep
    );
    onUpdateProject({ ...project, episodes: updatedEpisodes });
  };

  const handleAddScene = () => {
    if (!currentEpisode) return;
    const newScene: Scene = {
      id: `scene-${Date.now()}`,
      sceneNumber: currentEpisode.scenes.length + 1,
      setting: 'New Scene Location',
      action: 'Detailed visual choreography and character movement.',
      dialogue: 'Speaker: "Line."',
      narration: 'Atmospheric narrative text.',
      sfx: '[SFX]',
      imagePrompt: 'Webtoon style panel, sharp line art.'
    };
    const updatedScenes = [...currentEpisode.scenes, newScene];
    const updatedEpisodes = project.episodes.map((ep) =>
      ep.id === currentEpisode.id ? { ...ep, scenes: updatedScenes } : ep
    );
    onUpdateProject({ ...project, episodes: updatedEpisodes });
  };

  const handleUpdateScene = (sceneId: string, field: keyof Scene, value: any) => {
    if (!currentEpisode) return;
    const updatedScenes = currentEpisode.scenes.map((s) =>
      s.id === sceneId ? { ...s, [field]: value } : s
    );
    const updatedEpisodes = project.episodes.map((ep) =>
      ep.id === currentEpisode.id ? { ...ep, scenes: updatedScenes } : ep
    );
    onUpdateProject({ ...project, episodes: updatedEpisodes });
  };

  const handleDeleteScene = (sceneId: string) => {
    if (!currentEpisode) return;
    const updatedScenes = currentEpisode.scenes.filter((s) => s.id !== sceneId);
    const updatedEpisodes = project.episodes.map((ep) =>
      ep.id === currentEpisode.id ? { ...ep, scenes: updatedScenes } : ep
    );
    onUpdateProject({ ...project, episodes: updatedEpisodes });
  };

  const toggleSceneExpand = (id: string) => {
    setExpandedScenes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExportMarkdown = () => {
    if (!currentEpisode) return;
    let md = `# ${project.title} - ${currentEpisode.title}\n\n`;
    md += `**Synopsis:** ${currentEpisode.synopsis}\n\n`;
    md += `## Outline\n`;
    currentEpisode.outline.forEach((o, i) => {
      md += `${i + 1}. ${o}\n`;
    });
    md += `\n## Scenes\n`;
    currentEpisode.scenes.forEach((s) => {
      md += `### Scene ${s.sceneNumber}: ${s.setting}\n`;
      md += `* **Action:** ${s.action}\n`;
      md += `* **Dialogue:** ${s.dialogue}\n`;
      md += `* **Narration:** ${s.narration}\n`;
      md += `* **SFX:** ${s.sfx}\n`;
      md += `* **Image Prompt:** \`${s.imagePrompt}\`\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title}_${currentEpisode.title}.md`;
    a.click();
  };

  if (!currentEpisode) {
    return (
      <div className="py-12 text-center bg-[#111827] border border-slate-800 rounded-2xl">
        <Film className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-white mb-1">No Episodes Created</h3>
        <p className="text-xs text-slate-400 mb-4">Create your first episode script to begin scene breakdown.</p>
        <button
          onClick={handleAddEpisode}
          className="px-4 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Create Episode</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Episodes Header & Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3 overflow-x-auto pb-2 sm:pb-0">
          {project.episodes.map((ep) => (
            <button
              key={ep.id}
              onClick={() => setSelectedEpisodeId(ep.id)}
              className={`px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
                ep.id === currentEpisode.id
                  ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Episode {ep.episodeNumber}
            </button>
          ))}
          <button
            onClick={handleAddEpisode}
            className="px-3 py-2 text-xs font-semibold text-slate-400 bg-slate-900/60 border border-slate-800 hover:text-white rounded-xl transition-colors flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Episode</span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportMarkdown}
            className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900/80 border border-slate-800 rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Script (.md)</span>
          </button>

          <button
            onClick={() =>
              onOpenAiGenerator(
                `Generate 3 dramatic scene ideas for ${project.title} (${project.genre}) in Episode ${currentEpisode.episodeNumber}: ${currentEpisode.title}`,
                (result) => {
                  const updatedOutline = [...currentEpisode.outline, `AI Note: ${result.slice(0, 120)}`];
                  handleUpdateEpisodeField('outline', updatedOutline);
                }
              )
            }
            className="px-3 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors flex items-center gap-1.5 shadow-md shadow-cyan-400/20"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Assist Script</span>
          </button>
        </div>
      </div>

      {/* Episode Details Form */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Episode Title</label>
            <input
              type="text"
              value={currentEpisode.title}
              onChange={(e) => handleUpdateEpisodeField('title', e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm font-bold text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Episode Number</label>
            <input
              type="number"
              value={currentEpisode.episodeNumber}
              onChange={(e) => handleUpdateEpisodeField('episodeNumber', parseInt(e.target.value) || 1)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm font-bold text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Episode Synopsis</label>
          <textarea
            rows={2}
            value={currentEpisode.synopsis}
            onChange={(e) => handleUpdateEpisodeField('synopsis', e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none"
          />
        </div>
      </div>

      {/* Scene-by-Scene Breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Scene-by-Scene Breakdown</h3>
            <p className="text-xs text-slate-400">Manage panel settings, dialogues, narrative voiceovers, and image prompts.</p>
          </div>
          <button
            onClick={handleAddScene}
            className="px-4 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors flex items-center gap-1.5 shadow-md shadow-cyan-400/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Scene</span>
          </button>
        </div>

        <div className="space-y-4">
          {currentEpisode.scenes.map((scene, idx) => {
            const isExpanded = expandedScenes[scene.id] ?? true;
            return (
              <div
                key={scene.id}
                className="bg-[#111827] border border-slate-800 rounded-2xl overflow-hidden transition-all"
              >
                {/* Scene Header */}
                <div
                  onClick={() => toggleSceneExpand(scene.id)}
                  className="flex items-center justify-between px-6 py-4 bg-slate-900/60 border-b border-slate-800/80 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-white">Scene {scene.sceneNumber}: {scene.setting}</h4>
                      <p className="text-[11px] text-slate-400 truncate max-w-md">{scene.action}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteScene(scene.id);
                      }}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete Scene"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {/* Scene Body */}
                {isExpanded && (
                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Setting / Location</label>
                        <input
                          type="text"
                          value={scene.setting}
                          onChange={(e) => handleUpdateScene(scene.id, 'setting', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Sound Effects (SFX)</label>
                        <input
                          type="text"
                          value={scene.sfx}
                          onChange={(e) => handleUpdateScene(scene.id, 'sfx', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Visual Action & Choreography</label>
                      <textarea
                        rows={2}
                        value={scene.action}
                        onChange={(e) => handleUpdateScene(scene.id, 'action', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Dialogue</label>
                        <textarea
                          rows={2}
                          value={scene.dialogue}
                          onChange={(e) => handleUpdateScene(scene.id, 'dialogue', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">Voiceover Narration</label>
                        <textarea
                          rows={2}
                          value={scene.narration}
                          onChange={(e) => handleUpdateScene(scene.id, 'narration', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-mono text-cyan-400 uppercase">AI Panel Image Prompt</label>
                        <button
                          onClick={() =>
                            onOpenAiGenerator(
                              `Refine and expand this image prompt for a webtoon panel: ${scene.imagePrompt} in setting: ${scene.setting}`,
                              (res) => handleUpdateScene(scene.id, 'imagePrompt', res)
                            )
                          }
                          className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Enhance Prompt</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={scene.imagePrompt}
                        onChange={(e) => handleUpdateScene(scene.id, 'imagePrompt', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
