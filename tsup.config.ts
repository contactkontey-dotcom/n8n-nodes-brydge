import { defineConfig } from "tsup";

/*
 * n8n loads each node and credential as a CommonJS file named in package.json's
 * `n8n` field, and provides `n8n-workflow` itself at runtime. So those are the
 * entries, the format is CJS, and `n8n-workflow` is external — while `brydge-core`
 * is bundled in (`noExternal`), so the published node carries no runtime
 * dependency of its own and n8n sees a self-contained package.
 */
export default defineConfig({
  entry: {
    "nodes/Brydge/Brydge.node": "nodes/Brydge/Brydge.node.ts",
    "credentials/BrydgeApi.credentials": "credentials/BrydgeApi.credentials.ts",
  },
  outDir: "dist",
  format: ["cjs"],
  target: "node20",
  dts: false,
  sourcemap: false,
  clean: true,
  external: ["n8n-workflow"],
  noExternal: ["brydge-core"],
  /*
   * n8n community nodes may not read the `process` global, and the scanner
   * rejects any that does. `brydge-core` reads `process.env` only as a fallback
   * when no key or URL is passed — which the n8n node always passes from the
   * credential. Fold `process` to `undefined` so that dead branch, and the
   * global with it, never reaches the bundle.
   */
  define: { process: "undefined" },
});
