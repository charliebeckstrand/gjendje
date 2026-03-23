---
'gjendje': patch
---

Fix subscription and adapter leaks on destroy — store and call unsubscribe in sync.ts and bucket.ts, move hydration adapter cleanup to finally block in core.ts
