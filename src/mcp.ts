import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createInboxResult, type Actions } from "./actions.js";
import {
  createInboxInput,
  createInboxOutput,
  deleteInboxInput,
  deleteInboxOutput,
  getMessageInput,
  injectMessageInput,
  injectMessageOutput,
  linkOutput,
  listMessagesInput,
  listMessagesOutput,
  messageOutput,
  otpOutput,
  waitInput,
} from "./schemas.js";

function jsonResult(data: object) {
  const record = data as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(record, null, 2) }],
    structuredContent: record,
  };
}

export function attachMcp(server: McpServer, actions: Actions): void {
  server.registerTool(
    "create_inbox",
    {
      title: "Create inbox",
      description:
        "Create an ephemeral email inbox for an authorized UI test. Returns the address to type into a signup or login form, a random password for that app (not for reading mail), inbox_id, and expires_at. The default domain temp.local only receives mail delivered to this Open-AgentMail SMTP server. Do not use this for Google, GitHub, or other OAuth logins.",
      inputSchema: createInboxInput,
      outputSchema: createInboxOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => {
      const inbox = await actions.createInbox({
        localPart: args.local_part,
        ttlSeconds: args.ttl_seconds,
        withPassword: args.with_password,
      });
      return jsonResult(createInboxResult(inbox));
    },
  );

  server.registerTool(
    "list_messages",
    {
      title: "List messages",
      description:
        "List messages in an inbox, newest first. Returns subject, from, received_at, snippet, and id. Does not return the full body.",
      inputSchema: listMessagesInput,
      outputSchema: listMessagesOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => jsonResult(actions.listMessages(args)),
  );

  server.registerTool(
    "get_message",
    {
      title: "Get message",
      description: "Return the full text and HTML body of one message.",
      inputSchema: getMessageInput,
      outputSchema: messageOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => jsonResult(actions.getMessage(args, args.message_id)),
  );

  server.registerTool(
    "wait_for_otp",
    {
      title: "Wait for OTP",
      description:
        "Poll an inbox until an OTP-like code is found. The default extractor prefers a 4-8 digit code next to words such as code, OTP, or verification, and otherwise uses a standalone 4-8 digit code. Pass not_before, captured just before submitting the form, so an older code is ignored. Pass regex to override extraction; a capture group becomes the code. Returns code, message_id, and raw_snippet.",
      inputSchema: waitInput,
      outputSchema: otpOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args, extra) => jsonResult(await actions.waitForOtp(args, { signal: extra.signal })),
  );

  server.registerTool(
    "wait_for_link",
    {
      title: "Wait for magic link",
      description:
        "Poll an inbox until a magic-link URL is found. Prefers verify, login, and token links and skips unsubscribe links and images. Confirm the host matches the app under test before opening the URL. Pass not_before to ignore older mail. Returns url, message_id, and raw_snippet.",
      inputSchema: waitInput,
      outputSchema: linkOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args, extra) => jsonResult(await actions.waitForLink(args, { signal: extra.signal })),
  );

  server.registerTool(
    "delete_inbox",
    {
      title: "Delete inbox",
      description: "Delete an inbox and every message in it. Call this when the UI test finishes, including when the test fails.",
      inputSchema: deleteInboxInput,
      outputSchema: deleteInboxOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async (args) => jsonResult(await actions.deleteInbox(args)),
  );

  server.registerTool(
    "inject_message",
    {
      title: "Inject message",
      description:
        "Dev only. Insert a message directly into an inbox without SMTP. Use it to test the OTP or magic-link flow when the app under test cannot deliver mail to the local domain.",
      inputSchema: injectMessageInput,
      outputSchema: injectMessageOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => jsonResult(await actions.injectMessage(args)),
  );
}
