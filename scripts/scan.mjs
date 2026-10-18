#!/usr/bin/env node
/*
 * LOCAL-ONLY, manual lint against n8n's community-node scanner ruleset.
 *
 * @n8n/scan-community-package is deliberately NOT a dependency of this package.
 * It pulls in `isolated-vm`, a native add-on with no Node 20 prebuild, so
 * installing it compiles from source and breaks `npm ci` on CI/publish runners
 * without a C/C++ toolchain. Keeping it out means nothing here can block an
 * install or a release, so this is an optional tool you run by hand.
 *
 * Install the scanner where that native module can build (Node 22+ with a
 * toolchain), then run this script:
 *   npm i --no-save @n8n/scan-community-package
 *   npm run scan
 *
 * Or, installing nothing, scan the already-published package:
 *   npx @n8n/scan-community-package n8n-nodes-brydge@<version>
 *
 * The n8n registry scan at publish time stays the authority; this just lets you
 * catch its findings early.
 */
import { existsSync } from "node:fs";

let scanner;
try {
  scanner = await import("@n8n/scan-community-package/scanner/scanner.mjs");
} catch {
  console.log(
    "@n8n/scan-community-package is not installed (intentionally — it needs the\n" +
      "native isolated-vm module). To run the source scan on a capable machine:\n" +
      "  npm i --no-save @n8n/scan-community-package && npm run scan\n" +
      "Or scan the published package with no install:\n" +
      "  npx @n8n/scan-community-package n8n-nodes-brydge@<version>",
  );
  process.exit(0);
}

const { analyzePackage, SOURCE_FILE_PATTERNS } = scanner;
const dir = process.cwd();
const legs = [["source", SOURCE_FILE_PATTERNS]];
if (existsSync("dist")) legs.push(["dist (compiled)", ["dist/**/*.js", "package.json"]]);

let failed = false;
for (const [name, patterns] of legs) {
  const result = await analyzePackage(dir, patterns);
  if (result.passed) {
    console.log(`✅ scan: ${name} clean`);
  } else {
    failed = true;
    console.log(`❌ scan: ${name} — ${result.message ?? "violations found"}`);
    if (result.details) console.log(result.details);
  }
}
process.exit(failed ? 1 : 0);
