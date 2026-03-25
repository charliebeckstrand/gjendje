# Adoption Roadmap

A prioritized plan to close the gap between gjendje's engineering quality and its developer-facing experience. Each phase builds on the previous one, so they should be completed in order unless noted otherwise.

---

## Documentation Site

**Goal**: Match the polish of jotai.org and zustand docs. Developers decide in 30 seconds — GitHub markdown loses that race.

**Why third**: React and Vue bindings give people something to use. A docs site gives them confidence to adopt it. Every subsequent phase (DevTools, migration guides, community) links back to the docs site as the central hub.

### Set up the docs site

- [ ] **Choose a framework**: Starlight (Astro-based) or VitePress
  - Starlight recommended: built-in search, versioning, i18n, sidebar generation
  - Fast, static, deploys to Vercel/Netlify/Cloudflare Pages for free

- [ ] **Scaffold the project**
  - Create `docs-site/` directory (or a separate repo if preferred)
  - Configure with gjendje branding (logo already exists as `logo.png`)

- [ ] **Migrate existing markdown docs**
  - Port all docs files into the site's content structure
  - Organize into sidebar groups: Getting Started, Core API, Primitives, Scopes, Persistence, Utilities, React, Vue, Advanced

- [ ] **Deploy to a custom domain or subdomain**
  - e.g., `gjendje.dev` or `docs.gjendje.dev`
  - Add to package.json `homepage` field
  - Update README to link to the site

### Enhance the content

- [ ] **Add interactive code playgrounds**
  - Use Stackblitz embeds or Astro's built-in code component
  - At minimum: quick-start example, React hooks example, Vue composables example, persistence example

- [ ] **Add a feature comparison table**
  - gjendje vs Zustand vs Jotai vs Redux Toolkit vs Nanostores
  - Columns: Bundle size, TypeScript, Persistence, SSR, Cross-tab sync, Framework support, DevTools

- [ ] **Add an architecture diagram**
  - Visual showing the adapter pattern: `state() → Adapter → Storage Backend`
  - Show how scopes map to storage layers

- [ ] **Write a "Why gjendje?" page**
  - Lead with the storage-agnostic pitch
  - "One API, six storage backends, zero config changes"
  - Real-world scenario: "Your prototype uses memory state. Ship to production by changing one word to `state.local()`."

---

## README and First-Impression Overhaul

**Goal**: Win the 30-second evaluation. A developer scanning npm or GitHub should immediately understand why gjendje exists and why it's better for their use case.

**Why here**: By now gjendje has React/Vue hooks, a docs site, and DevTools. The README can credibly link to all of them. Overhauling the README before the substance exists would be premature.

### Restructure the README

- [ ] **Hero section**
  - One-line pitch: "One API. Six storage backends. Zero config changes."
  - Badge row: npm version, bundle size (via bundlephobia), CI status, license
  - Animated GIF or code diff showing scope switching (`state('x', ...)` → `state.local('x', ...)`)

- [ ] **"Why gjendje?" section** (3-4 bullet points)
  - Storage-agnostic: memory, localStorage, sessionStorage, URL, Storage Buckets, server — same API
  - Built-in persistence: validation, versioned migrations, cross-tab sync — no plugins needed
  - Tiny: 5 kB core, 9 kB with everything
  - Framework-agnostic: works with React, Vue, Svelte, and vanilla JS

- [ ] **Quick-start with framework hooks** (not just vanilla)
  - Show `useGjendje()` in a React component and `useGjendje()` in a Vue component
  - This is what most visitors want to see first

- [ ] **Feature comparison table**
  - Inline table: gjendje vs Zustand vs Jotai vs Redux Toolkit
  - Columns: Persistence, Migrations, Cross-tab sync, SSR, URL state, Bundle size

- [ ] **Link to docs site** (not 11 separate markdown files)

### npm metadata

- [ ] Update `description` in package.json if a punchier one emerges
- [ ] Add `homepage` pointing to docs site
- [ ] Verify keywords are optimal for npm search discovery

---

## Migration Guides and Comparison Content

**Goal**: Lower the switching cost. Developers don't adopt new libraries in a vacuum — they migrate from something. Make that path obvious.

### Migration from Zustand

- [ ] **Write `docs/migrate-from-zustand.md`**
  - Side-by-side code comparisons: Zustand store → gjendje state
  - Cover: basic store, selectors, persist middleware → `state.local()`, subscriptions, devtools
  - Highlight what gjendje adds: built-in migrations, cross-tab sync, URL state, server scope
  - Honest about tradeoffs: Zustand's middleware ecosystem is larger, community is bigger

### Migration from Redux Toolkit

