export function debugPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='3' fill='%23f3ecdf' stroke='%230e6b56' stroke-width='2'/%3E%3Ctext x='16' y='21' text-anchor='middle' font-size='12' font-family='sans-serif' font-weight='700' fill='%230e6b56'%3EAB%3C/text%3E%3C/svg%3E">
  <title>Agentbox mailroom</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #1c1612;
      --muted: #5e534a;
      --paper: #f3ecdf;
      --card: #fbf7f0;
      --line: #e3d6c4;
      --stamp: #0e6b56;
      --stamp-deep: #0a5343;
      --soft: #e7f3ee;
      --warn: #8d2e24;
      --warn-bg: #fde8e2;
      --shadow: 0 10px 30px rgba(48, 32, 16, 0.06);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(14, 107, 86, 0.08), transparent 28rem),
        var(--paper);
      font: 16px/1.5 "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
    }
    button, input, textarea { font: inherit; color: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: wait; opacity: 0.7; }
    :focus-visible { outline: 2px solid var(--stamp); outline-offset: 2px; }
    .wrap { width: min(1080px, calc(100% - 32px)); margin: 0 auto; }
    header { padding: 28px 0 8px; }
    .brand { display: flex; gap: 16px; align-items: center; }
    .stamp {
      width: 64px; height: 64px; flex: none;
      display: grid; place-items: center;
      border: 2px solid var(--stamp); color: var(--stamp);
      font-weight: 750; letter-spacing: 0.08em;
      transform: rotate(-6deg);
      background: rgba(255, 252, 247, 0.8);
    }
    .stamp span { border: 1px dashed var(--stamp); width: 50px; height: 50px; display: grid; place-items: center; }
    h1 { font-size: 1.8rem; line-height: 1.1; margin: 0; letter-spacing: -0.03em; }
    .lede { margin: 6px 0 0; color: var(--muted); max-width: 62ch; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .pill {
      border: 1px solid var(--line); background: var(--card);
      border-radius: 999px; padding: 4px 10px; color: var(--muted); font-size: 0.92rem;
    }
    .banner {
      margin: 16px 0; padding: 12px 14px; border-radius: 12px;
      background: var(--warn-bg); color: var(--warn);
    }
    .banner[hidden] { display: none; }
    main { display: grid; grid-template-columns: 320px 1fr; gap: 18px; padding-bottom: 40px; }
    section {
      background: var(--card); border: 1px solid var(--line); border-radius: 18px;
      box-shadow: var(--shadow); padding: 16px;
    }
    h2 { font-size: 1rem; margin: 0 0 12px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      border: 1px solid var(--stamp); background: var(--stamp); color: white;
      border-radius: 999px; padding: 10px 14px; min-height: 44px;
    }
    .btn:hover { background: var(--stamp-deep); }
    .btn.secondary { background: transparent; color: var(--ink); border-color: var(--line); }
    .btn.secondary:hover { border-color: var(--ink); background: transparent; }
    .btn.danger { background: transparent; color: var(--warn); border-color: #efc7c0; }
    .stack { display: grid; gap: 10px; }
    label { display: grid; gap: 4px; font-size: 0.92rem; color: var(--muted); }
    input, textarea {
      width: 100%; border: 1px solid var(--line); background: white; border-radius: 10px;
      padding: 10px 12px; min-height: 44px;
    }
    textarea { min-height: 96px; resize: vertical; }
    .inbox-list { display: grid; gap: 8px; margin-top: 12px; }
    .inbox {
      text-align: left; width: 100%; border-radius: 12px; border: 1px solid var(--line);
      background: white; padding: 10px 12px; min-height: 44px;
    }
    .inbox[aria-current="true"] { border-color: var(--stamp); background: var(--soft); }
    .inbox strong { display: block; word-break: break-all; }
    .muted { color: var(--muted); }
    .mono { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; word-break: break-all; }
    .secret {
      display: flex; justify-content: space-between; gap: 8px; align-items: center;
      background: white; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px;
    }
    .code {
      font-size: 2rem; letter-spacing: 0.12em; margin: 8px 0 0;
      font-family: ui-monospace, Menlo, Consolas, monospace;
    }
    .message { border-top: 1px solid var(--line); padding: 12px 0; }
    .message:first-child { border-top: 0; }
    .message h3 { margin: 0; font-size: 1rem; }
    .empty { color: var(--muted); margin: 8px 0 0; }
    footer { color: var(--muted); padding: 0 0 32px; font-size: 0.92rem; }
    @media (max-width: 800px) {
      main { grid-template-columns: 1fr; }
      .wrap { width: min(100% - 24px, 1080px); }
      h1 { font-size: 1.5rem; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="brand">
        <div class="stamp" aria-hidden="true"><span>AB</span></div>
        <div>
          <h1>Agentbox mailroom</h1>
          <p class="lede">Temporary inboxes for authorized UI tests that sign up or log in with email. OTP codes and magic links only — not Google, GitHub, or any other OAuth.</p>
        </div>
      </div>
      <div class="meta" id="meta"></div>
    </header>
    <p class="banner" id="banner" hidden role="alert"></p>
    <main>
      <section>
        <h2>Inboxes</h2>
        <div class="row">
          <button class="btn" id="create" type="button">New inbox</button>
          <button class="btn secondary" id="sample" type="button">Run sample OTP</button>
        </div>
        <div class="inbox-list" id="inbox-list"></div>
        <p class="empty" id="inbox-empty">No inboxes yet. Create one, then use that address on the app under test.</p>
      </section>
      <section>
        <h2 id="detail-title">Inbox</h2>
        <div id="detail-empty" class="empty">Select an inbox to copy its address and password, inject a message, or read what arrived.</div>
        <div id="detail" hidden>
          <div class="stack">
            <div>
              <div class="muted">Address</div>
              <div class="secret"><span class="mono" id="address"></span><button class="btn secondary" id="copy-address" type="button">Copy</button></div>
            </div>
            <div>
              <div class="muted">Password for the app under test</div>
              <div class="secret"><span class="mono" id="password"></span><button class="btn secondary" id="copy-password" type="button">Copy</button></div>
            </div>
            <p class="muted" id="expires"></p>
            <div class="row">
              <button class="btn secondary" id="refresh" type="button">Refresh mail</button>
              <button class="btn secondary" id="check-code" type="button">Check for a code</button>
              <button class="btn danger" id="delete" type="button">Delete inbox</button>
            </div>
            <p id="otp" class="code" hidden aria-live="polite"></p>
            <p id="otp-note" class="muted" hidden></p>
            <form id="inject" class="stack">
              <label>Subject<input id="subject" value="Your verification code"></label>
              <label>Message<textarea id="body">Your code is 482913</textarea></label>
              <button class="btn" type="submit">Inject message</button>
            </form>
            <div>
              <h2>Messages</h2>
              <div id="messages"></div>
              <p class="empty" id="messages-empty">Nothing has arrived. Submit the form on the app under test, or inject a sample message.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
    <footer>
      <p id="scope">temp.local receives only mail sent to this machine. Real websites need a domain you control and an MX record pointed at Agentbox. Keep this page on localhost.</p>
    </footer>
  </div>
  <script>
    const state = { inboxes: [], selectedId: "", messages: [], token: sessionStorage.getItem("agentbox-token") || "" };

    const banner = document.getElementById("banner");
    const list = document.getElementById("inbox-list");
    const empty = document.getElementById("inbox-empty");
    const detail = document.getElementById("detail");
    const detailEmpty = document.getElementById("detail-empty");

    function setBanner(message) {
      banner.hidden = !message;
      banner.textContent = message || "";
    }

    async function api(path, options) {
      const headers = Object.assign({ "content-type": "application/json" }, (options && options.headers) || {});
      if (state.token) headers.authorization = "Bearer " + state.token;
      const response = await fetch(path, Object.assign({}, options, { headers: headers }));
      const data = await response.json().catch(function () { return {}; });
      if (response.status === 401) {
        const entered = window.prompt("This mailroom requires AGENTBOX_API_TOKEN");
        if (entered) {
          state.token = entered.trim();
          sessionStorage.setItem("agentbox-token", state.token);
          return api(path, options);
        }
      }
      if (!response.ok) throw new Error(data.error || ("Request failed (" + response.status + ")"));
      return data;
    }

    function selected() {
      return state.inboxes.find(function (inbox) { return inbox.inbox_id === state.selectedId; }) || null;
    }

    async function copyText(value) {
      try {
        await navigator.clipboard.writeText(value);
        setBanner("");
      } catch (error) {
        setBanner("Could not copy to the clipboard. Select the value and copy it manually.");
      }
    }

    function renderMessages() {
      const host = document.getElementById("messages");
      const none = document.getElementById("messages-empty");
      host.replaceChildren();
      none.hidden = state.messages.length > 0;
      state.messages.forEach(function (message) {
        const article = document.createElement("article");
        article.className = "message";
        const title = document.createElement("h3");
        title.textContent = message.subject;
        const from = document.createElement("div");
        from.className = "muted";
        from.textContent = message.from + " · " + new Date(message.received_at).toLocaleString();
        const snippet = document.createElement("p");
        snippet.textContent = message.snippet;
        article.append(title, from, snippet);
        host.append(article);
      });
    }

    function render() {
      list.replaceChildren();
      empty.hidden = state.inboxes.length > 0;
      state.inboxes.forEach(function (inbox) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "inbox";
        button.setAttribute("aria-current", inbox.inbox_id === state.selectedId ? "true" : "false");
        const address = document.createElement("strong");
        address.className = "mono";
        address.textContent = inbox.address;
        const meta = document.createElement("span");
        meta.className = "muted";
        meta.textContent = inbox.expires_at ? "Expires " + new Date(inbox.expires_at).toLocaleString() : "Kept until delete";
        button.append(address, meta);
        button.addEventListener("click", function () {
          state.selectedId = inbox.inbox_id;
          render();
          void loadMessages();
        });
        list.append(button);
      });

      const inbox = selected();
      detail.hidden = !inbox;
      detailEmpty.hidden = Boolean(inbox);
      if (!inbox) return;
      document.getElementById("address").textContent = inbox.address;
      document.getElementById("password").textContent = inbox.password || "(none)";
      document.getElementById("expires").textContent = inbox.expires_at
        ? "Expires " + new Date(inbox.expires_at).toLocaleString()
        : "This inbox stays until you delete it.";
      renderMessages();
    }

    async function loadInboxes() {
      const data = await api("/api/inboxes", { method: "GET" });
      state.inboxes = data.inboxes;
      if (state.selectedId && !selected()) state.selectedId = "";
      render();
    }

    async function loadMessages() {
      const inbox = selected();
      if (!inbox) return;
      const data = await api("/api/inboxes/" + encodeURIComponent(inbox.inbox_id) + "/messages", { method: "GET" });
      state.messages = data.messages;
      renderMessages();
    }

    async function loadHealth() {
      const health = await api("/health", { method: "GET" });
      const meta = document.getElementById("meta");
      const bits = [
        health.domain,
        "SMTP " + health.smtp.host + ":" + health.smtp.port,
        "HTTP " + health.http.host + ":" + health.http.port
      ];
      meta.replaceChildren();
      bits.forEach(function (text) {
        const span = document.createElement("span");
        span.className = "pill";
        span.textContent = text;
        meta.append(span);
      });
    }

    document.getElementById("create").addEventListener("click", async function () {
      setBanner("");
      this.disabled = true;
      try {
        const inbox = await api("/api/inboxes", { method: "POST", body: "{}" });
        state.selectedId = inbox.inbox_id;
        await loadInboxes();
        state.messages = [];
        render();
      } catch (error) {
        setBanner(error.message);
      } finally {
        this.disabled = false;
      }
    });

    document.getElementById("sample").addEventListener("click", async function () {
      setBanner("");
      this.disabled = true;
      const otp = document.getElementById("otp");
      const note = document.getElementById("otp-note");
      otp.hidden = true;
      note.hidden = true;
      try {
        const inbox = await api("/api/inboxes", { method: "POST", body: "{}" });
        state.selectedId = inbox.inbox_id;
        await api("/api/inboxes/" + encodeURIComponent(inbox.inbox_id) + "/inject", {
          method: "POST",
          body: JSON.stringify({ subject: "Your verification code", text: "Your code is 482913" })
        });
        const found = await api("/api/inboxes/" + encodeURIComponent(inbox.inbox_id) + "/wait-otp", {
          method: "POST",
          body: JSON.stringify({ timeout_ms: 3000 })
        });
        await loadInboxes();
        await loadMessages();
        otp.hidden = false;
        otp.textContent = found.code;
        note.hidden = false;
        note.textContent = found.code === "482913"
          ? "Sample flow read the code 482913 from the injected message."
          : "A code arrived, but it was not the sample value.";
      } catch (error) {
        setBanner(error.message);
      } finally {
        this.disabled = false;
      }
    });

    document.getElementById("copy-address").addEventListener("click", function () {
      const inbox = selected();
      if (inbox) void copyText(inbox.address);
    });
    document.getElementById("copy-password").addEventListener("click", function () {
      const inbox = selected();
      if (inbox && inbox.password) void copyText(inbox.password);
    });
    document.getElementById("refresh").addEventListener("click", function () {
      void loadMessages().catch(function (error) { setBanner(error.message); });
    });
    document.getElementById("check-code").addEventListener("click", async function () {
      const inbox = selected();
      if (!inbox) return;
      this.disabled = true;
      setBanner("");
      try {
        const found = await api("/api/inboxes/" + encodeURIComponent(inbox.inbox_id) + "/wait-otp", {
          method: "POST",
          body: JSON.stringify({ timeout_ms: 4000 })
        });
        const otp = document.getElementById("otp");
        const note = document.getElementById("otp-note");
        otp.hidden = false;
        otp.textContent = found.code;
        note.hidden = false;
        note.textContent = found.raw_snippet;
      } catch (error) {
        setBanner(error.message);
      } finally {
        this.disabled = false;
      }
    });
    document.getElementById("delete").addEventListener("click", async function () {
      const inbox = selected();
      if (!inbox) return;
      this.disabled = true;
      try {
        await api("/api/inboxes/" + encodeURIComponent(inbox.inbox_id), { method: "DELETE" });
        state.selectedId = "";
        state.messages = [];
        document.getElementById("otp").hidden = true;
        document.getElementById("otp-note").hidden = true;
        await loadInboxes();
      } catch (error) {
        setBanner(error.message);
      } finally {
        this.disabled = false;
      }
    });
    document.getElementById("inject").addEventListener("submit", async function (event) {
      event.preventDefault();
      const inbox = selected();
      if (!inbox) return;
      const button = this.querySelector("button");
      button.disabled = true;
      setBanner("");
      try {
        await api("/api/inboxes/" + encodeURIComponent(inbox.inbox_id) + "/inject", {
          method: "POST",
          body: JSON.stringify({
            subject: document.getElementById("subject").value,
            text: document.getElementById("body").value
          })
        });
        await loadMessages();
      } catch (error) {
        setBanner(error.message);
      } finally {
        button.disabled = false;
      }
    });

    loadHealth().catch(function (error) { setBanner(error.message); });
    loadInboxes().catch(function (error) { setBanner(error.message); });
    setInterval(function () {
      if (!state.selectedId) return;
      loadMessages().catch(function () {});
    }, 2000);
  </script>
</body>
</html>`;
}
