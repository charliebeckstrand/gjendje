# Adoption Roadmap

A prioritized plan to close the gap between gjendje's engineering quality and its developer-facing experience. Each phase builds on the previous one, so they should be completed in order unless noted otherwise.

---

## Phase 1: React Bindings (`gjendje/react`)

**Goal**: Remove the #1 adoption blocker. 80%+ of potential users are React developers — no hook means no adoption.

**Why first**: Nothing else matters if developers can't use gjendje idiomatically in React. Every other improvement (docs site, DevTools, marketing) amplifies a product people can actually install and use in 5 minutes.

### 1.1 — Core hooks

Ship a `gjendje/react` entry point with hooks built on `useSyncExternalStore`.

- [ ] **Create `src/react/index.ts` entry point**
  - Export `useGjendje(instance)` — returns current value, re-renders on change
  - Export `useGjendjeValue(instance)` — read-only variant (for `ReadonlyInstance` / `ComputedInstance`)
  - Export `useGjendjeSelector(instance, selector)` — derived slice with referential equality check
  - All hooks must use `useSyncExternalStore` for React 18+ concurrent rendering safety

- [ ] **Add React as optional peer dependency**
  - `peerDependencies: { "react": ">=18.0.0" }` with `peerDependenciesMeta: { "react": { "optional": true } }`
  - Tree-shakes completely when not imported

- [ ] **Add `gjendje/react` to package.json exports map**
  - ESM + CJS conditional exports matching the existing `gjendje` and `gjendje/server` patterns
  - Include TypeScript declarations

- [ ] **Update tsup config**
  - Add `src/react/index.ts` as a third entry point
  - Ensure it splits into its own chunk (no core code duplication)

### 1.2 — Quality gates

