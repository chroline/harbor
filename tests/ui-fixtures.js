// Realistic UI fixtures for screenshots and demos.
//
// Inject this before the app loads (for example with CDP
// `Page.addScriptToEvaluateOnNewDocument`) on a Vite dev server. It stands in for
// the Tauri bridge with four workspaces, eleven conversations across every agent
// and status, a full "Add rate limiting" transcript, per-agent model options, a
// pinned chat, two favorite models, and macOS stoplights drawn where the native
// window places them. Set `localStorage["fixture.theme"] = "dark"` and reload for
// dark mode. Development only; nothing in the app imports this file.
(() => {
  const now = Date.now();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  const theme = localStorage.getItem("fixture.theme") || "light";

  const workspaces = [
    { id: "ws-harbor", name: "harbor", path: "/Users/dev/code/harbor", lastUsedAt: now - 20 * min, available: true, isGitRoot: true },
    { id: "ws-api", name: "atlas-api", path: "/Users/dev/code/atlas-api", lastUsedAt: now - 3 * hour, available: true, isGitRoot: true },
    { id: "ws-web", name: "atlas-web", path: "/Users/dev/code/atlas-web", lastUsedAt: now - 2 * day, available: true, isGitRoot: true },
    { id: "ws-infra", name: "infra", path: "/Users/dev/code/infra", lastUsedAt: now - 9 * day, available: true, isGitRoot: true },
  ];

  const select = (id, name, category, currentValue, options) => ({ id, name, category, type: "select", currentValue, options });
  const models = {
    codex: select("model", "Model", "model", "gpt-6.1-sol", [
      { value: "gpt-6.1-sol", name: "6.1 Sol" }, { value: "gpt-6.1-terra", name: "6.1 Terra" },
      { value: "gpt-6-astra", name: "6 Astra" }, { value: "gpt-6-luna", name: "6 Luna" },
    ]),
    claude: select("model", "Model", "model", "sonnet", [
      { value: "default", name: "Default (recommended)" }, { value: "opus", name: "Opus 5.5" },
      { value: "sonnet", name: "Sonnet 5.5" }, { value: "haiku", name: "Haiku 5.5" },
    ]),
    grok: select("model", "Model", "model", "grok-4.7", [
      { value: "grok-4.7", name: "grok-4.7" }, { value: "grok-4.6", name: "grok-4.6" }, { value: "grok-build-0.1", name: "grok-build-0.1" },
    ]),
    opencode: select("model", "Model", "model", "openrouter/claude-opus-5.5", [
      { value: "openrouter/claude-opus-5.5", name: "openrouter/Claude Opus 5.5" },
      { value: "openrouter/claude-sonnet-5.5", name: "openrouter/Claude Sonnet 5.5" },
      { value: "claude-agent/sonnet-5.5", name: "claude-agent/Sonnet 5.5" },
    ]),
  };
  const effort = (current) => select("reasoning_effort", "Reasoning effort", "thought_level", current, [
    { value: "minimal", name: "Minimal" }, { value: "low", name: "Low" }, { value: "medium", name: "Medium" },
    { value: "high", name: "High" }, { value: "xhigh", name: "X-High" },
  ]);
  const configFor = (provider, model, level = "medium") => {
    const m = { ...models[provider], currentValue: model ?? models[provider].currentValue };
    const opts = [m];
    if (provider !== "grok") opts.push(effort(level));
    if (provider === "codex") {
      opts.unshift(select("mode", "Approval", "mode", "agent", [{ value: "read-only", name: "Read-only" }, { value: "agent", name: "Auto review" }, { value: "agent-full-access", name: "Full access" }]));
      opts.push(select("collaboration_mode", "Collaboration", "collaboration_mode", "default", [{ value: "default", name: "Default" }, { value: "plan", name: "Plan" }]));
      opts.push({ id: "fast-mode", name: "Fast mode", category: "model_config", type: "boolean", currentValue: false });
    }
    if (provider === "claude") opts.push(select("mode", "Mode", "mode", "default", [{ value: "default", name: "Default" }, { value: "acceptEdits", name: "Accept edits" }, { value: "plan", name: "Plan" }]));
    if (provider === "opencode") opts.push(select("mode", "Agent", "mode", "build", [{ value: "build", name: "Build" }, { value: "plan", name: "Plan" }]));
    return opts;
  };

  const session = (id, title, providerId, workspaceId, status, ago, model) => ({
    parentSessionId: null, isOrchestrator: false, id, title, projectId: null, workspaceId,
    isGit: !!workspaceId, providerId, cwd: workspaces.find((w) => w.id === workspaceId)?.path ?? "/Users/dev",
    acpSessionId: id, nativeSessionId: null, worktreeId: null, status, mode: "gui",
    createdAt: now - ago - hour, updatedAt: now - ago,
    configOptions: configFor(providerId, model), modes: null, models: null,
    capabilities: { harborHistoryLoaded: true }, error: null, draft: "", scrollTop: 0, reviewOpen: false, archived: false,
  });
  const sessions = [
    session("s-rate", "Add rate limiting to the public API", "claude", "ws-api", "idle", 12 * min, "sonnet"),
    session("s-migrate", "Approve the Postgres 17 migration plan", "codex", "ws-api", "needs_input", 4 * min, "gpt-6.1-sol"),
    session("s-flaky", "Fix the flaky checkout e2e test", "codex", "ws-web", "working", 1 * min, "gpt-6.1-terra"),
    session("s-dark", "Dark mode for the settings page", "opencode", "ws-web", "working", 3 * min),
    session("s-notes", "Draft release notes for 0.3.0", "grok", "ws-harbor", "completed", 40 * min),
    session("s-sidebar", "Tighten sidebar row spacing", "claude", "ws-harbor", "completed", 5 * hour, "opus"),
    session("s-icons", "Swap the icon set to Hugeicons", "codex", "ws-harbor", "idle", 1 * day, "gpt-6-astra"),
    session("s-terraform", "Upgrade Terraform providers", "grok", "ws-infra", "idle", 8 * day),
    session("s-regex", "Explain this regex", "claude", null, "idle", 2 * hour, "haiku"),
    session("s-names", "Name ideas for the CLI", "opencode", null, "completed", 3 * day),
    session("s-crash", "Investigate the crash on cold start", "codex", "ws-harbor", "error", 30 * min),
  ];

  let seq = 0;
  const ev = (kind, payload, ago) => ({ sequence: ++seq, sessionId: "s-rate", kind, payload, timestamp: now - ago });
  const upd = (update, ago) => ev("session/update", { sessionId: "s-rate", update }, ago);
  const text = (messageId, t) => ({ sessionUpdate: "agent_message_chunk", messageId, content: { type: "text", text: t } });
  const tool = (toolCallId, title, kind, content = [], extra = {}) =>
    ({ sessionUpdate: "tool_call", toolCallId, title, kind, status: "completed", content, ...extra });
  const rateEvents = [
    ev("user_message", { text: "Add rate limiting to the public API. Use a sliding window per API key, 120 requests a minute, and return a proper 429 with Retry-After." }, 18 * min),
    upd(text("m1", "I'll start by looking at how requests reach the public routes, then add a limiter as middleware so every route gets it."), 17.8 * min),
    upd(tool("t1", "Read src/server/app.ts", "read", [], { locations: [{ path: "/Users/dev/code/atlas-api/src/server/app.ts" }] }), 17.6 * min),
    upd(tool("t2", "Search for \"apiKey\" in src", "search"), 17.4 * min),
    upd(tool("t3", "Read src/auth/api-key.ts", "read", [], { locations: [{ path: "/Users/dev/code/atlas-api/src/auth/api-key.ts" }] }), 17.2 * min),
    upd(text("m2", "Keys are resolved in `authenticate()` before routing, so the limiter can key on `req.apiKey.id`. I'll back it with the existing Redis client so limits hold across instances."), 16.8 * min),
    upd(tool("t4", "Edit src/server/rate-limit.ts", "edit", [{
      type: "diff", path: "/Users/dev/code/atlas-api/src/server/rate-limit.ts", oldText: "",
      newText: "import type { Middleware } from \"./types\";\nimport { redis } from \"../db/redis\";\n\nconst WINDOW_MS = 60_000;\nconst LIMIT = 120;\n\nexport const rateLimit: Middleware = async (req, res, next) => {\n  const key = `rl:${req.apiKey.id}`;\n  const now = Date.now();\n  await redis.zremrangebyscore(key, 0, now - WINDOW_MS);\n  const count = await redis.zcard(key);\n  if (count >= LIMIT) {\n    const [oldest] = await redis.zrange(key, 0, 0, \"WITHSCORES\");\n    res.setHeader(\"Retry-After\", Math.ceil((+oldest + WINDOW_MS - now) / 1000));\n    return res.status(429).json({ error: \"rate_limited\" });\n  }\n  await redis.zadd(key, now, `${now}:${Math.random()}`);\n  await redis.pexpire(key, WINDOW_MS);\n  next();\n};\n",
    }]), 15.5 * min),
    upd(tool("t5", "Edit src/server/app.ts", "edit", [{
      type: "diff", path: "/Users/dev/code/atlas-api/src/server/app.ts",
      oldText: "app.use(authenticate);\napp.use(\"/v1\", publicRoutes);\n",
      newText: "app.use(authenticate);\napp.use(\"/v1\", rateLimit, publicRoutes);\n",
    }]), 15 * min),
    upd(tool("t6", "npm test -- rate-limit", "execute", [{ type: "content", content: { type: "text", text: " PASS  src/server/rate-limit.test.ts\n  ✓ allows 120 requests per minute (41 ms)\n  ✓ returns 429 on the 121st request (12 ms)\n  ✓ sets Retry-After to the seconds until a slot frees (8 ms)\n  ✓ keeps separate windows per API key (15 ms)\n\nTests: 4 passed, 4 total" } }]), 13 * min),
    upd(text("m3", "Rate limiting is in place for every `/v1` route.\n\n| Setting | Value |\n| :-- | :-- |\n| Window | 60 s, sliding |\n| Limit | 120 requests per API key |\n| Store | Redis sorted set (`rl:<keyId>`) |\n| Over limit | `429` with `Retry-After` in seconds |\n\nThe four new tests pass. Two follow-ups worth considering:\n\n1. Expose `X-RateLimit-Remaining` so clients can back off before hitting the limit.\n2. Give internal service keys a higher limit through an allowlist."), 12.5 * min),
    ev("turn_complete", {}, 12 * min),
  ];

  const providers = ["codex", "claude", "grok", "opencode"];
  const bootstrap = async () => {
    const { supportedProviders } = await import("/src/lib/bindings/supported-providers.ts");
    return {
      projects: [], workspaces, providers: supportedProviders.filter((p) => providers.includes(p.id)),
      sessions, worktrees: [], archives: [],
      settings: { theme, notifications: false, defaultProvider: "codex", skylineCity: "sf" },
    };
  };

  localStorage.setItem("harbor.pinned-chats.v1", JSON.stringify(["s-rate"]));
  localStorage.setItem("harbor.favorite-models.v1", JSON.stringify([
    { providerId: "claude", optionId: "model", value: "opus", name: "Opus 5.5" },
    { providerId: "codex", optionId: "model", value: "gpt-6.1-sol", name: "6.1 Sol" },
  ]));

  const handlers = {
    bootstrap,
    discover_provider_config: ({ providerId }) => ({ configOptions: configFor(providerId), models: null, modes: null, agentInfo: null }),
    get_recent_events: ({ sessionId }) => ({ events: sessionId === "s-rate" ? rateEvents : [], hasEarlier: false }),
    get_events: ({ sessionId, after = 0, limit = 5000 }) =>
      (sessionId === "s-rate" ? rateEvents : []).filter((e) => e.sequence > after).slice(0, limit),
    session_has_uncommitted_changes: () => false,
    "plugin:event|listen": () => Math.floor(Math.random() * 1e6),
  };
  // The desktop app leaves the stoplights to macOS, so draw them where
  // window_chrome.rs puts the native buttons: 14pt dots, left edges at 24pt
  // and 24pt apart, centered 30pt from the top (expanded sidebar).
  const drawStoplights = () => {
    if (document.getElementById("fixture-stoplights")) return;
    const style = document.createElement("style");
    style.textContent = `
      #fixture-stoplights { position: fixed; top: 23px; left: 24px; z-index: 2147483647;
        display: flex; gap: 10px; pointer-events: none; }
      #fixture-stoplights i { width: 14px; height: 14px; border-radius: 50%;
        box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.18); }
      #fixture-stoplights i:nth-child(1) { background: #ff5f57; }
      #fixture-stoplights i:nth-child(2) { background: #febc2e; }
      #fixture-stoplights i:nth-child(3) { background: #28c840; }`;
    const lights = document.createElement("div");
    lights.id = "fixture-stoplights";
    lights.innerHTML = "<i></i><i></i><i></i>";
    document.head.append(style);
    document.body.append(lights);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", drawStoplights);
  else drawStoplights();

  globalThis.isTauri = true;
  let callback = 0;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    transformCallback: () => ++callback,
    unregisterCallback() {},
    convertFileSrc: (s) => s,
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    invoke: async (cmd, args = {}) => {
      if (handlers[cmd]) return handlers[cmd](args);
      if (/^(list_|get_prompt_queue)/.test(cmd)) return [];
      if (cmd === "discover_commands") return [];
      return null;
    },
  };
})();
