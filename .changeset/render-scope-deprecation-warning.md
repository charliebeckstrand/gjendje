---
'gjendje': patch
---

Add runtime deprecation warning when using the `'render'` scope name.

The `'render'` scope was deprecated in v1.0.0 and silently normalized to `'memory'`, but previously gave no runtime feedback. Now, a `console.warn` fires once per session advising users to switch to `'memory'` before the `'render'` alias is removed in the next major version.
