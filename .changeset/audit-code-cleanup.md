---
'gjendje': patch
---

Deduplicate and simplify internal code — extract shared helpers for interceptors, change handlers, watch subscriptions, lazy destroyed promises, key validation, and unit parsing, reducing ~120 lines of duplicated logic with no behavioral changes
