import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { useState } from 'react';
import {
  cleanup,
  drainReactWork,
  fireEvent,
  render,
  screen,
  stubApiFetch,
  unregisterDom,
  waitFor
} from './setup/dom';
import App from '../src/App';
import { StoryBibleEditor } from '../src/components/StoryBibleEditor';
import { ProjectAnalytics } from '../src/components/ProjectAnalytics';
import { INITIAL_PROJECTS } from '../src/data/mockProjects';
import { PROJECTS_STORAGE_KEY } from '../src/lib/storage';
import type { Project } from '../src/types/manhwa';

/**
 * Form-level guards for the remaining TASK-01 surface: the Story Bible editor,
 * the project-creation form, project deletion, and empty/boundary inputs.
 *
 * These run in happy-dom, so they prove state flow and validation logic — not
 * layout, paint, or responsive behaviour.
 */

const baseProject = (): Project => structuredClone(INITIAL_PROJECTS[0]);

const storedProjects = (): Project[] =>
  JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) ?? '[]') as Project[];

/** Mirrors App: every update is fed back in as the new prop, like real state. */
function EditorHarness({ initial, onUpdate }: { initial: Project; onUpdate: (p: Project) => void }) {
  const [project, setProject] = useState(initial);
  return (
    <StoryBibleEditor
      project={project}
      onUpdateProject={(updated) => {
        onUpdate(updated);
        setProject(updated);
      }}
      onOpenAiGenerator={() => {}}
    />
  );
}

let restoreFetch: () => void;

beforeAll(() => {
  restoreFetch = stubApiFetch();
});

afterAll(async () => {
  restoreFetch();
  await drainReactWork();
  unregisterDom();
});

let confirmAnswer = true;
let confirmMessages: string[] = [];
let alertMessages: string[] = [];
let originalConfirm: unknown;
let originalAlert: unknown;

beforeEach(() => {
  localStorage.clear();
  confirmAnswer = true;
  confirmMessages = [];
  alertMessages = [];
  const globals = globalThis as unknown as Record<string, unknown>;
  originalConfirm = globals.confirm;
  originalAlert = globals.alert;
  globals.confirm = (message?: string) => {
    confirmMessages.push(String(message));
    return confirmAnswer;
  };
  globals.alert = (message?: string) => {
    alertMessages.push(String(message));
  };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.confirm = originalConfirm;
  globals.alert = originalAlert;
});

