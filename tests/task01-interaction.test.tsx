import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { AiGeneratorModal } from '../src/components/AiGeneratorModal';
import { INITIAL_PROJECTS } from '../src/data/mockProjects';
import {
  FABRICATED_VIDEO_ID,
  LEGACY_PROVIDER_KEY,
  PROJECTS_STORAGE_KEY,
  sanitizeStoredProjects,
} from '../src/lib/storage';
import type { Project } from '../src/types/manhwa';

/**
 * Interaction-level guards for TASK-01, running against a real DOM (happy-dom).
 *
 * `task01-render.test.tsx` proves the server markup is honest. These tests go
 * one step further and actually click, type and re-mount the app, so that:
 *   - the demo sample only appears after a click and never enters project data,
 *   - the mount-time purge of the legacy provider key really runs,
 *   - stored fabricated approval data is cleaned without losing real data,
 *   - the existing hub / workspace / analytics / approval UI still works.
 */

const seedProjects = (projects: Project[]) =>
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));

const storedProjects = (): Project[] =>
  JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) ?? '[]') as Project[];

const customProject = (): Project => {
  const base = structuredClone(INITIAL_PROJECTS[0]);
  return {
    ...base,
    id: 'proj-user-owned',
    title: 'User Owned Series',
    synopsis: 'A story the user typed themselves and expects to keep.',
    approvals: [
      {
        id: 'app-user',
        artifactId: 'ep-user',
        artifactTitle: 'Episode 1: User Script',
        type: 'script',
        status: 'pending',
        approver: 'Owner',
        timestamp: '2026-10-01 10:00',
        notes: 'Real note written by the user.',
        youtubeUploadState: 'not_uploaded',
      },
    ],
  };
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('demo generator interaction', () => {
  test('sample output appears only after a click and is labelled as a demo', async () => {
    render(<AiGeneratorModal isOpen={true} onClose={() => {}} initialPrompt="Demo prompt" />);

    // Nothing is presented as generated output before the user asks for it.
    expect(screen.getByText(/DEMO ONLY — AI BACKEND NOT CONNECTED/)).toBeTruthy();
    expect(screen.queryByText(/DEMO SAMPLE ONLY/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Show Demo Sample/ }));

    const sample = await screen.findByText(/DEMO SAMPLE ONLY/, {}, { timeout: 3000 });
    expect(sample.textContent).toContain('your prompt was not sent to an AI model');
    expect(sample.textContent).toContain('No story, image, audio, or video asset has been generated');

    // The button returns to its idle label: no perpetual "generating" claim.
    expect(screen.getByRole('button', { name: /Show Demo Sample/ })).toBeTruthy();
  });

  test('demo output offers no way to insert it into a project and is never persisted', async () => {
    render(<AiGeneratorModal isOpen={true} onClose={() => {}} initialPrompt="Demo prompt" />);

    fireEvent.click(screen.getByRole('button', { name: /Show Demo Sample/ }));
    await screen.findByText(/DEMO SAMPLE ONLY/, {}, { timeout: 3000 });

    const labels = screen
      .getAllByRole('button')
      .map((button) => (button.textContent ?? '').trim());
    expect(labels.some((label) => /insert|apply|save to project|use this/i.test(label))).toBe(false);

    // The demo textarea stays editable preview state; nothing is written to storage.
    expect(localStorage.length).toBe(0);
  });

  test('typing into the prompt does not claim the prompt was sent anywhere', async () => {
    render(<AiGeneratorModal isOpen={true} onClose={() => {}} initialPrompt="Start" />);

    const prompt = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(prompt, { target: { value: 'A rooftop chase at dusk' } });
    expect(prompt.value).toBe('A rooftop chase at dusk');

    fireEvent.click(screen.getByRole('button', { name: /Show Demo Sample/ }));
    const sample = await screen.findByText(/DEMO SAMPLE ONLY/, {}, { timeout: 3000 });
    expect(sample.textContent).not.toContain('A rooftop chase at dusk');
  });
});

