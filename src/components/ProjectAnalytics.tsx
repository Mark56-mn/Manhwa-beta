import { Project } from '../types/manhwa';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { BarChart3, Users, Film, CheckCircle } from 'lucide-react';

interface ProjectAnalyticsProps {
  project: Project;
}

export function ProjectAnalytics({ project }: ProjectAnalyticsProps) {
  // These counts are calculated from the project's current browser-side data.
  // They are content counts, not production telemetry or cloud-synced metrics.
  const totalEpisodes = project.episodes.length;
  const totalScenes = project.episodes.reduce((total, episode) => total + episode.scenes.length, 0);
  const totalCharacters = project.storyBible.characters.length;

  const episodeSceneData = project.episodes.map((episode) => ({
    name: `Ep ${episode.episodeNumber}`,
    scenes: episode.scenes.length,
    title: episode.title,
  }));

  const characterRoleData = project.storyBible.characters.reduce<Array<{ name: string; value: number }>>(
    (roles, character) => {
      const role = roles.find((item) => item.name === character.role);
      if (role) role.value += 1;
      else roles.push({ name: character.role || 'Unspecified', value: 1 });
      return roles;
    },
    [],
  );

  const colors = ['#22d3ee', '#a855f7', '#3b82f6', '#ec4899', '#10b981'];

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-2 mb-2 text-cyan-400 text-xs font-mono tracking-wider">
          <BarChart3 className="w-4 h-4" />
          <span>PROJECT CONTENT ANALYTICS</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{project.title} — Content Overview</h2>
        <p className="text-xs text-slate-400 max-w-xl">
          Counts below are calculated from this project’s current browser-local data. They are not cloud telemetry,
          AI generation status, video-rendering progress, or publishing status.
        </p>
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
          <p className="text-sm font-semibold text-amber-200">Production integrations: Not connected</p>
          <p className="mt-1 text-xs text-slate-300">
            This build has no verified live AI provider, image/audio generator, video-rendering worker, cloud database,
            or YouTube publishing connection. The app must not report those operations as complete.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Episodes" value={totalEpisodes} caption="Episodes saved in this project" icon={<Film className="w-4 h-4 text-cyan-400" />} />
        <StatCard label="Total Scenes" value={totalScenes} caption="Scenes saved in episode data" icon={<BarChart3 className="w-4 h-4 text-violet-400" />} />
        <StatCard label="Characters" value={totalCharacters} caption="Character entries in the Story Bible" icon={<Users className="w-4 h-4 text-emerald-400" />} />
        <StatCard label="Approval Records" value={project.approvals.length} caption="Records in local project data; not proof of publication" icon={<CheckCircle className="w-4 h-4 text-amber-400" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-white">Scenes per Episode</h3>
            <p className="text-xs text-slate-400">Actual scene counts in the current project data.</p>
          </div>
          <div className="h-64 w-full pt-4">
            {episodeSceneData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={episodeSceneData}>
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                  <Bar dataKey="scenes" name="Scenes" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChartMessage>No episodes are stored in this project yet.</EmptyChartMessage>}
          </div>
        </section>

        <section className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-white">Character Role Distribution</h3>
            <p className="text-xs text-slate-400">Actual character entries grouped by their saved narrative role.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="h-48 w-full flex items-center justify-center">
              {characterRoleData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={characterRoleData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                      {characterRoleData.map((entry, index) => (
                        <Cell key={entry.name} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyChartMessage>No characters are stored yet.</EmptyChartMessage>}
            </div>
            <div className="md:col-span-2 space-y-3">
              {characterRoleData.map((role, index) => (
                <div key={role.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                    <span className="text-xs font-medium text-white">{role.name}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-cyan-400">{role.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, caption, icon }: { label: string; value: number; caption: string; icon: React.ReactNode }) {
  return (
    <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 space-y-1">
      <div className="flex items-center justify-between text-slate-400">
        <span className="text-xs font-medium">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <p className="text-[11px] text-slate-500">{caption}</p>
    </div>
  );
}

function EmptyChartMessage({ children }: { children: React.ReactNode }) {
  return <div className="h-full w-full flex items-center justify-center text-center text-xs text-slate-500 px-4">{children}</div>;
}
