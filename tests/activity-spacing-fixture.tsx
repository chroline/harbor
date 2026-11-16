import { createRoot } from "react-dom/client";
import { ChatTranscript } from "../src/components/ChatTranscript";
import type { TimelineEntry } from "../src/lib/protocol";
import "../src/styles.css";

document.documentElement.classList.add("dark");
const titles = ["Write pure logic modules in TypeScript", "Read rest of project-workspace", "Read settings page"];
const entries = titles.map((title, index): TimelineEntry => ({
  type: "tool", sequence: index + 1,
  tool: { id: `spacing-${index}`, title, name: "Bash", kind: "execute", status: "completed", content: [], sessionId: "root", rawInput: null, rawOutput: null, sequence: index + 1 },
}));
createRoot(document.getElementById("root")!).render(
  <main style={{padding: "24px 36px", width: "700px"}}>
    <ChatTranscript entries={entries} working renderTool={() => <p>Tool output</p>} />
  </main>,
);
