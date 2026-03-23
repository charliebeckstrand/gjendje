---
'gjendje': patch
---

Deduplicate and simplify internal code — extract shared helpers for interceptors, change handlers, watcher management, lazy destroyed promises, key validation, scope shortcuts, and unit parsing, reducing ~220 lines of duplicated logic with no behavioral changes