describe('app mount behaviour', () => {
  test('purges the legacy provider key from browser storage', async () => {
    localStorage.setItem(LEGACY_PROVIDER_KEY, 'not-a-real-key');
    render(<App />);

    await waitFor(() => expect(localStorage.getItem(LEGACY_PROVIDER_KEY)).toBeNull());
    // The purge must not become a read-and-use path.
    expect(localStorage.getItem(PROJECTS_STORAGE_KEY) ?? '').not.toContain('not-a-real-key');
  });

  test('cleans a stored fabricated video id while keeping the rest of the data', async () => {
    const polluted = customProject();
    polluted.approvals[0] = {
      ...polluted.approvals[0],
      youtubeUploadState: 'private_uploaded',
      youtubeVideoId: FABRICATED_VIDEO_ID,
    };
    seedProjects([polluted]);

    render(<App />);

    await waitFor(() => {
      expect(localStorage.getItem(PROJECTS_STORAGE_KEY) ?? '').not.toContain(FABRICATED_VIDEO_ID);
    });

    const [saved] = storedProjects();
    expect(saved.id).toBe('proj-user-owned');
    expect(saved.title).toBe('User Owned Series');
    expect(saved.approvals[0].youtubeVideoId).toBeUndefined();
    expect(saved.approvals[0].youtubeUploadState).toBe('not_uploaded');
    expect(saved.approvals[0].notes).toBe('Real note written by the user.');
  });

  test('keeps a user-created project instead of resetting to the samples', async () => {
    seedProjects([customProject()]);
    render(<App />);

    expect(await screen.findByText('User Owned Series')).toBeTruthy();
    expect(screen.queryByText(INITIAL_PROJECTS[0].title)).toBeNull();

    await waitFor(() => expect(storedProjects()).toHaveLength(1));
    expect(storedProjects()[0].title).toBe('User Owned Series');
  });
});

describe('existing UI still works', () => {
  test('opens a project workspace and navigates back to the hub', async () => {
    render(<App />);

    expect(await screen.findByText('Your Creative Universe')).toBeTruthy();
    expect(screen.getByText(INITIAL_PROJECTS[0].title)).toBeTruthy();
    expect(screen.getByText(INITIAL_PROJECTS[1].title)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /Open Workspace/ })[1]);

    // The second sample project is now the active workspace.
    expect(await screen.findByRole('heading', { name: INITIAL_PROJECTS[1].title })).toBeTruthy();
    expect(screen.getByText('Story Bible')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Back to Projects'));
    expect(await screen.findByText('Your Creative Universe')).toBeTruthy();
  });

  test('switches between the Story Bible and episode script tabs', async () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: /Open Workspace/ })[0]);
    expect(await screen.findByText('Story Bible')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Episode Scripts/ }));
    expect(await screen.findByText(/Episode 1/)).toBeTruthy();
  });

  test('analytics view reports local counts and no production integrations', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^Analytics$/ }));

    expect(await screen.findByText('Production integrations: Not connected')).toBeTruthy();
    expect(screen.getByText(/browser-local data/)).toBeTruthy();
    expect(screen.getByText('Total Episodes')).toBeTruthy();
    // Counts must reflect the project's own data, not invented telemetry.
    expect(screen.queryByText(/real-time telemetry/i)).toBeNull();
  });

  test('approval view keeps publishing disabled and shows no fabricated video', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Approval & YouTube/ }));

    expect(await screen.findByText('YouTube: Not connected')).toBeTruthy();
    expect(screen.getByText('No rendered video exists for this project')).toBeTruthy();

    const upload = screen.getByRole('button', { name: /Upload to YouTube — unavailable/ });
    expect((upload as HTMLButtonElement).disabled).toBe(true);

    const html = document.body.innerHTML;
    expect(html).not.toContain(FABRICATED_VIDEO_ID);
    expect(html).not.toContain('watch?v=');
  });
});

describe('sanitizeStoredProjects contract used on mount', () => {
  test('is the function the app actually applies to stored data', () => {
    const polluted = customProject();
    polluted.approvals[0] = {
      ...polluted.approvals[0],
      youtubeUploadState: 'private_uploaded',
      youtubeVideoId: FABRICATED_VIDEO_ID,
    };

    const [clean] = sanitizeStoredProjects([polluted]);
    expect(clean.approvals[0].youtubeUploadState).toBe('not_uploaded');
    expect(clean.approvals[0].youtubeVideoId).toBeUndefined();
    expect(polluted.approvals[0].youtubeVideoId).toBe(FABRICATED_VIDEO_ID);
  });
});
