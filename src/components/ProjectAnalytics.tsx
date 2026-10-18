import { Project } from '../types/manhwa';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { BarChart3, TrendingUp, Users, Film, CheckCircle, Sparkles } from 'lucide-react';

interface ProjectAnalyticsProps {
  project: Project;
}

export function ProjectAnalytics({ project }: ProjectAnalyticsProps) {
  // Compute analytics data from project state
  const totalEpisodes = project.episodes.length;
  const totalScenes = project.episodes.reduce((acc, ep) => acc + ep.scenes.length, 0);
  const totalCharacters = project.storyBible.characters.length;
  const totalRules = project.storyBible.worldRules.length;

  // Episode scene count data for BarChart
  const episodeSceneData = project.episodes.map((ep) => ({
    name: `Ep ${ep.episodeNumber}`,
    scenes: ep.scenes.length,
    outlines: ep.outline.length,
    title: ep.title
  }));

  // Character role breakdown data for PieChart
  const characterRoleData = project.storyBible.characters.reduce((acc: any[], char) => {
    const existing = acc.find((item) => item.name === char.role);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: char.role, value: 1 });
    }
    return acc;
  }, []);

  const COLORS = ['#22d3ee', '#a855f7', '#3b82f6', '#ec4899', '#10b981'];

  // Completion percentage calculation based on filled fields & approvals
  const hasPremise = Boolean(project.storyBible.premise.length > 20);
  const hasCharacters = totalCharacters > 0;
  const hasEpisodes = totalEpisodes > 0;
  const hasApproval = project.approvals.length > 0;

  let completionScore = 20;
  if (hasPremise) completionScore += 25;
  if (hasCharacters) completionScore += 25;
  if (hasEpisodes) completionScore += 20;
  if (hasApproval) completionScore += 10;

  // Pipeline stages data
  const pipelineData = [
    { stage: 'Story Bible', progress: hasPremise ? 100 : 40 },
    { stage: 'Characters', progress: hasCharacters ? 100 : 30 },
    { stage: 'Episode Outlines', progress: hasEpisodes ? 90 : 20 },
    { stage: 'Scene Breakdown', progress: totalScenes > 2 ? 85 : 40 },
    { stage: 'Video & Approval', progress: hasApproval ? 100 : 15 }
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2 text-cyan-400 text-xs font-mono tracking-wider">
            <BarChart3 className="w-4 h-4" />
            <span>PRODUCTION ANALYTICS & METRICS</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{project.title} — Studio Progress</h2>
          <p className="text-xs text-slate-400 max-w-xl">
            Real-time telemetry measuring script density, character distribution, pipeline completion status, and asset readiness.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-900/90 border border-slate-800 px-6 py-4 rounded-xl shrink-0">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">Completion Rate</span>
            <span className="text-2xl font-extrabold text-cyan-400">{completionScore}%</span>
          </div>
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Total Episodes</span>
            <Film className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white">{totalEpisodes}</div>
          <p className="text-[11px] text-slate-500">Structured script chapters</p>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Total Scenes</span>
            <BarChart3 className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-2xl font-bold text-white">{totalScenes}</div>
          <p className="text-[11px] text-slate-500">Storyboard panel prompts</p>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Character Anchors</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{totalCharacters}</div>
          <p className="text-[11px] text-slate-500">Continuity profiles defined</p>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Approval Records</span>
            <CheckCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white">{project.approvals.length}</div>
          <p className="text-[11px] text-slate-500">Signed-off assets</p>
        </div>
      </div>

      {/* Recharts Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Scenes per Episode */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-white">Scene Density per Episode</h3>
            <p className="text-xs text-slate-400">Number of storyboard scenes and action beats structured per chapter.</p>
          </div>

          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={episodeSceneData}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  labelStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                />
                <Bar dataKey="scenes" fill="#22d3ee" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Pipeline Stage Progress */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-white">Production Pipeline Progress</h3>
            <p className="text-xs text-slate-400">Completion percentage across major studio stages.</p>
          </div>

          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pipelineData}>
                <XAxis dataKey="stage" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  labelStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="progress" stroke="#a855f7" fill="#a855f7" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Character Roles Distribution */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white">Character Role Distribution</h3>
          <p className="text-xs text-slate-400">Breakdown of characters by narrative role in the Story Bible.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div className="h-48 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={characterRoleData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {characterRoleData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="md:col-span-2 space-y-3">
            {characterRoleData.map((role: any, idx: number) => (
              <div key={role.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-3">
                  <div
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <span className="text-xs font-medium text-white">{role.name}</span>
                </div>
                <span className="text-xs font-mono font-bold text-cyan-400">{role.value} Characters</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