- [ ] **Write `docs/migrate-from-redux.md`**
  - Slice → state, selector → computed/select, thunk → effect, persist → scope
  - Show the boilerplate reduction

### Migration from Jotai

- [ ] **Write `docs/migrate-from-jotai.md`**
  - Atom → state, derived atom → computed, atomWithStorage → `state.local()`
  - Highlight: framework-agnostic, built-in migrations, cross-tab sync

---

## Community Infrastructure

**Goal**: Signal longevity and openness. Developers check for community health before depending on a library in production.

### Contribution foundations

- [ ] **Create `CONTRIBUTING.md`**
  - Dev setup instructions (clone, `pnpm install`, `pnpm test`)
  - Code style rules (reference CLAUDE.md / biome.json)
  - PR process: branch naming, changeset requirement, CI must pass
  - Issue labeling convention (bug, feature, docs, performance)

- [ ] **Create `CODE_OF_CONDUCT.md`**
  - Adopt Contributor Covenant v2.1 (industry standard)

- [ ] **Add GitHub issue templates**
  - `.github/ISSUE_TEMPLATE/bug_report.yml` — version, repro steps, expected vs actual
  - `.github/ISSUE_TEMPLATE/feature_request.yml` — use case, proposed API, alternatives considered

- [ ] **Add PR template**
  - `.github/PULL_REQUEST_TEMPLATE.md` — description, changeset included?, tests added?

### Community channels

- [ ] **Enable GitHub Discussions**
  - Categories: Q&A, Ideas, Show & Tell
  - Lower barrier than issues for questions and feedback

- [ ] **Consider a Discord server** (optional, only if traction warrants moderation effort)

---

## Signals Compatibility Story

**Goal**: Have an answer for the biggest paradigm shift in frontend (TC39 Signals proposal). Even "we're watching it" is better than silence.

### Research and position

- [ ] **Evaluate TC39 Signals proposal alignment**
  - gjendje's `get()`/`set()`/`subscribe()` pattern maps closely to the Signal API shape
  - Determine if gjendje instances could implement the `Signal` protocol when it stabilizes
  - Write up findings in `docs/signals.md`

### Prototype (optional, depends on TC39 timeline)

- [ ] **Experiment with a `Signal` adapter**
  - `toSignal(instance)` — wraps a gjendje instance in the TC39 Signal interface
  - `fromSignal(signal)` — creates a gjendje instance backed by an external Signal
  - This positions gjendje as "the persistence layer for Signals"

---

## Content and Social Proof

**Goal**: Build awareness beyond the npm listing. Libraries win adoption through content, not just code.

### Technical blog posts

- [ ] "Why we built a storage-agnostic state manager" — architecture deep-dive
- [ ] "From prototype to production in one line change" — the scope-switching story
- [ ] "Cross-tab state sync without a library" — educational post featuring gjendje's BroadcastChannel adapter
- [ ] Publish on dev.to, Medium, or personal blog; cross-post to Reddit r/reactjs and r/javascript

### Showcase and adoption

- [ ] **"Built with gjendje" section** on docs site
  - Even small example apps count — build 2-3 demo apps (todo, multi-tab dashboard, URL-driven filters)

- [ ] **Stackblitz/CodeSandbox templates**
  - One-click starter templates for React + gjendje, Vue + gjendje, vanilla + gjendje
  - Link from README and docs site

---

## Svelte Bindings (`gjendje/svelte`) — Stretch Goal

**Goal**: Complete the framework coverage trifecta.

**Why last**: Svelte's store contract (`subscribe` method) means gjendje instances already work with `$store` syntax with minimal wrapping. The ROI is lower than React/Vue because less adapter code is needed and the audience is smaller.

- [ ] **Create `src/svelte/index.ts` entry point**
  - Export a Svelte-compatible store contract wrapper
  - Should be usable with `$store` syntax directly
- [ ] Add `svelte` as optional peer dependency
- [ ] Add exports map entry, tsup config, size budget, tests
- [ ] Write `docs/svelte.md`

---

## Summary: Execution Order

| Phase | Effort | Impact | Dependency | Can Parallel? |
|-------|--------|--------|------------|---------------|
| Docs site | Medium | High | — | — |
| README overhaul | Low | High | Phase 3 (substance to link to) | — |
| Migration guides | Low-Medium | Medium-High | Phase 3 (lives on docs site) | With Phase 5 |
| Community infra | Low | Medium | None | Anytime |
| Signals story | Low-Medium | Medium | None | Anytime |
| Content/social proof | Medium | Medium | Phases 3-5 (need product to promote) | — |
| Svelte bindings | Low | Low-Medium | None | Anytime |