- [ ] **Add size-limit budget**
  - Target: `gjendje/react` entry < 1 kB (it's mostly wiring)

- [ ] **Write tests**
  - Hook renders with initial value
  - Re-renders on `set()`, `patch()`, `reset()`
  - Selector skips re-render when selected slice is unchanged
  - Works with `computed`, `select`, `collection`, `readonly`, `withHistory`
  - SSR hydration: hook returns default value on server, real value after hydration
  - Concurrent mode: no tearing under `startTransition`

### 1.3 — Documentation

- [ ] **Write `docs/react.md`** — usage guide with examples for each hook
- [ ] **Add React section to README quick-start**
- [ ] **Add React examples to `docs/examples.md`**

---

## Phase 2: Vue Bindings (`gjendje/vue`)

**Goal**: Capture the second-largest frontend framework audience with idiomatic Vue composables.

**Why second**: Vue has a massive global user base (~3M weekly npm downloads for vue@3). Shipping Vue bindings immediately after React signals that gjendje is genuinely framework-agnostic — not just React-with-extras.

### 2.1 — Core composables

- [ ] **Create `src/vue/index.ts` entry point**
  - Export `useGjendje(instance)` — returns a Vue `Ref<T>` that syncs bidirectionally with the instance
  - Export `useGjendjeReadonly(instance)` — returns `Readonly<Ref<T>>` (for `ReadonlyInstance` / `ComputedInstance`)
  - Export `useGjendjeSelector(instance, selector)` — returns a computed `Ref` from a derived slice
  - Use Vue's `ref()`, `watch()`, and `onScopeDispose()` for lifecycle-safe subscriptions

- [ ] **Add Vue as optional peer dependency**
  - `peerDependencies: { "vue": ">=3.3.0" }` with `peerDependenciesMeta: { "vue": { "optional": true } }`
  - Tree-shakes completely when not imported

- [ ] **Add `gjendje/vue` to package.json exports map**
  - ESM + CJS conditional exports matching the existing pattern
  - Include TypeScript declarations

- [ ] **Update tsup config**
  - Add `src/vue/index.ts` as an additional entry point
  - Ensure it splits into its own chunk

### 2.2 — Quality gates

- [ ] **Add size-limit budget**
  - Target: `gjendje/vue` entry < 1 kB

- [ ] **Write tests**
  - Composable returns reactive Ref with initial value
  - Ref updates on `set()`, `patch()`, `reset()`
  - Writing to the Ref calls `set()` on the instance
  - Readonly composable prevents writes
  - Selector returns computed Ref, skips updates when slice is unchanged
  - Subscription cleanup on scope disposal (no memory leaks)
  - Works with `computed`, `select`, `collection`, `readonly`, `withHistory`
  - SSR: composable returns default value during server render

### 2.3 — Documentation

- [ ] **Write `docs/vue.md`** — usage guide with Composition API examples
- [ ] **Add Vue section to README** (alongside React quick-start)
- [ ] **Add Vue examples to `docs/examples.md`**

---

## Phase 3: Documentation Site

**Goal**: Match the polish of jotai.org and zustand docs. Developers decide in 30 seconds — GitHub markdown loses that race.

**Why third**: React and Vue bindings give people something to use. A docs site gives them confidence to adopt it. Every subsequent phase (DevTools, migration guides, community) links back to the docs site as the central hub.

### 3.1 — Set up the docs site

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

### 3.2 — Enhance the content

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

## Phase 4: DevTools

**Goal**: Give developers debugging confidence. "Good enough DevTools" is a requirement for production adoption, not a nice-to-have.

**Why here**: Framework bindings make gjendje usable. Docs make it discoverable. DevTools make it trustworthy for production. Without debugging tools, senior developers and tech leads will veto adoption.

### 4.1 — Redux DevTools adapter

- [ ] **Create `src/devtools/redux-devtools.ts`**
  - Connect to the Redux DevTools Extension via `window.__REDUX_DEVTOOLS_EXTENSION__`
  - On `state()` creation: register instance with DevTools as a named store
  - On `set()` / `patch()` / `reset()`: dispatch action-like events (`{ type: 'set', key, value }`)
  - Support time-travel debugging (DevTools sends `DISPATCH` with `JUMP_TO_STATE`)

- [ ] **Make it opt-in via `configure()`**
  - `configure({ devtools: true })` enables globally
  - `state('key', { devtools: true })` enables per-instance
  - Zero cost when disabled (no DevTools code in production bundles)

- [ ] **Add to exports**
  - Either auto-activate in `configure()` or export as `gjendje/devtools` entry point
  - Must tree-shake completely when unused

- [ ] **Write tests**
  - Mock `window.__REDUX_DEVTOOLS_EXTENSION__` and verify dispatched actions
  - Verify time-travel replays values correctly
  - Verify no-op when DevTools extension is not installed

- [ ] **Write docs**
  - `docs/devtools.md` — setup guide with screenshots
  - Add to docs site under "Advanced" section

### 4.2 — Logger middleware

- [ ] **Create `src/devtools/logger.ts`**
  - `configure({ logLevel: 'debug' })` already exists — enhance it
  - Log format: `[gjendje] key: oldValue → newValue` with console grouping
  - Support custom log transports via `configure({ logger: customFn })`

---

## Phase 5: README and First-Impression Overhaul

**Goal**: Win the 30-second evaluation. A developer scanning npm or GitHub should immediately understand why gjendje exists and why it's better for their use case.

**Why here**: By now gjendje has React/Vue hooks, a docs site, and DevTools. The README can credibly link to all of them. Overhauling the README before the substance exists would be premature.

### 5.1 — Restructure the README

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

### 5.2 — npm metadata

- [ ] Update `description` in package.json if a punchier one emerges
- [ ] Add `homepage` pointing to docs site
- [ ] Verify keywords are optimal for npm search discovery

---

## Phase 6: Migration Guides and Comparison Content

**Goal**: Lower the switching cost. Developers don't adopt new libraries in a vacuum — they migrate from something. Make that path obvious.

### 6.1 — Migration from Zustand

- [ ] **Write `docs/migrate-from-zustand.md`**
  - Side-by-side code comparisons: Zustand store → gjendje state
  - Cover: basic store, selectors, persist middleware → `state.local()`, subscriptions, devtools
  - Highlight what gjendje adds: built-in migrations, cross-tab sync, URL state, server scope
  - Honest about tradeoffs: Zustand's middleware ecosystem is larger, community is bigger

### 6.2 — Migration from Redux Toolkit

- [ ] **Write `docs/migrate-from-redux.md`**
  - Slice → state, selector → computed/select, thunk → effect, persist → scope
  - Show the boilerplate reduction

### 6.3 — Migration from Jotai

- [ ] **Write `docs/migrate-from-jotai.md`**
  - Atom → state, derived atom → computed, atomWithStorage → `state.local()`
  - Highlight: framework-agnostic, built-in migrations, cross-tab sync

---

## Phase 7: Community Infrastructure

**Goal**: Signal longevity and openness. Developers check for community health before depending on a library in production.

### 7.1 — Contribution foundations

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

### 7.2 — Community channels

- [ ] **Enable GitHub Discussions**
  - Categories: Q&A, Ideas, Show & Tell
  - Lower barrier than issues for questions and feedback

- [ ] **Consider a Discord server** (optional, only if traction warrants moderation effort)

---

## Phase 8: Signals Compatibility Story

**Goal**: Have an answer for the biggest paradigm shift in frontend (TC39 Signals proposal). Even "we're watching it" is better than silence.

### 8.1 — Research and position

- [ ] **Evaluate TC39 Signals proposal alignment**
  - gjendje's `get()`/`set()`/`subscribe()` pattern maps closely to the Signal API shape
  - Determine if gjendje instances could implement the `Signal` protocol when it stabilizes
  - Write up findings in `docs/signals.md`

### 8.2 — Prototype (optional, depends on TC39 timeline)

- [ ] **Experiment with a `Signal` adapter**
  - `toSignal(instance)` — wraps a gjendje instance in the TC39 Signal interface
  - `fromSignal(signal)` — creates a gjendje instance backed by an external Signal
  - This positions gjendje as "the persistence layer for Signals"

---

## Phase 9: Content and Social Proof

**Goal**: Build awareness beyond the npm listing. Libraries win adoption through content, not just code.

### 9.1 — Technical blog posts

- [ ] "Why we built a storage-agnostic state manager" — architecture deep-dive
- [ ] "From prototype to production in one line change" — the scope-switching story
- [ ] "Cross-tab state sync without a library" — educational post featuring gjendje's BroadcastChannel adapter
- [ ] Publish on dev.to, Medium, or personal blog; cross-post to Reddit r/reactjs and r/javascript

### 9.2 — Showcase and adoption

- [ ] **"Built with gjendje" section** on docs site
  - Even small example apps count — build 2-3 demo apps (todo, multi-tab dashboard, URL-driven filters)

- [ ] **Stackblitz/CodeSandbox templates**
  - One-click starter templates for React + gjendje, Vue + gjendje, vanilla + gjendje
  - Link from README and docs site

---

## Phase 10: Svelte Bindings (`gjendje/svelte`) — Stretch Goal

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
| 1. React bindings | High | Critical | None | — |
| 2. Vue bindings | Medium | High | None | With Phase 1 |
| 3. Docs site | Medium | High | Phases 1-2 (content to document) | — |
| 4. DevTools | Medium | High | None | With Phase 3 |
| 5. README overhaul | Low | High | Phases 1-4 (substance to link to) | — |
| 6. Migration guides | Low-Medium | Medium-High | Phase 3 (lives on docs site) | With Phase 5 |
| 7. Community infra | Low | Medium | None | Anytime |
| 8. Signals story | Low-Medium | Medium | None | Anytime |
| 9. Content/social proof | Medium | Medium | Phases 1-5 (need product to promote) | — |
| 10. Svelte bindings | Low | Low-Medium | None | Anytime |

Phases 4 and 7 have no dependencies and can be worked on in parallel with earlier phases. Phase 7 is research-first and can begin anytime.
