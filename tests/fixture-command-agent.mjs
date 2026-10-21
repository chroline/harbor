import readline from "node:readline";
import { appendFileSync } from "node:fs";
const [log, behavior = "immediate"] = process.argv.slice(2);
const send = message => process.stdout.write(JSON.stringify({jsonrpc:"2.0", ...message})+"\n");
const catalog = sessionId => send({method:"session/update",params:{sessionId,update:{sessionUpdate:"available_commands_update",availableCommands:[{name:"review",description:"Review",input:{hint:"branch"}},{name:"$build",description:"Build"}]}}});
readline.createInterface({input:process.stdin}).on("line", line => {
  const message = JSON.parse(line);
  appendFileSync(log, JSON.stringify({method:message.method, params:message.params})+"\n");
  const ok = result => send({id:message.id,result});
  if(message.method === "initialize") ok({protocolVersion:1,agentCapabilities:{sessionCapabilities:{close:{}}}});
  else if(message.method === "session/new") {
    if (behavior === "fail") { send({id:message.id,error:{code:-1,message:"Discovery failed"}}); return; }
    catalog("unrelated-session");
    if(behavior === "immediate") catalog("catalog-session");
    ok({sessionId:"catalog-session"});
    if(behavior === "delayed") setTimeout(()=>catalog("catalog-session"),30);
  } else if(message.method === "session/close") ok({});
  else send({id:message.id,error:{code:-32601,message:"No prompts permitted"}});
});
