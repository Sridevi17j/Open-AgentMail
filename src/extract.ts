const KEYWORD =
  "(?:\\bone[-\\s]?time(?:\\s+(?:password|code|pin))?\\b|\\bverification\\s+code\\b|\\bsecurity\\s+code\\b|\\blogin\\s+code\\b|\\bconfirm(?:ation)?\\s+code\\b|\\bpasscode\\b|\\botp\\b|\\bpin\\b|\\bcode\\b)";

const AFTER_KEYWORD = new RegExp(`${KEYWORD}[^0-9]{0,24}((?:\\d[\\s-]?){3,7}\\d)`, "gi");
const BEFORE_KEYWORD = new RegExp(`((?:\\d[\\s-]?){3,7}\\d)[^0-9]{0,24}${KEYWORD}`, "gi");
const STANDALONE = /\b\d{4,8}\b/g;

function normalizeDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4 || digits.length > 8) return null;
  return digits;
}

function lastKeywordCode(text: string): string | null {
  let last: string | null = null;
  for (const match of text.matchAll(AFTER_KEYWORD)) {
    const code = normalizeDigits(match[1] ?? "");
    if (code) last = code;
  }
  if (last) return last;
  for (const match of text.matchAll(BEFORE_KEYWORD)) {
    const code = normalizeDigits(match[1] ?? "");
    if (code) last = code;
  }
  return last;
}

function isLikelyYear(code: string): boolean {
  if (code.length !== 4) return false;
  const year = Number(code);
  return year >= 1900 && year <= 2099;
}

function standaloneCode(text: string): string | null {
  const found = [...text.matchAll(STANDALONE)].map((match) => match[0]).filter((code) => !isLikelyYear(code));
  if (found.length === 0) return null;
  const preferredLengths = [6, 5, 7, 8, 4];
  for (const length of preferredLengths) {
    const matches = found.filter((code) => code.length === length);
    if (matches.length > 0) return matches[matches.length - 1] ?? null;
  }
  return found[found.length - 1] ?? null;
}

export function extractOtp(text: string, customRegex?: string): string | null {
  const source = text.replace(/\u00a0/g, " ");
  if (customRegex) {
    let expression: RegExp;
    try {
      expression = new RegExp(customRegex, "i");
    } catch {
      throw new Error("regex is not a valid regular expression");
    }
    const match = expression.exec(source);
    if (!match) return null;
    const code = (match[1] ?? match[0] ?? "").trim();
    return code.length > 0 ? code : null;
  }
  return lastKeywordCode(source) ?? standaloneCode(source);
}

const PLAIN_URL = /https?:\/\/[^\s<>"'`)\]]+/gi;
const HREF = /href\s*=\s*["']([^"']+)["']/gi;

function cleanupUrl(raw: string): string {
  return raw
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/g, "&")
    .replace(/[.,;:]+$/g, "")
    .trim();
}

function isJunkUrl(url: string): boolean {
  const value = url.toLowerCase();
  if (!/^https?:\/\//.test(value)) return true;
  if (/\.(png|jpe?g|gif|svg|webp|ico)(?:\?|$)/.test(value)) return true;
  if (/(unsubscribe|email-preferences|privacy-policy|terms-of-service|view-in-browser|opt-out|optout)/.test(value)) {
    return true;
  }
  return false;
}

function scoreUrl(url: string): number {
  const value = url.toLowerCase();
  let score = 1;
  if (/(token|magic|verify|confirm|login|sign-?in|auth|otp|callback|invite)/.test(value)) score += 5;
  if (value.includes("?")) score += 1;
  return score;
}

export function extractLink(text: string, html?: string | null, customRegex?: string): string | null {
  const source = `${text}\n${html ?? ""}`;
  if (customRegex) {
    let expression: RegExp;
    try {
      expression = new RegExp(customRegex, "i");
    } catch {
      throw new Error("regex is not a valid regular expression");
    }
    const match = expression.exec(source);
    if (!match) return null;
    const url = (match[1] ?? match[0] ?? "").trim();
    return url.length > 0 ? url : null;
  }

  const found = new Set<string>();
  for (const match of source.matchAll(PLAIN_URL)) {
    found.add(cleanupUrl(match[0]));
  }
  if (html) {
    for (const match of html.matchAll(HREF)) {
      found.add(cleanupUrl(match[1] ?? ""));
    }
  }

  const candidates = [...found].filter((url) => url.length > 0 && !isJunkUrl(url));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => scoreUrl(b) - scoreUrl(a) || a.length - b.length);
  return candidates[0] ?? null;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const code = Number(digits);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function messageBody(text: string, html: string | null): string {
  if (text.trim()) return text;
  if (!html) return "";
  return stripHtml(html);
}

export function snippetAround(text: string, needle: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!needle) return collapsed.slice(0, 180);
  const index = collapsed.indexOf(needle);
  if (index < 0) return collapsed.slice(0, 180);
  const start = Math.max(0, index - 60);
  const end = Math.min(collapsed.length, index + needle.length + 60);
  return collapsed.slice(start, end).trim();
}

export function makeSnippet(text: string, html: string | null): string {
  const body = messageBody(text, html).replace(/\s+/g, " ").trim();
  if (!body) return "(no text body)";
  return body.length > 180 ? `${body.slice(0, 177)}...` : body;
}
