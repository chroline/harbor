// Models Prime's persistent CLI conversation and ephemeral ACP wrapper IDs.
import readline from "node:readline";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const value = (flag) => args[args.lastIndexOf(flag) + 1];
const resume = args.find((arg) => arg.startsWith("--resume="))?.slice(9);
const path = resume ?? join(value("--session-dir"), `${randomUUID()}.jsonl`);
mkdirSync(dirname(path), { recursive: true });
if (!resume)
  writeFileSync(path, JSON.stringify({ type: "session", version: 3, id: randomUUID(), cwd: value("--cwd") }) + "\n");
const entries = readFileSync(path, "utf8").trim().split("\n").map(JSON.parse);
let sessionId;
let model = "model-fast";
const config = () => [{ id: "model", category: "model", type: "select", currentValue: model, options: [{ value: "model-fast", name: "Fast" }, { value: "model-deep", name: "Deep" }] }];
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  const params = request.params ?? {};
  const reply = (result) => send({ id: request.id, result });
  switch (request.method) {
    case "initialize":
      reply({ protocolVersion: 1, agentInfo: { name: "prime-agent", version: "fixture" }, agentCapabilities: { loadSession: false, sessionCapabilities: { close: {} } } });
      break;
    case "session/new":
      sessionId = randomUUID();
      reply({ sessionId, configOptions: config() });
      break;
    case "session/set_config_option":
      model = params.value;
      reply({ configOptions: config() });
      break;
    case "session/prompt": {
      if (params.sessionId !== sessionId) throw new Error("Unknown ACP session");
      const text = params.prompt[0].text;
      const remembered = entries.filter((entry) => entry.type === "message").map((entry) => entry.message.content[0].text);
      const entry = { type: "message", message: { role: "user", content: [{ type: "text", text }] } };
      entries.push(entry);
      appendFileSync(path, JSON.stringify(entry) + "\n");
      send({ method: "session/update", params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: remembered.join("\n") } } } });
      reply({ stopReason: "end_turn" });
      break;
    }
    default:
      send({ id: request.id, error: { code: -32601, message: "Prime cannot load or resume an ACP wrapper" } });
  }
});
