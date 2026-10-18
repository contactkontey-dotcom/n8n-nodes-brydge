#!/usr/bin/env node
/*
 * Lint this package with n8n's own community-node scanner ruleset
 * (@n8n/scan-community-package) — the SAME rules the n8n verification gate runs
 * at publish time, including the `@n8n/eslint-plugin-community-nodes` rules that
 * `eslint-plugin-n8n-nodes-base` alone does not carry (for example: inputs and
 * outputs must use the `NodeConnectionTypes` enum, not the "main" string
 * literal; catch blocks must throw a NodeApiError / NodeOperationError, never a
 * raw error). We run the scanner's exported analyzer against the local checkout
 * instead of a downloaded tarball, so a regression fails here and in CI rather
 * than only at the registry scan.
 *
 * The scanner runs two legs; so do we:
 *   - source: package.json + the shippable node/credential sources (.ts)
 *   - dist:   the compiled output + package.json (only when dist/ is built)
 */
import { existsSync } from "node:fs";
import { analyzePackage, SOURCE_FILE_PATTERNS } from "@n8n/scan-community-package/scanner/scanner.mjs";

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
