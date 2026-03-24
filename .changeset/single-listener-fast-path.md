---
'gjendje': patch
---

Single-listener fast path in computed and select notification — when exactly one subscriber exists (common in computed chains), call it directly instead of iterating the Set, avoiding iterator allocation per notification. Computed chain depth-25 +33%, depth-10 +17%, depth-5 +20%.
