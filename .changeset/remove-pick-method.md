---
'gjendje': patch
---

Remove `pick()` method from state instances. Use destructuring instead: `const { name } = store.get()`. The method provided no value over simple property access or destructuring.
