---
'gjendje': patch
---

Fix race conditions in SSR hydration, cross-tab sync, and bucket adapter — prevent hydration from overwriting user-set values, guard sync message handler against post-destroy delivery, and clean up bucket delegate on mid-swap destroy
