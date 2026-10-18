# n8n-nodes-brydge

An [n8n](https://n8n.io) community node for [BRYDGE](https://www.brydge-ai.com): ask before an agent acts, then check against the destination system's own records whether the work actually happened.

It is a thin wrapper over [`brydge-core`](https://www.npmjs.com/package/brydge-core) — the same verification client the BRYDGE LangChain and MCP packages use — bundled in, so the node has no runtime dependencies of its own.

## What it does

One node, five operations:

| Operation | What it does |
| --- | --- |
| **Supervise** | Ask BRYDGE whether the agent may take an action, before it does. `ALLOWED` returns an authorization id to cite at the destination; `ESCALATED` means a person decides. |
| **Report Outcome** | Tell BRYDGE what the agent believes happened. BRYDGE keeps it beside the finding; it never decides it. |
| **Verify** | Read the destination's own records now and say whether the work happened as permitted. |
| **Get Finding** | What BRYDGE has found so far, without reading the records again. |
| **Get Headroom** | How much the agent may do without a person in any 24 hours, and why. |

The flow a workflow builds: **Supervise → (if `ALLOWED`, your own nodes carry the action out, writing the authorization into the record they create) → Report Outcome → Verify.**

`ESCALATED` is returned, not thrown, so a workflow can branch on it with an **IF** node and ask the same question again — with the same **Idempotency Key** — once the person has answered. Only a fault (a bad key, no declared value, a rate limit) is an error, which an item carries when the node runs with *Continue On Fail*.

## Install

In n8n: **Settings → Community Nodes → Install**, and enter `n8n-nodes-brydge`.

Then add a **BRYDGE API** credential: your API key (it starts with `brydge_sk_`; issue one in BRYDGE on the Connect page) and, if you self-host BRYDGE, its URL.

## Development

```bash
# In the monorepo, build the shared core once so this package can bundle it:
npm --prefix ../core install && npm --prefix ../core run build

npm install          # links brydge-core from ../core
npm run build        # bundles brydge-core in and copies the icon into dist
npm test             # the node driven through a mock n8n context
```

Published standalone, this package depends on `brydge-core` from npm instead of `../core`; the bundle is the same either way.

## Publishing and submitting

A community node is an npm package n8n installs by name. Since 1 May 2026 n8n only verifies nodes **published from GitHub Actions with npm provenance** — a node published by hand from a laptop is refused. So this package publishes from CI.

1. **Publish to npm from CI, with provenance.** The release runs in the public [`n8n-nodes-brydge`](https://github.com/contactkontey-dotcom/n8n-nodes-brydge) repository, where `.github/workflows/publish.yml` publishes with `npm publish --provenance` on a version tag. One-time, set up OIDC trusted publishing on the npm package (the exact fields are in the header of `publish.yml`); then release by tagging:

   ```bash
   # bump "version" in package.json, commit, then:
   git tag v0.1.1 && git push origin v0.1.1
   ```

   The tag triggers the workflow. `prepublishOnly` runs the typecheck and tests and `prepack` builds `dist`, so a broken build never ships. The package declares `n8n-community-node-package` in its keywords and `n8n-workflow` as a peer dependency, with no runtime dependencies of its own — `brydge-core` is bundled into `dist`, so the published tarball carries nothing to resolve (and nothing separate to attest).

   An npm version is immutable: `0.1.0` was published by hand without provenance and cannot be given it after the fact, so the first verified release is `0.1.1`.

2. **Install it in any n8n** via Settings → Community Nodes → `n8n-nodes-brydge`.

3. **Submit for verification** (optional, to appear in n8n's built-in search). Follow n8n's current process at <https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/>. Before submitting, run their linter so the review passes first time:

   ```bash
   npx eslint-plugin-n8n-nodes-base   # or: npx @n8n/scan-community-package n8n-nodes-brydge
   ```

   The node already follows the conventions the review checks: a `file:` icon, a credential with a password-typed key, operations with `action` and `description`, a `subtitle`, and no runtime dependencies.

## License

MIT
