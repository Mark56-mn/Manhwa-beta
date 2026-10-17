# Manhwa Studio Implementation Plan (Revised)

An AI-powered web production studio for creators to build structured story bibles, episode outlines, scripts, character continuity boards, and scene breakdowns with a Modern Dark Webtoon aesthetic.

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your questionnaire responses and feedback, we have configured the following core architecture and design choices:
> - **Aesthetic Direction**: Modern Dark Webtoon (deep slate `#0B0F19` background, electric cyan & violet neon accents, dramatic manga panel borders, typography pairing Plus Jakarta Sans + JetBrains Mono).
> - **Core Focus**: Complete Story Bible & Episode Script Generator (Premise, World Rules, Character Continuity Anchors, Scene-by-Scene Script breakdown, Dialogue & Narration).
> - **Initialization & AI**: Full Sandbox Demo Mode preloaded with rich sample manhwa projects (e.g. "Cyber Awakening: Neo Seoul", "Shadow Monarch Chronicles"), plus live Gemini API integration (`GEMINI_API_KEY`) for real-time AI generation.
> - **Getting Started Guide**: Interactive onboarding modal / drawer explaining the premise and how to navigate core features.
> - **YouTube Publishing & Approval Center**: Dedicated approval center for reviewing rendered motion comic videos, connecting YouTube OAuth securely, and publishing privately/unlisted with mandatory dual-confirmation for public release.

- **Confirmed Decision 1**: Client-side robust state with localStorage persistence and Firestore-ready data models for multi-project management.
- **Confirmed Decision 2**: Sandbox mode enabled by default for instant zero-friction testing without requiring an immediate API key, while supporting live Gemini API calls when configured.

---

## 1. Overview & Core Concept

- **What It Does**: Manhwa Studio provides creators with a professional workspace to organize their creative universe (Story Bible, Character Sheets, World Rules) and generate detailed episodic outlines, scripts, and scene prompts.
- **Target Audience**: Manhwa creators, comic writers, webtoon artists, and storytelling enthusiasts.
- **Key Value**: Streamlines the creation of webtoon canons, maintains strict character continuity, and automates structured scriptwriting.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Getting Started & Onboarding**: Clean greeting tour explaining the premise, how to use the AI generator, manage story bibles, and export scripts.
  2. **Dashboard / Project Hub**: Browse existing projects, create a new manhwa project with genre/art-style preferences, or load demo projects.
  3. **Story Bible Workspace**: Manage Premise, Logline, World Rules, Character Profiles (with visual anchor tags and relationships), and Terminology glossary.
  4. **Episode & Script Builder**: Plan episode outlines, generate scene breakdowns (Visual description, action, dialogue, narration, sound effects, image prompt), and refine scripts with AI assistance or manual editing.
  5. **Approval Center & YouTube Publishing**: Review generated/rendered video assets, connect YouTube OAuth securely, execute private/unlisted uploads, and perform explicit dual-confirmation for public release.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Modern Dark Webtoon.
  - *Color Palette*: Deep slate canvas (`bg-[#0B0F19]`, `bg-[#131B2E]`), subtle borders (`border-slate-800`), electric cyan accents (`text-cyan-400`, `bg-cyan-500`), vibrant violet highlights (`text-violet-400`).
  - *Typography*: Display & Headings: `Plus Jakarta Sans` / `Outfit`; Data & Monospace telemetry: `JetBrains Mono`.
  - *Component Styling*: Single-elevation cards with hairline borders (`border border-slate-800`), generous whitespace, unboxed metadata with bullet separators (`·`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1**: Dual Mode (Sandbox & Live Gemini).
  - *Chosen Approach*: Fully functional offline sandbox mode with preloaded demo data and intelligent mock generators, plus live Gemini API key connection.
  - *Why*: Allows instant zero-setup evaluation while giving power users the ability to connect their own Gemini API key.
- **Decision 2**: YouTube Publishing Architecture.
  - *Chosen Approach*: YouTube upload feature resides in the **Approval Center**, enforcing secure OAuth authentication, default private/unlisted safety, and strict separation between upload and public publication.
  - *Why*: Adheres strictly to publishing safety guidelines and prevents accidental public releases.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    Manhwa Studio App                    │
├──────────────────────────────┬──────────────────────────┤
│   Project & Settings State   │   Story Bible Manager    │
├──────────────────────────────┴──────────────────────────┤
│   Episode & Script Generator / Approval Center          │
├──────────────────────────────┬──────────────────────────┤
│   Sandbox Simulation Engine  │  Gemini & YouTube Router │
└──────────────────────────────┴──────────────────────────┘
```

- **Data Models**:
  - `Project`: id, title, genre, synopsis, artStyle, status, updatedAt, coverImage.
  - `StoryBible`: premise, logline, worldRules (array), characters (array of {name, role, description, visualAnchor, personality}), terminology (array of {term, definition}).
  - `Episode`: id, episodeNumber, title, synopsis, outline (array), scenes (array of {sceneNumber, setting, action, dialogue, narration, sfx, imagePrompt}).
  - `ApprovalRecord`: id, artifactRef, action, approver, timestamp, status, youtubeUploadState.

---

## 5. Verification Plan

- **Automated / Build Verification**:
  - Run `compile_applet` and `lint_applet` to ensure zero compilation or TypeScript errors.
- **Manual Verification**:
  - Verify Getting Started guide opens correctly on first launch.
  - Test project creation and switching between sandbox projects.
  - Test Story Bible creation, character additions, and rule edits.
  - Test Episode Script generation and YouTube Approval Center workflow.
