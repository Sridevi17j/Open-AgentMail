import { z } from "zod";

export const inboxRefShape = {
  inbox_id: z.string().min(1).max(80).optional().describe("Inbox id returned by create_inbox."),
  address: z
    .string()
    .min(3)
    .max(320)
    .optional()
    .describe("Full mailbox address, for example ada@temp.local. Use this or inbox_id."),
};

export const createInboxInput = z.object({
  local_part: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("Mailbox name before the @. A random name is used when omitted."),
  ttl_seconds: z
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 24 * 30)
    .optional()
    .describe("Seconds until the inbox expires. 0 keeps it until delete. Defaults to the server TTL (3600)."),
  with_password: z
    .boolean()
    .optional()
    .describe("When true (default), include a random password for the app under test. This is not a mailbox password."),
});

export const listMessagesInput = z.object({
  ...inboxRefShape,
  limit: z.number().int().min(1).max(100).optional().describe("Maximum messages to return, newest first. Default 20."),
});

export const getMessageInput = z.object({
  ...inboxRefShape,
  message_id: z.string().min(1).max(80).describe("Message id from list_messages or a wait tool."),
});

export const waitInput = z.object({
  ...inboxRefShape,
  timeout_ms: z
    .number()
    .int()
    .min(0)
    .max(180_000)
    .optional()
    .describe("How long to poll before giving up, in milliseconds. Default 30000. Maximum 180000."),
  interval_ms: z
    .number()
    .int()
    .min(100)
    .max(5_000)
    .optional()
    .describe("Poll interval in milliseconds. Default 500."),
  regex: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Override the extractor. If the pattern has a capture group, that group is returned."),
  subject: z.string().max(500).optional().describe("Case-insensitive substring the subject must contain."),
  from: z.string().max(500).optional().describe("Case-insensitive substring the From header must contain."),
  not_before: z
    .string()
    .max(40)
    .optional()
    .describe("ISO timestamp. Messages received before this moment are ignored. Set it just before submitting the form."),
});

export const deleteInboxInput = z.object(inboxRefShape);

export const injectMessageInput = z.object({
  ...inboxRefShape,
  from: z.string().max(500).optional().describe("From header. Defaults to a local Open-AgentMail sender."),
  subject: z.string().min(1).max(500).describe("Message subject."),
  text: z.string().max(100_000).optional().describe("Plain-text body."),
  html: z.string().max(100_000).optional().describe("HTML body."),
});

export const createInboxOutput = z.object({
  address: z.string(),
  password: z.string().nullable(),
  inbox_id: z.string(),
  expires_at: z.string().nullable(),
});

export const listMessagesOutput = z.object({
  inbox_id: z.string(),
  address: z.string(),
  messages: z.array(
    z.object({
      id: z.string(),
      subject: z.string(),
      from: z.string(),
      received_at: z.string(),
      snippet: z.string(),
    }),
  ),
});

export const messageOutput = z.object({
  id: z.string(),
  inbox_id: z.string(),
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string(),
  text: z.string(),
  html: z.string().nullable(),
  snippet: z.string(),
  received_at: z.string(),
});

export const otpOutput = z.object({
  code: z.string(),
  message_id: z.string(),
  raw_snippet: z.string(),
});

export const linkOutput = z.object({
  url: z.string(),
  message_id: z.string(),
  raw_snippet: z.string(),
});

export const deleteInboxOutput = z.object({
  deleted: z.literal(true),
  inbox_id: z.string(),
  address: z.string(),
});

export const injectMessageOutput = z.object({
  message_id: z.string(),
  inbox_id: z.string(),
  received_at: z.string(),
});

export type CreateInboxArgs = z.infer<typeof createInboxInput>;
export type ListMessagesArgs = z.infer<typeof listMessagesInput>;
export type GetMessageArgs = z.infer<typeof getMessageInput>;
export type WaitArgs = z.infer<typeof waitInput>;
export type DeleteInboxArgs = z.infer<typeof deleteInboxInput>;
export type InjectMessageArgs = z.infer<typeof injectMessageInput>;
