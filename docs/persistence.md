# Persistence

How persistent scopes (`local`, `tab`, `bucket`) read and write stored values.

---

## Custom serializer

```ts
serialize?: Serializer<T>
```

```ts
interface Serializer<T> {
  stringify(value: T): string
  parse(raw: string): T
}
```

For types that don't round-trip through JSON (e.g., `Set`, `Map`, `Date`). When a custom serializer is provided, migration and validation are skipped.

```ts
const tags = state('tags', {
  default: new Set<string>(),
  scope: 'local',
  serialize: {
    stringify: (value) => JSON.stringify([...value]),
    parse: (raw) => new Set(JSON.parse(raw)),
  },
})

tags.set(new Set(['ts', 'react']))
// Stored as '["ts","react"]', hydrated back to a Set
```

---

## Migration

```ts
version?: number
migrate?: Record<number, (old: unknown) => unknown>
```

Upgrade stored values when your schema changes.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `version` | `number` | `1` | Current schema version |
| `migrate` | `Record<number, fn>` | — | Functions keyed by the version they migrate **from** |

Migrations run sequentially. A value at v1 runs through `1` then `2` to reach v3. Values without a version envelope are treated as v1. If a migration throws, the result is passed to `validate`; if that also fails, `default` is used.

Stored format:

```json
{ "v": 3, "data": { "theme": "light", "fontSize": 14, "compact": false } }
```

### Walkthrough

Suppose you ship v1 of a settings object:

```ts
// v1 — initial release
const settings = state('settings', {
  default: { theme: 'light' },
  scope: 'local',
})
```

Later you add `fontSize`:

```ts
// v2 — added fontSize
const settings = state('settings', {
  default: { theme: 'light', fontSize: 14 },
  scope: 'local',
  version: 2,
  migrate: {
    1: (old: any) => ({ ...old, fontSize: 14 }),
  },
})
```

Later you rename `theme` to `colorScheme` and add `compact`:

```ts
// v3 — renamed theme → colorScheme, added compact
const settings = state('settings', {
  default: { colorScheme: 'light', fontSize: 14, compact: false },
  scope: 'local',
  version: 3,
  migrate: {
    1: (old: any) => ({ ...old, fontSize: 14 }),
    2: (old: any) => ({
      colorScheme: old.theme ?? 'light',
      fontSize: old.fontSize,
      compact: false,
    }),
  },
})
```

A user who last visited on v1 runs through both migrations: `1 → 2 → 3`. A user on v2 runs only migration `2`. A user on v3 skips migration entirely.

Keep every migration function in the chain — removing old ones breaks users who haven't visited since that version.

---

## Selective persistence

```ts
persist?: Array<keyof T & string>
```

Only persist the listed keys of an object value. Non-listed keys remain in memory but are excluded from storage writes. On read, persisted keys are merged with the default value.

```ts
const editor = state('editor', {
  default: { fontSize: 14, cursorPosition: 0, unsavedChanges: false },
  scope: 'local',
  persist: ['fontSize'],
})

// Only fontSize is written to localStorage.
// cursorPosition and unsavedChanges stay in memory
// and reset to their defaults on reload.
```

---

## Validation

```ts
validate?: (value: unknown) => value is T
```

Type-guard that runs on every read from storage. Falls back to `default` on failure. Runs after migration.

```ts
interface Settings {
  theme: 'light' | 'dark'
  fontSize: number
}

const settings = state('settings', {
  default: { theme: 'light', fontSize: 14 } as Settings,
  scope: 'local',
  validate: (v): v is Settings =>
    typeof v === 'object' &&
    v !== null &&
    'theme' in v &&
    'fontSize' in v &&
    (v.theme === 'light' || v.theme === 'dark') &&
    typeof v.fontSize === 'number',
})

// If someone manually edits localStorage to { theme: "blue", fontSize: "big" },
// validation fails and the value falls back to the default.
```

---

## How they work together

On every read from storage, gjendje runs this pipeline:

1. **Deserialize** — `serialize.parse(raw)` if a custom serializer is set, otherwise `JSON.parse`
2. **Migrate** — if the stored version is less than `version`, run each migration function in sequence
3. **Validate** — if `validate` is set, run the type-guard on the result
4. **Fallback** — if any step fails, use `default`

When a custom serializer is provided, steps 2 and 3 are skipped — the serializer is expected to handle the full round-trip.
