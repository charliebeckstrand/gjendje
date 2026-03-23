---
'gjendje': major
---

Release 1.0.0 — first stable major version.

**Breaking changes:**

- Remove deprecated standalone scope shortcut exports (`local()`, `session()`, `url()`, `bucket()`, `server()`). Use `state.local()`, `state.session()`, `state.url()`, `state.bucket()`, `state.server()` instead.
- Remove deprecated `'tab'` scope alias. Use `'session'` instead.
- Remove `'tab'` from `BucketOptions.fallback` type. Use `'session'` instead.

**Improvements:**

- Promote `noNonNullAssertion` and `noExplicitAny` lint rules from warnings to errors.
- Fix size-limit config referencing `withServerSession` from the wrong entry point.
- Update size limit for core bundle from 4 kB to 5 kB.