describe('story bible editor field-level state', () => {
  test('saves premise and logline without touching other project data', async () => {
    const project = baseProject();
    const updates: Project[] = [];
    render(<EditorHarness initial={project} onUpdate={(p) => updates.push(p)} />);

    // The editor's labels are not tied to their inputs with htmlFor/id, so the
    // fields are addressed by their current values.
    const loglineInput = screen.getByDisplayValue(project.storyBible.logline);
    const premiseField = screen.getByDisplayValue(project.storyBible.premise);
    fireEvent.change(loglineInput, {
      target: { value: 'A courier outruns the city she helped build.' },
    });
    fireEvent.change(premiseField, {
      target: { value: 'Full premise written by the user in the editor.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));

    expect(updates).toHaveLength(1);
    const saved = updates[0];
    expect(saved.storyBible.logline).toBe('A courier outruns the city she helped build.');
    expect(saved.storyBible.premise).toBe('Full premise written by the user in the editor.');
    // Only the edited fields change; identity and content stay intact.
    expect(saved.id).toBe(project.id);
    expect(saved.title).toBe(project.title);
    expect(saved.episodes).toEqual(project.episodes);
    expect(saved.storyBible.characters).toEqual(project.storyBible.characters);
    expect(saved.storyBible.worldRules).toEqual(project.storyBible.worldRules);
    expect(saved.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // The save indicator resolves back to its idle label rather than claiming a
    // permanent in-flight state.
    await waitFor(() => expect(screen.getByRole('button', { name: /Save Changes/ })).toBeTruthy(), {
      timeout: 2000,
    });
  });

  test('saving empty fields stores them empty instead of inventing content', () => {
    const project = baseProject();
    const updates: Project[] = [];
    render(<EditorHarness initial={project} onUpdate={(p) => updates.push(p)} />);

    fireEvent.change(screen.getByDisplayValue(project.storyBible.logline), { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue(project.storyBible.premise), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));

    expect(updates).toHaveLength(1);
    expect(updates[0].storyBible.logline).toBe('');
    // Whitespace is preserved as typed: no fallback text is fabricated.
    expect(updates[0].storyBible.premise).toBe('   ');
    expect(updates[0].storyBible.premise).not.toBe(project.storyBible.premise);
  });

  test('edits one character field and leaves the others unchanged', () => {
    const project = baseProject();
    const updates: Project[] = [];
    render(<EditorHarness initial={project} onUpdate={(p) => updates.push(p)} />);

    fireEvent.click(screen.getByRole('button', { name: /^Characters/ }));

    const names = project.storyBible.characters.map((c) => c.name);
    const nameInput = screen.getByDisplayValue(names[0]);
    fireEvent.change(nameInput, { target: { value: 'Renamed Protagonist' } });

    const saved = updates.at(-1)!;
    expect(saved.storyBible.characters).toHaveLength(project.storyBible.characters.length);
    expect(saved.storyBible.characters[0].name).toBe('Renamed Protagonist');
    expect(saved.storyBible.characters[0].role).toBe(project.storyBible.characters[0].role);
    expect(saved.storyBible.characters[0].visualAnchor).toBe(
      project.storyBible.characters[0].visualAnchor,
    );
    if (project.storyBible.characters.length > 1) {
      expect(saved.storyBible.characters[1]).toEqual(project.storyBible.characters[1]);
    }
  });

  test('adds and removes a character, keeping ids unique', () => {
    const project = baseProject();
    const updates: Project[] = [];
    const { container } = render(
      <EditorHarness initial={project} onUpdate={(p) => updates.push(p)} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Characters/ }));
    const startingCount = project.storyBible.characters.length;

    fireEvent.click(screen.getByRole('button', { name: /Add Character/ }));
    let saved = updates.at(-1)!;
    expect(saved.storyBible.characters).toHaveLength(startingCount + 1);
    const added = saved.storyBible.characters[startingCount];
    expect(added.name).toBe('New Character');
    expect(new Set(saved.storyBible.characters.map((c) => c.id)).size).toBe(startingCount + 1);

    // Delete the newly added card through its own trash control.
    const addedNameInput = screen.getByDisplayValue('New Character');
    const card = addedNameInput.closest('div')!;
    fireEvent.click(card.querySelector('button')!);

    saved = updates.at(-1)!;
    expect(saved.storyBible.characters).toHaveLength(startingCount);
    expect(saved.storyBible.characters.map((c) => c.id)).toEqual(
      project.storyBible.characters.map((c) => c.id),
    );
    expect(container.querySelectorAll('input[value="New Character"]')).toHaveLength(0);
  });

  test('adds, edits and deletes a world rule', () => {
    const project = baseProject();
    const updates: Project[] = [];
    render(<EditorHarness initial={project} onUpdate={(p) => updates.push(p)} />);

    fireEvent.click(screen.getByRole('button', { name: /^World Rules/ }));
    const startingCount = project.storyBible.worldRules.length;

    fireEvent.click(screen.getByRole('button', { name: /Add Rule/ }));
    let saved = updates.at(-1)!;
    expect(saved.storyBible.worldRules).toHaveLength(startingCount + 1);

    fireEvent.change(screen.getByDisplayValue('New world building rule or law of physics.'), {
      target: { value: 'Magic costs memory, not blood.' },
    });
    saved = updates.at(-1)!;
    expect(saved.storyBible.worldRules.at(-1)!.rule).toBe('Magic costs memory, not blood.');

    const ruleInput = screen.getByDisplayValue('Magic costs memory, not blood.');
    fireEvent.click(ruleInput.closest('div')!.querySelector('button')!);
    saved = updates.at(-1)!;
    expect(saved.storyBible.worldRules).toHaveLength(startingCount);
    expect(saved.storyBible.worldRules).toEqual(project.storyBible.worldRules);
  });

  test('adds, edits and deletes a terminology entry', () => {
    const project = baseProject();
    const updates: Project[] = [];
    render(<EditorHarness initial={project} onUpdate={(p) => updates.push(p)} />);

    fireEvent.click(screen.getByRole('button', { name: /^Terminology/ }));
    const startingCount = project.storyBible.terminology.length;

    fireEvent.click(screen.getByRole('button', { name: /Add Term/ }));
    let saved = updates.at(-1)!;
    expect(saved.storyBible.terminology).toHaveLength(startingCount + 1);

    fireEvent.change(screen.getByDisplayValue('New Term'), {
      target: { value: 'Boundary Field' },
    });
    saved = updates.at(-1)!;
    expect(saved.storyBible.terminology.at(-1)!.term).toBe('Boundary Field');

    fireEvent.change(screen.getByDisplayValue('Definition of in-universe technology, magic, or faction.'), {
      target: { value: 'A district where network access is physically impossible.' },
    });
    saved = updates.at(-1)!;
    expect(saved.storyBible.terminology.at(-1)!.definition).toBe(
      'A district where network access is physically impossible.',
    );

    const termInput = screen.getByDisplayValue('Boundary Field');
    fireEvent.click(termInput.closest('div')!.querySelector('button')!);
    saved = updates.at(-1)!;
    expect(saved.storyBible.terminology).toHaveLength(startingCount);
    expect(saved.storyBible.terminology).toEqual(project.storyBible.terminology);
  });

  test('tab counts reflect project data and tab switching writes nothing', () => {
    const project = baseProject();
    const updates: Project[] = [];
    render(<EditorHarness initial={project} onUpdate={(p) => updates.push(p)} />);

    expect(
      screen.getByRole('button', { name: new RegExp(`^Characters \\(${project.storyBible.characters.length}\\)`) }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: new RegExp(`^World Rules \\(${project.storyBible.worldRules.length}\\)`) }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Terminology/ }));
    fireEvent.click(screen.getByRole('button', { name: /^World Rules/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Premise & Logline/ }));

    expect(updates).toHaveLength(0);
  });
});

