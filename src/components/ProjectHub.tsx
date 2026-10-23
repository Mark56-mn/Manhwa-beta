import { useState } from 'react';
import { Project } from '../types/manhwa';
import { CloudWorkspacePanel } from './CloudWorkspacePanel';
import { Plus, Search, BookOpen, Film, Calendar, Users, ArrowRight, Sparkles, Trash2 } from 'lucide-react';

interface ProjectHubProps {
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onOpenNewProject: () => void;
  onDeleteProject: (id: string) => void;
}

export function ProjectHub({
  projects,
  activeProjectId,
  onSelectProject,
  onOpenNewProject,
  onDeleteProject
}: ProjectHubProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('All');

  const genres = ['All', ...new Set(projects.map((p) => p.genre))];

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.synopsis.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGenre = genreFilter === 'All' || p.genre === genreFilter;
    return matchesSearch && matchesGenre;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      {/* Hero Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-2 text-cyan-400 text-xs font-mono tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>MANHWA PRODUCTION HUB</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-2">
            Your Creative Universe
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl">
            Manage your webtoon series, build airtight story bibles, and draft episode scripts. The projects below are stored in this browser only; the shared workspace above is server-backed. AI generation, video rendering, and publishing are not connected in this build.
          </p>
        </div>

        <button
          onClick={onOpenNewProject}
          className="px-5 py-3 text-sm font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors flex items-center justify-center gap-2 shadow-xl shadow-cyan-400/20 shrink-0"
        >
          <Plus className="w-5 h-5" />
          <span>Create New Project</span>
        </button>
      </div>

      {/* Server-backed workflow (authoritative API) */}
      <CloudWorkspacePanel />

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search projects by title or premise..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
          {genres.map((genre) => (
            <button
              key={genre}
              onClick={() => setGenreFilter(genre)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                genreFilter === genre
                  ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.map((project) => {
          const isActive = project.id === activeProjectId;
          return (
            <div
              key={project.id}
              className={`group relative bg-[#111827] border rounded-2xl overflow-hidden transition-all duration-300 flex flex-col ${
                isActive
                  ? 'border-cyan-500 shadow-xl shadow-cyan-500/10'
                  : 'border-slate-800 hover:border-slate-700 hover:shadow-lg'
              }`}
            >
              {/* Cover Image */}
              <div className="relative h-48 overflow-hidden bg-slate-900">
                <img
                  src={project.coverImage}
                  alt={project.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-80"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111827] via-transparent to-transparent" />

                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <span className="px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider bg-slate-900/90 backdrop-blur-md border border-slate-700 text-cyan-400 rounded-full">
                    {project.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="absolute bottom-3 left-3">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-cyan-500/20 backdrop-blur-md border border-cyan-500/30 text-cyan-300">
                    {project.genre}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors mb-2">
                    {project.title}
                  </h3>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
                    {project.synopsis}
                  </p>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                      {project.storyBible.characters.length} Characters
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5 text-violet-400" />
                      {project.episodes.length} Episodes
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      onClick={() => onSelectProject(project.id)}
                      className="flex-1 px-4 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-cyan-400/20"
                    >
                      <span>Open Workspace</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onDeleteProject(project.id)}
                      className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                      title="Delete Project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredProjects.length === 0 && (
          <div className="col-span-full py-16 text-center bg-[#111827] border border-slate-800 rounded-2xl">
            <Film className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-white mb-1">No projects found</h3>
            <p className="text-xs text-slate-400 mb-6">
              Try adjusting your search or create a new manhwa project to begin.
            </p>
            <button
              onClick={onOpenNewProject}
              className="px-4 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Project</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
