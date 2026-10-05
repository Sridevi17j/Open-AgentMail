export interface Inbox {
  id: string;
  address: string;
  localPart: string;
  password: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface StoredMessage {
  id: string;
  inboxId: string;
  seq: number;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string | null;
  snippet: string;
  receivedAt: string;
}

export interface InboxJson {
  address: string;
  password: string | null;
  inbox_id: string;
  expires_at: string | null;
  created_at: string;
}

export interface MessageSummaryJson {
  id: string;
  subject: string;
  from: string;
  received_at: string;
  snippet: string;
}

export interface MessageJson {
  id: string;
  inbox_id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string | null;
  snippet: string;
  received_at: string;
}

export interface OtpJson {
  code: string;
  message_id: string;
  raw_snippet: string;
}

export interface LinkJson {
  url: string;
  message_id: string;
  raw_snippet: string;
}

export function inboxJson(inbox: Inbox): InboxJson {
  return {
    address: inbox.address,
    password: inbox.password,
    inbox_id: inbox.id,
    expires_at: inbox.expiresAt,
    created_at: inbox.createdAt,
  };
}

export function summaryJson(message: StoredMessage): MessageSummaryJson {
  return {
    id: message.id,
    subject: message.subject,
    from: message.from,
    received_at: message.receivedAt,
    snippet: message.snippet,
  };
}

export function messageJson(message: StoredMessage): MessageJson {
  return {
    id: message.id,
    inbox_id: message.inboxId,
    from: message.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    snippet: message.snippet,
    received_at: message.receivedAt,
  };
}
