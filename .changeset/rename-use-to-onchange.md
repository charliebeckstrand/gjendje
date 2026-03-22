---
'gjendje': minor
---

Rename `use()` to `onChange()` on state and collection instances. The `use()` name was overloaded in the JS ecosystem (React hooks, Express middleware) and didn't convey its purpose as a post-write handler. `onChange()` is self-documenting and idiomatic. This is a breaking change — update all `.use(fn)` calls to `.onChange(fn)`.
