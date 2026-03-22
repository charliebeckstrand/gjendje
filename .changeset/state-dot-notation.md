---
'gjendje': minor
---

Add dot-notation scope shortcuts on `state`: `state.local()`, `state.session()`, `state.url()`, `state.bucket()`, `state.server()`. Deprecate standalone scope shortcut exports (`local()`, `session()`, `url()`, `bucket()`, `server()`) with a console warning — these will be removed in 1.0.0.
