import { useState, useEffect } from 'react';
import { Project } from './types/manhwa';
import { INITIAL_PROJECTS } from './data/mockProjects';
import { Navbar } from './components/Navbar';
import { GettingStartedModal } from './components/GettingStartedModal';
import { ProjectHub } from './components/ProjectHub';
import { NewProjectModal } from './components/NewProjectModal';
import { StoryBibleEditor } from './components/StoryBibleEditor';
import { EpisodeScriptEditor } from './components/EpisodeScriptEditor';
import { ApprovalCenter } from './components/ApprovalCenter';
import { AiGeneratorModal } from './components/AiGeneratorModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { BookOpen, Film, Sparkles, ArrowLeft, FolderKanban, ShieldCheck } from 'lucide-react';

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('manhwa_studio_projects');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved projects', e);
      }
    }
    return INITIAL_PROJECTS;
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(projects[0]?.id || 'proj-1');
  const [currentView, setCurrentView] = useState<'projects' | 'workspace' | 'approvals' | 'generator'>('projects');
  const [workspaceTab, setWorkspaceTab] = useState<'bible' | 'scripts'>('bible');

  // Modals state
  const [isGettingStartedOpen, setIsGettingStartedOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isApiKeyOpen, setIsApiKeyOpen] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('manhwa_gemini_key') || '');

  // AI Modal state
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPromptContext, setAiPromptContext] = useState('');
  const [aiCallback, setAiCallback] = useState<(res: string) => void>(() => {});

  useEffect(() => {
    localStorage.setItem('manhwa_studio_projects', JSON.stringify(projects));
  }, [projects]);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  const handleUpdateProject = (updatedProject: Project) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === updatedProject.id ? updatedProject : p))
    );
  };

  const handleCreateProject = (newProj: Project) => {
    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(newProj.id);
    setCurrentView('workspace');
  };

  const handleDeleteProject = (id: string) => {
    if (projects.length <= 1) {
      alert('You must keep at least one project in the studio.');
      return;
    }
    if (confirm('Are you sure you want to delete this project?')) {
      const remaining = projects.filter((p) => p.id !== id);
      setProjects(remaining);
      if (activeProjectId === id) {
        setActiveProjectId(remaining[0].id);
      }
    }
  };

  const handleOpenAiGenerator = (context: string, callback: (res: string) => void) => {
    setAiPromptContext(context);
    setAiCallback(() => callback);
    setIsAiModalOpen(true);
  };

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('manhwa_gemini_key', key);
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-black">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        onNavigate={(view) => setCurrentView(view)}
        onOpenNewProject={() => setIsNewProjectOpen(true)}
        onOpenGettingStarted={() => setIsGettingStartedOpen(true)}
        onOpenApiKey={() => setIsApiKeyOpen(true)}
        hasApiKey={Boolean(apiKey && apiKey.length > 5)}
        activeProjectTitle={activeProject?.title}
      />

      {/* Main Content Viewport */}
      <main className="flex-1">
        {currentView === 'projects' && (
          <ProjectHub
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={(id) => {
              setActiveProjectId(id);
              setCurrentView('workspace');
            }}
            onOpenNewProject={() => setIsNewProjectOpen(true)}
            onDeleteProject={handleDeleteProject}
          />
        )}

        {currentView === 'workspace' && activeProject && (
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">
            {/* Workspace Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentView('projects')}
                  className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
                  title="Back to Projects"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
                    <span>{activeProject.genre}</span>
                    <span>·</span>
                    <span>{activeProject.artStyle.split(' ')[0]}</span>
                  </div>
                  <h1 className="text-2xl md:text-3xl font-extrabold text-white">
                    {activeProject.title}
                  </h1>
                </div>
              </div>

              {/* Workspace Main Tab Switcher */}
              <div className="flex items-center gap-2 p-1 bg-slate-900/80 border border-slate-800 rounded-2xl">
                <button
                  onClick={() => setWorkspaceTab('bible')}
                  className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all ${
                    workspaceTab === 'bible'
                      ? 'bg-cyan-500 text-slate-900 shadow-md shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Story Bible</span>
                </button>

                <button
                  onClick={() => setWorkspaceTab('scripts')}
                  className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all ${
                    workspaceTab === 'scripts'
                      ? 'bg-cyan-500 text-slate-900 shadow-md shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Film className="w-4 h-4" />
                  <span>Episode Scripts</span>
                </button>
              </div>
            </div>

            {/* Workspace Tab Contents */}
            {workspaceTab === 'bible' ? (
              <StoryBibleEditor
                project={activeProject}
                onUpdateProject={handleUpdateProject}
                onOpenAiGenerator={handleOpenAiGenerator}
              />
            ) : (
              <EpisodeScriptEditor
                project={activeProject}
                onUpdateProject={handleUpdateProject}
                onOpenAiGenerator={handleOpenAiGenerator}
              />
            )}
          </div>
        )}

        {currentView === 'approvals' && activeProject && (
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
            <ApprovalCenter project={activeProject} onUpdateProject={handleUpdateProject} />
          </div>
        )}

        {currentView === 'generator' && (
          <div className="max-w-4xl mx-auto px-4 md:px-8 py-12 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center mx-auto shadow-xl shadow-cyan-500/20">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">AI Studio Prompt Workbench</h2>
              <p className="text-sm text-slate-400 max-w-lg mx-auto">
                Generate custom series lore, character backstories, episode twists, or storyboard panels instantly using Gemini AI or robust sandbox simulation.
              </p>
            </div>
            <button
              onClick={() =>
                handleOpenAiGenerator(
                  `Brainstorm an epic plot twist and character arc for a manhwa series.`,
                  (res) => {
                    alert('Generated content ready! You can apply it to your project.');
                  }
                )
              }
              className="px-6 py-3 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors inline-flex items-center gap-2 shadow-lg shadow-cyan-400/20"
            >
              <Sparkles className="w-4 h-4" />
              <span>Launch Prompt Workbench</span>
            </button>
          </div>
        )}
      </main>

      {/* Modals */}
      <GettingStartedModal
        isOpen={isGettingStartedOpen}
        onClose={() => setIsGettingStartedOpen(false)}
        onGetStarted={() => setCurrentView('projects')}
      />

      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onCreateProject={handleCreateProject}
      />

      <ApiKeyModal
        isOpen={isApiKeyOpen}
        onClose={() => setIsApiKeyOpen(false)}
        apiKey={apiKey}
        onSaveApiKey={handleSaveApiKey}
      />

      <AiGeneratorModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        initialPrompt={aiPromptContext}
        onSuccess={aiCallback}
        apiKey={apiKey}
      />
    </div>
  );
}
