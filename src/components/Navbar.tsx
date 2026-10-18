import { BookOpen, Shield, Plus, Sparkles, HelpCircle, Film, FolderKanban, BarChart3 } from 'lucide-react';

interface NavbarProps {
  currentView: 'projects' | 'workspace' | 'approvals' | 'generator' | 'analytics';
  onNavigate: (view: 'projects' | 'workspace' | 'approvals' | 'generator' | 'analytics') => void;
  onOpenNewProject: () => void;
  onOpenGettingStarted: () => void;
  onOpenApiKey: () => void;
  activeProjectTitle?: string;
}

export function Navbar({
  currentView,
  onNavigate,
  onOpenNewProject,
  onOpenGettingStarted,
  onOpenApiKey,
  activeProjectTitle
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0B0F19]/90 backdrop-blur-md border-b border-slate-800/80">
      {/* Zone 1: Brand title */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => onNavigate('projects')}
          className="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-white block">
              MANHWA STUDIO
            </span>
            <span className="text-[10px] text-cyan-400 font-mono tracking-wider block">
              AI WEBTOON PIPELINE
            </span>
          </div>
        </button>

        {activeProjectTitle && currentView !== 'projects' && (
          <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-slate-800 text-xs text-slate-400">
            <span className="text-slate-600">/</span>
            <span className="font-medium text-slate-200 truncate max-w-[200px]">
              {activeProjectTitle}
            </span>
          </div>
        )}
      </div>

      {/* Zone 2: Navigation Links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
        <button
          onClick={() => onNavigate('projects')}
          className={`transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            currentView === 'projects' ? 'text-cyan-400 font-semibold' : 'hover:text-white'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          Projects
        </button>

        <button
          onClick={() => onNavigate('workspace')}
          className={`transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            currentView === 'workspace' ? 'text-cyan-400 font-semibold' : 'hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Story Bible & Scripts
        </button>

        <button
          onClick={() => onNavigate('analytics')}
          className={`transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            currentView === 'analytics' ? 'text-cyan-400 font-semibold' : 'hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Analytics
        </button>

        <button
          onClick={() => onNavigate('approvals')}
          className={`transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            currentView === 'approvals' ? 'text-cyan-400 font-semibold' : 'hover:text-white'
          }`}
        >
          <Film className="w-4 h-4" />
          Approval & YouTube
        </button>

        <button
          onClick={() => onNavigate('generator')}
          className={`transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            currentView === 'generator' ? 'text-cyan-400 font-semibold' : 'hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          AI Generator
        </button>
      </nav>

      {/* Zone 3: Primary Actions */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onOpenGettingStarted}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors"
          title="Getting Started Guide"
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        <button
          onClick={onOpenApiKey}
          className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 border bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
          title="Security & Persistence Policy"
        >
          <Shield className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">[Local Storage - Demo Mode]</span>
        </button>

        <button
          onClick={onOpenNewProject}
          className="px-4 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors flex items-center gap-1.5 shadow-lg shadow-cyan-400/20 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>
    </header>
  );
}
