---
name: Vite workspace package dep pre-bundling + missing API proxy
description: Two independent bugs caused dashboard crash in pnpm monorepo with Vite + @tanstack/react-query + workspace packages
---

## Bug 1 — Missing Vite API Proxy (the actual crash)

**Symptom:** `data?.map is not a function` crash on all data-rendering components.

**Root cause:** No `server.proxy` in `vite.config.ts`. Dashboard fetches `/api/*` from the Vite dev server (port 23183), which returns its own HTML SPA fallback. `customFetch` parses `text/html` as a string, React Query stores `data = "<html>..."`, and then `"string"?.map(callback)` throws since strings don't have `.map`.

**Fix:** Add proxy in `vite.config.ts`:
```ts
server: {
  proxy: {
    "/api": { target: "http://localhost:8080", changeOrigin: true }
  }
}
```

## Bug 2 — Vite linked-package dep pre-bundling (the "Invalid hook call" warning)

**Symptom:** "Invalid hook call" console error alongside data crash.

**Root cause:** Vite doesn't pre-bundle deps of linked workspace packages. `@workspace/api-client-react` imports `@tanstack/react-query` as raw ESM (not the pre-bundled version). Dashboard's own `useQuery` uses the pre-bundled copy. Two module instances → React "Invalid hook call".

**Fix applied:**
1. `.npmrc`: add `public-hoist-pattern[]=@tanstack/*` (hoists to root node_modules)
2. `vite.config.ts`: add `optimizeDeps.include` with linked-pkg syntax:
   ```ts
   optimizeDeps: {
     include: ["@tanstack/react-query", "@workspace/api-client-react > @tanstack/react-query"],
     force: true,
   }
   ```
3. Keep `resolve.dedupe: ["react", "react-dom", "@tanstack/react-query"]`
4. Do NOT add `resolve.alias` for `@tanstack/react-query` — it bypasses pre-bundling and creates the duplicate.

**Why:** Vite's optimizer runs only for packages in `node_modules`, not workspace source packages. The `"pkg > dep"` syntax explicitly tells Vite to include the dep as part of the pre-bundle for that linked package.
