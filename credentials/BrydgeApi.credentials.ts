import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  Icon,
  INodeProperties,
} from "n8n-workflow";

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
  icon: Icon = {
    light: "file:../nodes/Brydge/brydge.svg",
    dark: "file:../nodes/Brydge/brydge.dark.svg",
  };

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

  /*
   * How the key rides on a request MADE WITH THIS CREDENTIAL — as a bearer
   * token, the one BRYDGE reads from `Authorization`. The node itself calls
   * BRYDGE through `brydge-core` and does not go through here; this is what the
   * `test` below (and any n8n HTTP request using this credential) authenticates
   * with.
   */
  authenticate: IAuthenticateGeneric = {
    type: "generic",
    properties: {
      headers: {
        Authorization: "=Bearer {{$credentials.apiKey}}",
      },
    },
  };

  /*
   * Lets n8n's "Test" button check the key: a GET to a read-only,
   * workspace-scoped BRYDGE endpoint that needs no parameters. A valid key
   * returns 200; a wrong one, 401.
   */
  test: ICredentialTestRequest = {
    request: {
      baseURL: "={{$credentials.baseUrl}}",
      url: "/api/autonomy",
    },
  };
}
