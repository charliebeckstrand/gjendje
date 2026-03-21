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

---

## Selective persistence

```ts
persist?: Array<keyof T & string>
```

Only persist the listed keys of an object value. Non-listed keys remain in memory but are excluded from storage writes. On read, persisted keys are merged with the default value.

---

## Validation

```ts
validate?: (value: unknown) => value is T
```

Type-guard that runs on every read from storage. Falls back to `default` on failure. Runs after migration.