describe('project creation form validation', () => {
  test('submitting an empty title creates nothing and keeps the form open', () => {
    const { container } = render(<App />);
    const startingTitles = storedProjects().map((p) => p.title);

    fireEvent.click(screen.getByRole('button', { name: /Create New Project/ }));
    expect(screen.getByText('Create New Manhwa Project')).toBeTruthy();

    fireEvent.submit(container.querySelector('form')!);

    expect(screen.getByText('Create New Manhwa Project')).toBeTruthy();
    expect(storedProjects().map((p) => p.title)).toEqual(startingTitles);
  });

  test('a whitespace-only title is rejected by the app guard, not just HTML required', () => {
    const { container } = render(<App />);
    const startingTitles = storedProjects().map((p) => p.title);

    fireEvent.click(screen.getByRole('button', { name: /Create New Project/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Neon Horizon'), {
      target: { value: '   ' },
    });
    // Whitespace satisfies the HTML `required` attribute, so a blocked creation
    // here can only come from the component's trim() guard.
    fireEvent.submit(container.querySelector('form')!);

    expect(screen.getByText('Create New Manhwa Project')).toBeTruthy();
    expect(storedProjects().map((p) => p.title)).toEqual(startingTitles);
    expect(screen.queryByRole('heading', { name: '   ' })).toBeNull();
  });

  test('a valid title creates, opens and persists the project', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Create New Project/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Neon Horizon'), {
      target: { value: 'Boundary Test Series' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Summarize the core premise/), {
      target: { value: 'A user-written synopsis with real intent.' },
    });
    fireEvent.submit(container.querySelector('form')!);

    // The new project becomes the active workspace and the modal closes.
    expect(await screen.findByRole('heading', { name: 'Boundary Test Series' })).toBeTruthy();
    expect(screen.queryByText('Create New Manhwa Project')).toBeNull();

    await waitFor(() => expect(storedProjects()[0].title).toBe('Boundary Test Series'));
    const saved = storedProjects()[0];
    expect(saved.storyBible.premise).toBe('A user-written synopsis with real intent.');
    expect(saved.status).toBe('draft');

    fireEvent.click(screen.getByTitle('Back to Projects'));
    expect(await screen.findByText('Boundary Test Series')).toBeTruthy();
    expect(storedProjects()).toHaveLength(INITIAL_PROJECTS.length + 1);
  });
});

