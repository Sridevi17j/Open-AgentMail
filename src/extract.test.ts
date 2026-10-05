import assert from "node:assert/strict";
import { test } from "node:test";

import { extractLink, extractOtp, stripHtml } from "./extract.js";

test("extracts a code next to the word code", () => {
  assert.equal(extractOtp("Your code is 482913"), "482913");
});

test("extracts OTP, PIN, and verification codes", () => {
  assert.equal(extractOtp("OTP: 123456"), "123456");
  assert.equal(extractOtp("PIN is 1234"), "1234");
  assert.equal(extractOtp("verification code 004821"), "004821");
  assert.equal(extractOtp("482913 is your code"), "482913");
});

test("joins a code split by a space", () => {
  assert.equal(extractOtp("Your code is 482 913"), "482913");
});

test("uses a standalone code and ignores a bare year", () => {
  assert.equal(extractOtp("Hello 482913 thanks"), "482913");
  assert.equal(extractOtp("Copyright 2026"), null);
  assert.equal(extractOtp("code 2026"), "2026");
});

test("prefers the latest keyword code", () => {
  assert.equal(extractOtp("code 111111\nYour code is 482913"), "482913");
});

test("supports a custom capture group", () => {
  assert.equal(extractOtp("code: AB12CD", "code[:\\s]+([A-Z0-9]{6})"), "AB12CD");
  assert.throws(() => extractOtp("hello", "("), /regular expression/);
});

test("reads a code out of html when the text part is empty", () => {
  const html = "<p>Your code is</p><strong>482913</strong>";
  assert.match(stripHtml(html), /482913/);
  assert.equal(extractOtp(stripHtml(html)), "482913");
});

test("picks a verify link and skips unsubscribe and images", () => {
  const html = [
    '<a href="https://app.test/unsubscribe">Unsub</a>',
    '<img src="https://cdn.test/pixel.gif">',
    '<a href="https://app.test/verify?token=abc123">Verify</a>',
  ].join("");
  assert.equal(extractLink("Confirm your email", html), "https://app.test/verify?token=abc123");
});

test("returns a lone https url", () => {
  assert.equal(extractLink("Open https://app.test/magic/abc to continue."), "https://app.test/magic/abc");
});
