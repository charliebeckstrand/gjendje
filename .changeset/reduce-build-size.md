---
'gjendje': patch
---

**Reduce npm package size by ~33%** by enabling minification in the tsup build config.

- JS runtime output shrinks from ~156 KB to ~78 KB (50% reduction)
- Overall unpacked size drops from ~245 KB to ~165 KB
- No feature or API changes — only the dist output is minified via esbuild
