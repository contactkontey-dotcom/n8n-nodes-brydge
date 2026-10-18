import {
  NodeApiError,
  NodeOperationError,
  type IDataObject,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeType,
  type INodeTypeDescription,
  type JsonObject,
} from "n8n-workflow";
import { BrydgeClient, BrydgeError, type Facts, type Outcome } from "brydge-core";

/** This package's version, sent to BRYDGE as the integration so its logs can tell the node apart. Kept equal to package.json by a test. */
const PACKAGE_VERSION = "0.1.2";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * BRYDGE AS AN n8n NODE — ASK BEFORE ACTING, THEN CHECK IT HAPPENED.
 *
 * A thin adapter: it turns the node's parameters into `brydge-core` calls and
 * the answers back into the item JSON a workflow reads. Every verification
 * decision, the HTTP, the error handling and the https-only rule live in the
 * shared core, not here — the same core the LangChain and MCP packages use.
 *
 * The flow a workflow builds with it:
 *   Supervise → (if ALLOWED, your own node carries the action out, citing the
 *   authorization) → Report Outcome → Verify.
 * ESCALATED means a person decides: the node returns the decision rather than
 * throwing, so a workflow can branch on it and ask the same question again with
 * the same idempotency key once the person has answered.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** `{"amount": 4200}` as typed in a node field → Facts, or a clear error. */
function factsFrom(this: IExecuteFunctions, raw: unknown, itemIndex: number): Facts {
  if (raw === undefined || raw === null || raw === "") return {};
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new NodeOperationError(this.getNode(), "Facts must be a JSON object, such as {\"amount\": 4200}.", { itemIndex });
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new NodeOperationError(this.getNode(), "Facts must be a JSON object, such as {\"amount\": 4200}.", { itemIndex });
  }
  const out: Facts = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else throw new NodeOperationError(this.getNode(), `Fact "${k}" must be a string, number, boolean or null.`, { itemIndex });
  }
  return out;
}

export class Brydge implements INodeType {
  description: INodeTypeDescription = {
    displayName: "BRYDGE",
    name: "brydge",
    icon: { light: "file:brydge.svg", dark: "file:brydge.dark.svg" },
    group: ["transform"],
    version: 1,
    subtitle: '={{ $parameter["operation"] }}',
    description: "Ask BRYDGE before an agent acts, then check against the destination's own records whether the work happened.",
    defaults: { name: "BRYDGE" },
    inputs: ['main'],
    outputs: ['main'],
    usableAsTool: true,
    credentials: [{ name: "brydgeApi", required: true }],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "supervise",
        options: [
          { name: "Get Finding", value: "finding", action: "Get what BRYDGE found so far", description: "What BRYDGE has found so far, without reading the records again" },
          { name: "Get Headroom", value: "headroom", action: "Get how much the agent may do", description: "How much the agent may do without a person in any 24 hours" },
          { name: "Report Outcome", value: "report", action: "Report what happened", description: "Tell BRYDGE what the agent believes happened" },
          { name: "Supervise", value: "supervise", action: "Ask before acting", description: "Ask BRYDGE whether the agent may take an action, before it does" },
          { name: "Verify", value: "verify", action: "Check the records now", description: "Read the destination's records now and say whether the work happened" },
        ],
      },

      /* ---- Supervise ------------------------------------------------- */
      { displayName: "Actor", name: "actor", type: "string", default: "", required: true, description: "The agent asking, as BRYDGE knows it, such as agent:refund-ops", displayOptions: { show: { operation: ["supervise", "headroom"] } } },
      { displayName: "Action", name: "action", type: "string", default: "", required: true, description: 'The kind of work, such as refund. Must have a declared value in BRYDGE.', displayOptions: { show: { operation: ["supervise", "headroom"] } } },
      { displayName: "Target", name: "target", type: "string", default: "", required: true, description: "What the work acts on: the payment, order or ticket", displayOptions: { show: { operation: ["supervise"] } } },
      { displayName: "Facts (JSON)", name: "facts", type: "json", default: "{}", description: "What BRYDGE's mandates judge the action by, such as {\"amount\": 4200}", displayOptions: { show: { operation: ["supervise"] } } },
      { displayName: "Idempotency Key", name: "idempotencyKey", type: "string", default: "", required: true, description: 'A name for this one intended action, such as refund:ch_123. Send the same value to retry, or to get a person\'s answer once they have given it; never reuse it for a different action.', displayOptions: { show: { operation: ["supervise"] } } },

