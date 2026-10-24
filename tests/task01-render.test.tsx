import { describe, expect, test, beforeEach } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiGeneratorModal } from '../src/components/AiGeneratorModal';
import { ApprovalCenter } from '../src/components/ApprovalCenter';
import { ProjectAnalytics } from '../src/components/ProjectAnalytics';
import { INITIAL_PROJECTS } from '../src/data/mockProjects';

/**
 * Render-level guards for TASK-01.
 *
 * The other suite checks source text. These tests actually execute the
 * components and inspect the markup a user would receive, so a component can
 * not silently lose its "demo only" / "not connected" labels.
 */

const project = INITIAL_PROJECTS[0];

describe('demo generator render', () => {
  test('renders an unmistakable demo-only state with no apply action', () => {
    const html = renderToStaticMarkup(
      <AiGeneratorModal isOpen={true} onClose={() => {}} initialPrompt="test prompt" />
    );

    expect(html).toContain('DEMO ONLY');
    expect(html).toContain('AI BACKEND NOT CONNECTED');
    expect(html).toContain('not sent anywhere');
    expect(html).toContain('cannot be inserted');
    expect(html).toContain('Show Demo Sample');

    // No control may offer to insert/apply generated output into a project.
    expect(html).not.toMatch(/insert into/i);
    expect(html).not.toMatch(/apply (to|sample)/i);
    expect(html).not.toMatch(/generat(e|ing) (an? )?(image|panel|video)/i);
  });

  test('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      <AiGeneratorModal isOpen={false} onClose={() => {}} initialPrompt="test prompt" />
    );
    expect(html).toBe('');
  });
});

describe('analytics render', () => {
  test('labels counts as browser-local and integrations as not connected', () => {
    const html = renderToStaticMarkup(<ProjectAnalytics project={project} />);

    expect(html).toContain('browser-local data');
    expect(html).toContain('Production integrations: Not connected');
    expect(html).toContain('Total Episodes');
    expect(html).toContain('Character Role Distribution');

    // No fabricated production telemetry.
    expect(html).not.toMatch(/real-time telemetry/i);
    expect(html).not.toMatch(/\b(render(ed|ing)|published|uploaded) (successfully|\d+)\b/i);
    // No percentage-based "pipeline progress" style metric in rendered text.
    expect(html).not.toMatch(/>\s*\d+(\.\d+)?%\s*</);
  });
});

describe('approval center render', () => {
  test('shows an honest disconnected publishing state', () => {
    const html = renderToStaticMarkup(
      <ApprovalCenter project={project} onUpdateProject={() => {}} />
    );

    expect(html).toContain('YouTube: Not connected');
    expect(html).toContain('Upload to YouTube — unavailable');
    expect(html).toContain('No rendered video exists for this project');
    expect(html).toContain('Publishing blocked');
    expect(html).toContain('Episode 1: Script &amp; Scenes');

    // The sample record must not claim an upload or a video.
    expect(html).not.toContain('dQw4w9WgXcQ');
    expect(html).not.toMatch(/private_uploaded/);
    expect(html).not.toMatch(/watch\?v=/);
  });
});

describe('app render', () => {
  beforeEach(() => {
    // happy-dom (see tests/setup/dom.ts) provides a real localStorage.
    localStorage.clear();
  });

  // NOTE: effects do not run during server rendering, so the mount-time purge of
  // the legacy provider key is covered by tests/task01-interaction.test.tsx,
  // not here. This test only proves the existing UI still renders.
  test('existing project hub and navigation still render', async () => {
    const { default: App } = await import('../src/App');
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('MANHWA STUDIO');
    expect(html).toContain('Your Creative Universe');
    expect(html).toContain(project.title);
    expect(html).toContain(INITIAL_PROJECTS[1].title);
    expect(html).toContain('Open Workspace');
  });
});
