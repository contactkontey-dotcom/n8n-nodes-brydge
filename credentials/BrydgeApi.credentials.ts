import type { ICredentialType, INodeProperties, Icon } from "n8n-workflow";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BRYDGE CREDENTIAL — A KEY AND WHERE BRYDGE RUNS.
 *
 * n8n stores it encrypted and never shows it again. The node reads it and hands
 * it to the shared `brydge-core` client, which sends it only over https (except
 * to localhost). Nothing here, and nothing the node does, writes the key into a
 * workflow or a log.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class BrydgeApi implements ICredentialType {
  name = "brydgeApi";
  displayName = "BRYDGE API";
  documentationUrl = "https://www.brydge-ai.com";
  icon: Icon = "file:../nodes/Brydge/brydge.svg";

  properties: INodeProperties[] = [
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description: "Your BRYDGE API key. It starts with brydge_sk_. Issue one in BRYDGE on the Connect page.",
    },
    {
      displayName: "BRYDGE URL",
      name: "baseUrl",
      type: "string",
      default: "https://www.brydge-ai.com",
      description: "Where BRYDGE runs. Leave the default for BRYDGE's hosted service.",
    },
  ];
}
