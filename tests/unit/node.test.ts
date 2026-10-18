import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IExecuteFunctions, INodeExecutionData } from "n8n-workflow";
import { Brydge } from "../../nodes/Brydge/Brydge.node";
import { BrydgeApi } from "../../credentials/BrydgeApi.credentials";

/*
 * The node driven through a mock n8n execution context, with BRYDGE's API
 * answered by a stubbed fetch. It checks the node turns its parameters into the
 * right calls and the answers back into item JSON — the adapter's whole job,
 * since the verification itself is the shared core's and is tested there.
 */

afterEach(() => vi.unstubAllGlobals());

const KEY = "brydge_sk_n8n_test";

interface Sent {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

function stubFetch(answer: (s: Sent) => { status?: number; body?: unknown; headers?: Record<string, string> }) {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const u = new URL(href);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const record: Sent = { method: (init?.method ?? "GET").toUpperCase(), path: u.pathname + u.search, body };
    sent.push(record);
    const a = answer(record);
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { "content-type": "application/json", ...(a.headers ?? {}) } });
  });
  return sent;
}

/** A mock IExecuteFunctions over one item's parameters. */
function ctx(params: Record<string, unknown>, opts: { continueOnFail?: boolean; baseUrl?: string } = {}): IExecuteFunctions {
  const node = { name: "BRYDGE", type: "brydge", typeVersion: 1, position: [0, 0] as [number, number], parameters: {} };
  return {
    getInputData: () => [{ json: {} }] as INodeExecutionData[],
    getCredentials: async () => ({ apiKey: KEY, baseUrl: opts.baseUrl ?? "https://brydge.test" }),
    getNodeParameter: (name: string, _i: number, fallback?: unknown) => (name in params ? params[name] : fallback),
    continueOnFail: () => opts.continueOnFail ?? false,
    getNode: () => node,
  } as unknown as IExecuteFunctions;
}

const run = (c: IExecuteFunctions) => new Brydge().execute.call(c);

