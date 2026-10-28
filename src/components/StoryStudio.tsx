import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Coins,
  Film,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import {
  api,
  type CloudEpisode,
  type CloudProject,
  type CloudProjectProfile,
  type CloudStoryBible,
  type GenerationResponse,
  type StoryBibleInput
} from '../lib/api';
import {
  approveEpisode,
  failureMessage,
  formatCredits,
  generateContent,
  jobLabel,
  linesToArray,
  loadStoryBoard,
  newIdempotencyKey,
  saveBibleEdit,
  saveProfile,
  type StoryBoard
} from '../lib/storyWorkspace';

/**
 * Story Studio (TASK 04): server-backed Story Bible + episode workflow.
 *
 * Every record shown here came back from the API. Browser-local projects and
 * drafts elsewhere in the app are separate and labelled as local. Generation
 * is synchronous and bounded on the server; the UI shows the returned job
 * (including failure codes) and always displays the server-owned cost and
 * balance before charging.
 */

interface StoryStudioProps {
  project: CloudProject;
}

type SaveNotice = { kind: 'idle' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string };

interface BibleDraft {
  premise: string;
  synopsis: string;
  worldbuilding: string;
  tone: string;
  structure: string;
  worldRules: string;
  themes: string;
  timeline: string;
  continuity: string;
  characters: string;
  locations: string;
  factions: string;
  arcs: string;
}

function draftFromBible(bible: CloudStoryBible): BibleDraft {
  return {
    premise: bible.premise,
    synopsis: bible.synopsis,
    worldbuilding: bible.worldbuilding,
    tone: bible.tone,
    structure: bible.structure,
    worldRules: bible.world_rules.join('\n'),
    themes: bible.themes.join('\n'),
    timeline: bible.timeline.join('\n'),
    continuity: bible.continuity.join('\n'),
    characters: JSON.stringify(bible.characters, null, 2),
    locations: JSON.stringify(bible.locations, null, 2),
    factions: JSON.stringify(bible.factions, null, 2),
    arcs: JSON.stringify(bible.arcs, null, 2)
  };
}

function parseArrayField<T>(value: string, field: string): T[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${field} must be valid JSON (an array).`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${field} must be a JSON array.`);
  return parsed as T[];
}

function draftToInput(draft: BibleDraft): StoryBibleInput {
  return {
    premise: draft.premise,
    synopsis: draft.synopsis,
    worldbuilding: draft.worldbuilding,
    tone: draft.tone,
    structure: draft.structure,
    world_rules: linesToArray(draft.worldRules),
    themes: linesToArray(draft.themes),
    timeline: linesToArray(draft.timeline),
    continuity: linesToArray(draft.continuity),
    characters: parseArrayField(draft.characters, 'Characters'),
    locations: parseArrayField(draft.locations, 'Locations'),
    factions: parseArrayField(draft.factions, 'Factions'),
    arcs: parseArrayField(draft.arcs, 'Arcs')
  };
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  generating: 'Generating',
  ready_for_review: 'Ready for review',
  failed: 'Failed',
  approved: 'Approved'
};

