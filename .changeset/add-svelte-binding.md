---
'gjendje': minor
---

Add **Svelte framework binding** via `gjendje/svelte`.

The new `useGjendje` function creates a Svelte-compatible store from any gjendje instance:

- **Writable instances** → returns a `GjendjeWritable<T>` store with `set`, `update`, and `subscribe` (compatible with Svelte's `Writable` contract)
- **Readonly / computed instances** → returns a `GjendjeReadable<T>` store with `subscribe` only
- **With selector** → returns a readable store holding the selected slice, with automatic deduplication (skips notification when the selected value hasn't changed)

```svelte
<script>
  import { state } from 'gjendje'
  import { useGjendje } from 'gjendje/svelte'

  const count = state('count', { default: 0 })
  const store = useGjendje(count)

  // Use with Svelte's $store syntax
</script>

<button on:click={() => $store++}>
  Count: {$store}
</button>
```

The binding implements the standard Svelte store contract without importing from `svelte`, so it works with Svelte 3, 4, and 5 with zero runtime dependency.