describe("the BRYDGE node", () => {
  it("describes itself as an n8n node with the operations and the credential", () => {
    const d = new Brydge().description;
    expect(d.name).toBe("brydge");
    expect(d.credentials).toEqual([{ name: "brydgeApi", required: true }]);
    const op = d.properties.find((p) => p.name === "operation");
    // Options are ordered alphabetically by display name, as n8n's node linter requires.
    expect((op?.options as Array<{ value: string }>).map((o) => o.value)).toEqual(["finding", "headroom", "report", "supervise", "verify"]);
    expect(new BrydgeApi().name).toBe("brydgeApi");
  });

  it("supervises: sends the API's body and returns the decision", async () => {
    const sent = stubFetch(() => ({ body: { id: "sup_1", decision: "ALLOWED", mandateId: "mdt_1", because: "within mandate", checked: [], unobserved: [], replayed: false, settled: null, next: null } }));
    const out = await run(ctx({ operation: "supervise", actor: " agent:refund-ops ", action: "refund", target: "pi_1", facts: { amount: 4200 }, idempotencyKey: "refund:pi_1" }));
    expect(sent[0]!.body).toEqual({ actor: "agent:refund-ops", action: "refund", target: "pi_1", facts: { amount: 4200 }, idempotencyKey: "refund:pi_1" });
    expect(out[0]![0]!.json).toMatchObject({ id: "sup_1", decision: "ALLOWED" });
  });

  it("accepts facts typed as a JSON string, and refuses a non-object", async () => {
    stubFetch(() => ({ body: { id: "s", decision: "ALLOWED", mandateId: null, because: "", checked: [], unobserved: [], replayed: false } }));
    const sent = stubFetch((s) => (s.path === "/api/supervise" ? { body: { id: "s", decision: "ALLOWED", mandateId: null, because: "", checked: [], unobserved: [], replayed: false } } : {}));
    await run(ctx({ operation: "supervise", actor: "a", action: "refund", target: "t", facts: '{"amount": 10}', idempotencyKey: "k" }));
    expect(sent[0]!.body!.facts).toEqual({ amount: 10 });

    await expect(run(ctx({ operation: "supervise", actor: "a", action: "refund", target: "t", facts: "[1,2]", idempotencyKey: "k" }))).rejects.toThrow(/Facts must be a JSON object/);
  });

  it("escalates without throwing, so a workflow can branch", async () => {
    stubFetch(() => ({ body: { id: "sup_2", decision: "ESCALATED", mandateId: null, because: "a person decides", checked: [], unobserved: ["amount"], replayed: false, settled: null, next: "ask again with the same idempotency key" } }));
    const out = await run(ctx({ operation: "supervise", actor: "a", action: "refund", target: "t", idempotencyKey: "k" }));
    expect(out[0]![0]!.json).toMatchObject({ decision: "ESCALATED", settled: null, next: expect.stringMatching(/same idempotency key/) });
  });

  it("reports an outcome", async () => {
    const sent = stubFetch(() => ({ body: { recorded: "SUCCEEDED" } }));
    const out = await run(ctx({ operation: "report", authorization: "sup_1", outcome: "SUCCEEDED", said: "done" }));
    expect(sent[0]!).toMatchObject({ method: "POST", path: "/api/supervise/sup_1/outcome", body: { verdict: "SUCCEEDED", said: "done" } });
    expect(out[0]![0]!.json).toMatchObject({ authorization: "sup_1", reported: "SUCCEEDED" });
  });

  it("verifies against the records", async () => {
    stubFetch(() => ({ body: { supervisionId: "sup_1", state: "VERIFIED", reason: null, because: "match", externalRef: "re_1", claimed: "SUCCEEDED", agentAgreed: true, checkedAt: "2026-10-03T00:00:00Z", replayed: false } }));
    const out = await run(ctx({ operation: "verify", authorization: "sup_1" }));
    expect(out[0]![0]!.json).toMatchObject({ authorization: "sup_1", state: "VERIFIED", agentAgreed: true });
  });

  it("asks for headroom", async () => {
    const sent = stubFetch(() => ({ body: { actor: "a", action: "refund", actions: 3, remaining: { actions: 2, valueCents: null } } }));
    await run(ctx({ operation: "headroom", actor: "agent:refund-ops", action: "refund" }));
    expect(sent[0]!.path).toBe("/api/headroom?actor=agent%3Arefund-ops&action=refund");
  });

  it("on continue-on-fail, a BRYDGE refusal becomes an item, not a thrown run", async () => {
    stubFetch(() => ({ status: 402, body: { error: "no value declared", reason: "nothing_declared" } }));
    const out = await run(ctx({ operation: "supervise", actor: "a", action: "refund", target: "t", idempotencyKey: "k" }, { continueOnFail: true }));
    expect(out[0]![0]!.json).toMatchObject({ status: 402, reason: "nothing_declared" });
  });

  it("the same refusal throws when continue-on-fail is off", async () => {
    stubFetch(() => ({ status: 402, body: { error: "no value declared" } }));
    await expect(run(ctx({ operation: "supervise", actor: "a", action: "refund", target: "t", idempotencyKey: "k" }))).rejects.toThrow(/402/);
  });
});

describe("the package", () => {
  it("names itself an n8n community node and points n8n at its built files", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(pkg.keywords).toContain("n8n-community-node-package");
    expect(pkg.n8n.nodes).toEqual(["dist/nodes/Brydge/Brydge.node.js"]);
    expect(pkg.n8n.credentials).toEqual(["dist/credentials/BrydgeApi.credentials.js"]);
    /* The node reports this exact version to BRYDGE, so it must match. */
    const node = readFileSync(new URL("../../nodes/Brydge/Brydge.node.ts", import.meta.url), "utf8");
    expect(node).toContain(`const PACKAGE_VERSION = "${pkg.version}"`);
  });
});
