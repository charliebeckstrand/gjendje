---
'gjendje': patch
---

**Production readiness: CI guardrails and build hardening**

- **Type declaration validation**: Added `@arethetypeswrong/cli` (`attw`) to verify `.d.ts` and `.d.cts` files resolve correctly for both ESM and CJS consumers. Runs in CI and as part of `prepublishOnly`.
- **Coverage thresholds**: Added minimum coverage thresholds to `vitest.config.ts` (lines: 90%, functions: 90%, branches: 80%, statements: 90%) enforced in CI via `pnpm test:coverage`.
- **`prepublishOnly` reorder**: Build now runs first so `publint` and `attw` validate actual build output, and build failures fast-fail before the slower test suite.