function EpisodeCard({
  episode,
  onApprove,
  busy
}: {
  episode: CloudEpisode;
  onApprove: () => void;
  busy: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-slate-800">
        <div>
          <h4 className="text-sm font-semibold text-white">
            Episode {episode.episode_number}: {episode.title}
          </h4>
          <p className="text-[11px] font-mono text-slate-500">
            v{episode.version} · {episode.id} · job {episode.job_id ?? 'none'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-full border ${
              episode.status === 'approved'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
            }`}
          >
            {STATUS_LABEL[episode.status] ?? episode.status}
          </span>
          {episode.status === 'ready_for_review' && (
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-900 bg-cyan-400 rounded-lg hover:bg-cyan-300 disabled:opacity-50"
            >
              {busy ? 'Approving…' : 'Approve'}
            </button>
          )}
        </div>
      </header>
      {episode.outline.length > 0 && (
        <ol className="px-4 py-3 space-y-1 text-xs text-slate-300 list-decimal list-inside">
          {episode.outline.map((beat, index) => (
            <li key={index}>{beat}</li>
          ))}
        </ol>
      )}
      <pre className="px-4 pb-4 text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
        {episode.script}
      </pre>
    </article>
  );
}

export function StoryStudio({ project }: StoryStudioProps) {
  const [board, setBoard] = useState<StoryBoard | { status: 'loading' }>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  const [concept, setConcept] = useState('');
  const [genre, setGenre] = useState(project.genre ?? '');
  const [language, setLanguage] = useState('English');
  const [tone, setTone] = useState('');
  const [audience, setAudience] = useState('');
  const [bibleBusy, setBibleBusy] = useState(false);
  const [bibleNotice, setBibleNotice] = useState<SaveNotice>({ kind: 'idle' });
  const [bibleJob, setBibleJob] = useState<GenerationResponse['job'] | null>(null);
  const bibleKey = useRef(newIdempotencyKey());

  const [episodeConcept, setEpisodeConcept] = useState('');
  const [episodeNumber, setEpisodeNumber] = useState('1');
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [episodeNotes, setEpisodeNotes] = useState('');
  const [episodeBusy, setEpisodeBusy] = useState(false);
  const [episodeNotice, setEpisodeNotice] = useState<SaveNotice>({ kind: 'idle' });
  const [episodeJob, setEpisodeJob] = useState<GenerationResponse['job'] | null>(null);
  const episodeKey = useRef(newIdempotencyKey());

  const [draft, setDraft] = useState<BibleDraft | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editNotice, setEditNotice] = useState<SaveNotice>({ kind: 'idle' });
  const [approving, setApproving] = useState<number | null>(null);

  const [profileDraft, setProfileDraft] = useState({
    description: '',
    language: '',
    targetAudience: ''
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileNotice, setProfileNotice] = useState<SaveNotice>({ kind: 'idle' });

  useEffect(() => {
    const controller = new AbortController();
    setBoard({ status: 'loading' });
    setDraft(null);
    // Never carry another project's saved profile values into this form.
    setProfileDraft({ description: '', language: '', targetAudience: '' });
    setProfileNotice({ kind: 'idle' });
    void loadStoryBoard(api, project.id, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setBoard(next);
      if (next.status === 'ready') {
        if (next.bible) setDraft(draftFromBible(next.bible));
        if (next.profile) {
          setProfileDraft({
            description: next.profile.description ?? '',
            language: next.profile.language ?? '',
            targetAudience: next.profile.target_audience ?? ''
          });
          if (next.profile.language) setLanguage(next.profile.language);
        }
      }
    });
    return () => controller.abort();
  }, [project.id, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const handleBibleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (bibleBusy) return;
    setBibleBusy(true);
    setBibleNotice({ kind: 'idle' });
    setBibleJob(null);

    const result = await generateContent(api, project.id, {
      type: 'story_bible',
      idempotencyKey: bibleKey.current,
      concept,
      genre: genre || undefined,
      language: language || undefined,
      tone: tone || undefined,
      targetAudience: audience || undefined
    });

    if (result.ok) {
      const output = result.value.output;
      const version = output?.kind === 'story_bible' ? output.story_bible.version : null;
      setBibleNotice({
        kind: 'ok',
        message: `Generated and saved on the server${version ? ` as Story Bible v${version}` : ''}. Balance: ${formatCredits(result.value.credits.balance)} writing credits.`
      });
      setBibleJob(result.value.job);
      bibleKey.current = newIdempotencyKey();
      refresh();
    } else {
      setBibleNotice({ kind: 'error', message: result.message });
      setBibleJob(result.job);
      // An uncertain request keeps its key so a retry cannot double-charge; a
      // definitive failure releases its hold and needs a new key.
      if (!result.retrySameKey) bibleKey.current = newIdempotencyKey();
    }
    setBibleBusy(false);
  };

  const handleEpisodeGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (episodeBusy) return;
    const number = Number(episodeNumber);
    if (!Number.isInteger(number) || number < 1) {
      setEpisodeNotice({ kind: 'error', message: 'Episode number must be a positive integer.' });
      return;
    }
    setEpisodeBusy(true);
    setEpisodeNotice({ kind: 'idle' });
    setEpisodeJob(null);

    const result = await generateContent(api, project.id, {
      type: 'episode_script',
      idempotencyKey: episodeKey.current,
      concept: episodeConcept,
      episodeNumber: number,
      title: episodeTitle || undefined,
      notes: episodeNotes || undefined
    });

    if (result.ok) {
      const output = result.value.output;
      const saved =
        output && output.kind === 'episode' ? `Episode ${output.episode.episode_number} “${output.episode.title}”` : 'Episode';
      setEpisodeNotice({
        kind: 'ok',
        message: `${saved} saved on the server and is ready for review. Balance: ${formatCredits(result.value.credits.balance)} writing credits.`
      });
      setEpisodeJob(result.value.job);
      episodeKey.current = newIdempotencyKey();
      refresh();
    } else {
      setEpisodeNotice({ kind: 'error', message: result.message });
      setEpisodeJob(result.job);
      if (!result.retrySameKey) episodeKey.current = newIdempotencyKey();
    }
    setEpisodeBusy(false);
  };

  const handleSaveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || editBusy) return;
    let input: StoryBibleInput;
    try {
      input = draftToInput(draft);
    } catch (error) {
      setEditNotice({ kind: 'error', message: failureMessage(error) });
      return;
    }
    setEditBusy(true);
    setEditNotice({ kind: 'idle' });
    const result = await saveBibleEdit(api, project.id, input);
    if (result.ok) {
      setEditNotice({
        kind: 'ok',
        message: `Saved as Story Bible v${result.value.version}. Prior versions were preserved.`
      });
      setDraft(draftFromBible(result.value));
      refresh();
    } else {
      setEditNotice({ kind: 'error', message: result.message });
    }
    setEditBusy(false);
  };

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (profileBusy) return;
    setProfileBusy(true);
    setProfileNotice({ kind: 'idle' });
    const result = await saveProfile(api, project.id, {
      description: profileDraft.description || null,
      language: profileDraft.language || null,
      targetAudience: profileDraft.targetAudience || null
    });
    if (result.ok) {
      const saved: CloudProjectProfile = result.value;
      setProfileDraft({
        description: saved.description ?? '',
        language: saved.language ?? '',
        targetAudience: saved.target_audience ?? ''
      });
      if (saved.language) setLanguage(saved.language);
      setProfileNotice({ kind: 'ok', message: 'Project profile saved on the server.' });
    } else {
      setProfileNotice({ kind: 'error', message: result.message });
    }
    setProfileBusy(false);
  };

  const handleApprove = async (episode: CloudEpisode) => {
    setApproving(episode.episode_number);
    const result = await approveEpisode(api, project.id, episode.episode_number);
    if (!result.ok) {
      setEpisodeNotice({ kind: 'error', message: result.message });
    } else {
      setEpisodeNotice({
        kind: 'ok',
        message: `Episode ${result.value.episode_number} approved. Publication is still a separate, owner-approved stage.`
      });
      refresh();
    }
    setApproving(null);
  };

  if (board.status === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
        Loading the server-backed Story Studio…
      </p>
    );
  }

  if (board.status === 'sign_in_required') {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" role="status">
        <p className="flex items-start gap-2 text-xs text-amber-300">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Sign in required. No Story Bible, episode or credit data was loaded.</span>
        </p>
        <p className="text-[11px] text-slate-500 sm:max-w-xs">
          Sign in again in the Shared workspace panel above. Nothing was loaded for this project.
        </p>
      </div>
    );
  }

  if (board.status === 'auth_not_configured') {
    return (
      <p role="status" className="flex items-start gap-2 text-xs text-amber-300">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{board.message}</span>
      </p>
    );
  }

  if (board.status === 'error') {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" role="alert">
        <p className="flex items-start gap-2 text-xs text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{board.message}</span>
        </p>
        {board.retryable && (
          <button
            type="button"
            onClick={refresh}
            className="px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 inline-flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        )}
      </div>
    );
  }

  const { credits, bible, episodes, history, profile } = board;
  const bibleCost = credits.costs.story_bible;
  const episodeCost = credits.costs.episode_script;
  const canAffordBible = credits.balance >= bibleCost;
  const canAffordEpisode = credits.balance >= episodeCost;

  const generationFailure = (notice: SaveNotice, job: typeof bibleJob) =>
    notice.kind === 'error' ? (
      <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
        <p>{notice.message}</p>
        <p className="mt-1 text-[11px] text-red-300/80">
          Job: {job?.id ?? 'not created'} · {jobLabel(job)}. No content was labelled saved.
        </p>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-cyan-200">
          <Coins className="w-4 h-4" />
          <span className="font-semibold">{formatCredits(credits.balance)} writing credits</span>
          <span className="text-cyan-300/60">· {credits.plan} plan</span>
        </div>
        <p className="text-[11px] text-slate-400">
          Costs are set by the server: Story Bible {bibleCost} · Episode script {episodeCost}. Free
          credits are for writing only — image, voice and video are not included.
        </p>
      </div>

      {/* Project profile */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
          <BookOpen className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Project profile</h3>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-slate-500">
            {profile ? 'saved' : 'not saved yet'}
          </span>
        </header>
        <form onSubmit={handleProfileSave} className="p-4 space-y-3">
          <label className="block text-[11px] text-slate-400">
            Description
            <textarea
              value={profileDraft.description}
              onChange={(e) => setProfileDraft({ ...profileDraft, description: e.target.value })}
              rows={2}
              maxLength={2000}
              placeholder="What is this series about?"
              className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-[11px] text-slate-400">
              Language
              <input
                value={profileDraft.language}
                onChange={(e) => setProfileDraft({ ...profileDraft, language: e.target.value })}
                maxLength={40}
                placeholder="English"
                className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </label>
            <label className="block text-[11px] text-slate-400">
              Target audience
              <input
                value={profileDraft.targetAudience}
                onChange={(e) => setProfileDraft({ ...profileDraft, targetAudience: e.target.value })}
                maxLength={200}
                placeholder="Adults 18–34"
                className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={profileBusy}
              className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-emerald-400 rounded-lg hover:bg-emerald-300 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {profileBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {profileBusy ? 'Saving…' : 'Save profile'}
            </button>
            <span className="text-[11px] text-slate-500">Stored on the server; no writing credits are used.</span>
          </div>
          {profileNotice.kind === 'ok' && (
            <p role="status" className="text-xs text-emerald-300">
              {profileNotice.message}
            </p>
          )}
          {profileNotice.kind === 'error' && (
            <p role="alert" className="text-xs text-red-300">
              {profileNotice.message}
            </p>
          )}
        </form>
      </section>

      {/* Story Bible */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Story Bible</h3>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
            server-backed
          </span>
          {bible && (
            <span className="ml-auto text-[11px] font-mono text-slate-400">v{bible.version}</span>
          )}
        </header>

        <div className="p-4 space-y-4">
          {!bible && (
            <p className="text-xs text-slate-400">
              No Story Bible exists for this cloud project yet. Generate one below, or write and save
              one yourself. Nothing is shown as saved until the server confirms it.
            </p>
          )}

          {bible && draft && (
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block text-[11px] text-slate-400">
                  Premise
                  <textarea
                    value={draft.premise}
                    onChange={(e) => setDraft({ ...draft, premise: e.target.value })}
                    rows={2}
                    maxLength={2000}
                    className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </label>
                <label className="block text-[11px] text-slate-400">
                  Tone
                  <input
                    value={draft.tone}
                    onChange={(e) => setDraft({ ...draft, tone: e.target.value })}
                    maxLength={200}
                    className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </label>
              </div>
              <label className="block text-[11px] text-slate-400">
                Synopsis
                <textarea
                  value={draft.synopsis}
                  onChange={(e) => setDraft({ ...draft, synopsis: e.target.value })}
                  rows={3}
                  maxLength={4000}
                  className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </label>
              <label className="block text-[11px] text-slate-400">
                Worldbuilding
                <textarea
                  value={draft.worldbuilding}
                  onChange={(e) => setDraft({ ...draft, worldbuilding: e.target.value })}
                  rows={3}
                  maxLength={4000}
                  className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(
                  [
                    ['worldRules', 'World rules (one per line)'],
                    ['themes', 'Themes (one per line)'],
                    ['timeline', 'Timeline (one per line)'],
                    ['continuity', 'Continuity constraints (one per line)']
                  ] as Array<[keyof BibleDraft, string]>
                ).map(([field, label]) => (
                  <label key={field} className="block text-[11px] text-slate-400">
                    {label}
                    <textarea
                      value={draft[field]}
                      onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                      rows={3}
                      className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
                    />
                  </label>
                ))}
              </div>
              <label className="block text-[11px] text-slate-400">
                Structure
                <input
                  value={draft.structure}
                  onChange={(e) => setDraft({ ...draft, structure: e.target.value })}
                  maxLength={500}
                  className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </label>
              <details className="rounded-lg border border-slate-800 bg-slate-950/40">
                <summary className="cursor-pointer px-3 py-2 text-[11px] text-slate-400">
                  Characters, locations, factions and arcs (JSON)
                </summary>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
                  {(
                    [
                      ['characters', 'Characters'],
                      ['locations', 'Locations'],
                      ['factions', 'Factions'],
                      ['arcs', 'Arcs']
                    ] as Array<[keyof BibleDraft, string]>
                  ).map(([field, label]) => (
                    <label key={field} className="block text-[11px] text-slate-400">
                      {label}
                      <textarea
                        value={draft[field]}
                        onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                        rows={5}
                        className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
                      />
                    </label>
                  ))}
                </div>
              </details>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={editBusy}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-lg hover:bg-cyan-300 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {editBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {editBusy ? 'Saving…' : 'Save as new version'}
                </button>
                <span className="text-[11px] text-slate-500">
                  Editing saves a new version and does not consume writing credits.
                </span>
              </div>
              {editNotice.kind === 'ok' && (
                <p role="status" className="text-xs text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {editNotice.message}
                </p>
              )}
              {editNotice.kind === 'error' && (
                <p role="alert" className="text-xs text-red-300">
                  {editNotice.message}
                </p>
              )}
            </form>
          )}

          <form onSubmit={handleBibleGenerate} className="space-y-3 pt-3 border-t border-slate-800">
            <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Generate a Story Bible
              <span className="font-normal text-slate-500">· costs {bibleCost} credits</span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block text-[11px] text-slate-400 md:col-span-2">
                Story concept (required)
                <textarea
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="A memory broker discovers her own past was sold."
                  className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </label>
              <label className="block text-[11px] text-slate-400">
                Genre
                <input
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  maxLength={80}
                  className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </label>
              <label className="block text-[11px] text-slate-400">
                Language
                <input
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  maxLength={40}
                  className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </label>
              <label className="block text-[11px] text-slate-400">
                Tone
                <input
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  maxLength={200}
                  className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </label>
              <label className="block text-[11px] text-slate-400">
                Target audience
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  maxLength={200}
                  className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </label>
            </div>
            {!canAffordBible && (
              <p role="status" className="text-xs text-amber-300">
                Not enough writing credits for this generation ({credits.balance} of {bibleCost}).
              </p>
            )}
            <button
              type="submit"
              disabled={bibleBusy || concept.trim().length === 0 || !canAffordBible}
              className="px-4 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 rounded-lg hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {bibleBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {bibleBusy ? 'Generating on the server…' : `Generate Story Bible — ${bibleCost} credits`}
            </button>
            {bibleBusy && (
              <p role="status" className="text-[11px] text-slate-400">
                Credits are reserved before the provider call. A failed generation releases them.
              </p>
            )}
            {bibleNotice.kind === 'ok' && (
              <p role="status" className="text-xs text-emerald-300 flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {bibleNotice.message}
              </p>
            )}
            {generationFailure(bibleNotice, bibleJob)}
          </form>
        </div>
      </section>

      {/* Episodes */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
          <Film className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-bold text-white">Episodes</h3>
          <span className="ml-auto text-[11px] text-slate-500">
            {episodes.length === 0 ? 'none yet' : `${episodes.length} on the server`}
          </span>
        </header>
        <div className="p-4 space-y-4">
          {episodes.length === 0 ? (
            <p className="text-xs text-slate-400">
              No episodes on the server yet. Generate an outline and script below.
            </p>
          ) : (
            <div className="space-y-3">
              {episodes.map((episode) => (
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  busy={approving === episode.episode_number}
                  onApprove={() => void handleApprove(episode)}
                />
              ))}
            </div>
          )}

          <form onSubmit={handleEpisodeGenerate} className="space-y-3 pt-3 border-t border-slate-800">
            <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" /> Generate an episode outline and script
              <span className="font-normal text-slate-500">· costs {episodeCost} credits</span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block text-[11px] text-slate-400 md:col-span-2">
                Episode concept (required)
                <textarea
                  value={episodeConcept}
                  onChange={(e) => setEpisodeConcept(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="Mira meets the client who recognizes her."
                  className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </label>
              <label className="block text-[11px] text-slate-400">
                Episode number
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={episodeNumber}
                  onChange={(e) => setEpisodeNumber(e.target.value)}
                  className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </label>
              <label className="block text-[11px] text-slate-400 md:col-span-2">
                Title (optional)
                <input
                  value={episodeTitle}
                  onChange={(e) => setEpisodeTitle(e.target.value)}
                  maxLength={200}
                  className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </label>
              <label className="block text-[11px] text-slate-400">
                Notes (optional)
                <input
                  value={episodeNotes}
                  onChange={(e) => setEpisodeNotes(e.target.value)}
                  maxLength={1000}
                  className="mt-1 w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </label>
            </div>
            {!canAffordEpisode && (
              <p role="status" className="text-xs text-amber-300">
                Not enough writing credits for this generation ({credits.balance} of {episodeCost}).
              </p>
            )}
            <button
              type="submit"
              disabled={episodeBusy || episodeConcept.trim().length === 0 || !canAffordEpisode}
              className="px-4 py-2 text-xs font-semibold text-slate-900 bg-violet-400 rounded-lg hover:bg-violet-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {episodeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
              {episodeBusy ? 'Generating on the server…' : `Generate episode — ${episodeCost} credits`}
            </button>
            {episodeNotice.kind === 'ok' && (
              <p role="status" className="text-xs text-emerald-300 flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {episodeNotice.message}
              </p>
            )}
            {generationFailure(episodeNotice, episodeJob)}
          </form>
        </div>
      </section>

      {/* Credit history */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
          <Coins className="w-4 h-4 text-amber-300" />
          <h3 className="text-sm font-bold text-white">Credit history</h3>
        </header>
        {history.length === 0 ? (
          <p className="p-4 text-xs text-slate-400">No credit transactions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {history.slice(0, 10).map((entry, index) => (
              <li key={`${entry.idempotency_key}-${index}`} className="px-4 py-2 flex items-center justify-between gap-3 text-[11px]">
                <div className="min-w-0">
                  <p className="text-slate-300">{entry.reason}</p>
                  <p className="font-mono text-slate-500 truncate">
                    {entry.type} · {entry.idempotency_key}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={entry.amount < 0 ? 'text-amber-300' : 'text-emerald-300'}>
                    {entry.amount > 0 ? '+' : ''}
                    {entry.amount}
                  </p>
                  <p className="text-slate-500">balance {entry.balance_after}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