describe('project deletion', () => {
  test('a declined confirmation keeps the project', () => {
    confirmAnswer = false;
    render(<App />);

    fireEvent.click(screen.getAllByTitle('Delete Project')[0]);

    expect(confirmMessages).toHaveLength(1);
    expect(confirmMessages[0]).toMatch(/delete this project/i);
    expect(screen.getByText(INITIAL_PROJECTS[0].title)).toBeTruthy();
    expect(storedProjects()).toHaveLength(INITIAL_PROJECTS.length);
  });

  test('a confirmed deletion removes the project and leaves a valid active project', async () => {
    confirmAnswer = true;
    render(<App />);

    fireEvent.click(screen.getAllByTitle('Delete Project')[0]);

    await waitFor(() => expect(storedProjects()).toHaveLength(INITIAL_PROJECTS.length - 1));
    const remaining = storedProjects();
    expect(remaining.map((p) => p.id)).not.toContain(INITIAL_PROJECTS[0].id);
    expect(screen.queryByText(INITIAL_PROJECTS[0].title)).toBeNull();

    // The deleted project was active; the workspace must fall back, not dangle.
    fireEvent.click(screen.getAllByRole('button', { name: /Open Workspace/ })[0]);
    expect(
      await screen.findByRole('heading', { name: remaining[0].title }),
    ).toBeTruthy();
  });

  test('the last remaining project cannot be deleted', () => {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify([structuredClone(INITIAL_PROJECTS[0])]));
    render(<App />);

    fireEvent.click(screen.getByTitle('Delete Project'));

    expect(confirmMessages).toHaveLength(0);
    expect(alertMessages).toHaveLength(1);
    expect(alertMessages[0]).toMatch(/at least one project/i);
    expect(screen.getByText(INITIAL_PROJECTS[0].title)).toBeTruthy();
    expect(storedProjects()).toHaveLength(1);
  });
});

describe('empty and boundary input handling', () => {
  test('hub search with no matches shows the empty state and recovers on clear', () => {
    render(<App />);
    const search = screen.getByPlaceholderText(/Search projects by title or premise/);

    fireEvent.change(search, { target: { value: 'zzz-no-such-series' } });
    expect(screen.getByText('No projects found')).toBeTruthy();
    expect(screen.queryByText(INITIAL_PROJECTS[0].title)).toBeNull();

    fireEvent.change(search, { target: { value: '' } });
    expect(screen.queryByText('No projects found')).toBeNull();
    expect(screen.getByText(INITIAL_PROJECTS[0].title)).toBeTruthy();
  });

  test('analytics on an empty project shows empty states, not invented metrics', () => {
    const empty: Project = {
      ...baseProject(),
      episodes: [],
      approvals: [],
      storyBible: { ...baseProject().storyBible, characters: [], worldRules: [], terminology: [] },
    };

    render(<ProjectAnalytics project={empty} />);

    expect(screen.getByText('No episodes are stored in this project yet.')).toBeTruthy();
    expect(screen.getByText('No characters are stored yet.')).toBeTruthy();
    expect(screen.getByText('Production integrations: Not connected')).toBeTruthy();
    expect(screen.queryByText(/real-time telemetry|views this month|subscriber/i)).toBeNull();
  });
});