      /* ---- Report / Verify / Finding --------------------------------- */
      { displayName: "Authorization", name: "authorization", type: "string", default: "", required: true, description: 'The authorization ID BRYDGE returned from Supervise', displayOptions: { show: { operation: ["report", "verify", "finding"] } } },
      {
        displayName: "Outcome",
        name: "outcome",
        type: "options",
        default: "SUCCEEDED",
        description: 'What the agent believes happened. BRYDGE keeps it beside the finding; it never decides it.',
        options: [
          { name: "Corrected", value: "CORRECTED" },
          { name: "Failed", value: "FAILED" },
          { name: "Reversed", value: "REVERSED" },
          { name: "Succeeded", value: "SUCCEEDED" },
          { name: "Wrongly Allowed", value: "WRONGLY_ALLOWED" },
          { name: "Wrongly Refused", value: "WRONGLY_REFUSED" },
        ],
        displayOptions: { show: { operation: ["report"] } },
      },
      { displayName: "Said", name: "said", type: "string", default: "", description: "An optional note from the agent about what happened", displayOptions: { show: { operation: ["report"] } } },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const out: INodeExecutionData[] = [];

    const credentials = await this.getCredentials("brydgeApi");
    const client = new BrydgeClient({
      apiKey: credentials.apiKey as string,
      baseUrl: (credentials.baseUrl as string) || undefined,
      integration: `n8n-nodes-brydge/${PACKAGE_VERSION}`,
    });

    for (let i = 0; i < items.length; i++) {
      const operation = this.getNodeParameter("operation", i) as string;
      try {
        let result: unknown;
        if (operation === "supervise") {
          result = await client.supervise({
            actor: this.getNodeParameter("actor", i) as string,
            action: this.getNodeParameter("action", i) as string,
            target: this.getNodeParameter("target", i) as string,
            facts: factsFrom.call(this, this.getNodeParameter("facts", i, {}), i),
            idempotencyKey: this.getNodeParameter("idempotencyKey", i) as string,
          });
        } else if (operation === "report") {
          const authorization = this.getNodeParameter("authorization", i) as string;
          const said = (this.getNodeParameter("said", i, "") as string) || undefined;
          await client.report(authorization, this.getNodeParameter("outcome", i) as Outcome, said === undefined ? {} : { said });
          result = { authorization, reported: this.getNodeParameter("outcome", i) as string };
        } else if (operation === "verify") {
          result = await client.verify(this.getNodeParameter("authorization", i) as string);
        } else if (operation === "finding") {
          result = await client.finding(this.getNodeParameter("authorization", i) as string);
        } else if (operation === "headroom") {
          result = await client.headroom(this.getNodeParameter("actor", i) as string, this.getNodeParameter("action", i) as string);
        } else {
          throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
        }
        out.push({ json: result as IDataObject, pairedItem: { item: i } });
      } catch (error) {
        /*
         * A BRYDGE refusal (a bad key, no declared value, a rate limit) is a
         * fault, not a decision — so on "continue on fail" it becomes an item
         * with the error rather than a thrown run. A decision never lands here:
         * ALLOWED and ESCALATED both come back as results above.
         */
        if (this.continueOnFail()) {
          const brydge = BrydgeError.find(error);
          out.push({
            json: { error: error instanceof Error ? error.message : String(error), status: brydge?.status ?? null, reason: brydge?.reason ?? null },
            pairedItem: { item: i },
          });
          continue;
        }
        /*
         * Otherwise surface the fault as a thrown n8n error. Our own input
         * checks already throw NodeOperationError — rethrow those untouched. A
         * BRYDGE fault becomes a NodeApiError carrying BRYDGE's own message,
         * HTTP status and reason, so the run's error shows the real cause.
         */
        if (error instanceof NodeOperationError || error instanceof NodeApiError) throw error;
        const brydge = BrydgeError.find(error);
        throw new NodeApiError(this.getNode(), (error ?? {}) as JsonObject, {
          itemIndex: i,
          message: brydge?.message,
          httpCode: brydge?.status != null ? String(brydge.status) : undefined,
          description: brydge?.reason ?? undefined,
        });
      }
    }

    return [out];
  }
}
