import readline from "node:readline";
import { appendFileSync } from "node:fs";

const [log, behavior = "success"] = process.argv.slice(2);
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
const chunk = (sessionId, text, type = "agent_message_chunk") => send({
  method: "session/update",
  params: { sessionId, update: { sessionUpdate: type, content: { type: "text", text } } },
});
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  appendFileSync(log, JSON.stringify(message) + "\n");
  const ok = (result) => send({ id: message.id, result });
  if (!message.method) return;
  if (message.method === "initialize") ok({ protocolVersion: 1, agentCapabilities: { sessionCapabilities: { close: {} } } });
  else if (message.method === "session/new") ok({ sessionId: "title-session" });
  else if (message.method === "session/prompt") {
    if (behavior === "hang") return;
    if (behavior === "fail") {
      send({ id: message.id, error: { code: -1, message: "No model access" } });
      return;
    }
    // A background prompt must never service filesystem or terminal requests.
    send({ id: "write", method: "fs/write_text_file", params: { path: "/tmp/harbor-title-must-not-write", content: "bad" } });
    chunk("title-session", "pi v1.2.0\n---\n\n## Skills\n- startup-only\n");
    chunk("another-session", "Wrong title");
    chunk("title-session", "Private reasoning", "agent_thought_chunk");
    chunk("title-session", behavior === "verbose" ? "Here is a title:\nGenerate tab titles" : "\"Generate ");
    if (behavior !== "verbose") chunk("title-session", "tab titles\"");
    ok({ stopReason: "end_turn" });
  } else if (message.method === "session/close") ok({});
});
