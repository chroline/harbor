// Protocol contract fixtures, not live-provider certification.
import readline from 'node:readline';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
export function run(provider) {
  const scenario = process.argv[2] ?? 'normal';
  const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  const update = (sessionId, update) => send({ method: 'session/update', params: { sessionId, update } });
  const waiting = new Map();
  const sessions = new Map();
  let sequence = 0;
  let trace;
  const modeChoices = provider === 'grok' ? ['default', 'plan'] : provider === 'claude' ? ['default', 'acceptEdits', 'plan'] : ['read-only', 'workspace-write', 'agent'];
  const modes = (currentModeId = provider === 'claude' ? 'default' : 'agent') => provider === 'grok' ? {} : {modes:{currentModeId, availableModes:modeChoices.map(id=>({id,name:id}))}};
  const options = (model = 'fast') => [
    { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: model, options: [{ value:'fast',name:'Fast' },{value:'deep',name:'Deep'}] },
    ...(provider === 'grok' ? [] : [{ id:'effort',name:'Reasoning',category:'thought_level',type:'select',currentValue:model === 'fast' ? 'low' : 'high',options:(model === 'fast' ? ['low'] : ['high','max']).map(value => ({value,name:value})) }]),
    ...(provider === 'grok' ? [] : [
      { id:'fast-mode',name:'Fast mode',category:'model_config',type:'boolean',currentValue:false },
      { id:'mode',name:'Mode',category:'mode',type:'select',currentValue:provider === 'claude' ? 'default' : 'agent',options:modeChoices.map(value=>({value,name:value})) },
    ]),
    ...(provider === 'codex' ? [{id:'collaboration_mode',name:'Collaboration mode',category:'collaboration_mode',type:'select',currentValue:'default',options:['default','plan'].map(value=>({value,name:value}))}] : []),
  ];
  function request(method, params) { const id = `question-${++sequence}`; send({id,method,params}); return new Promise(resolve => waiting.set(id,resolve)); }
  readline.createInterface({input:process.stdin}).on('line', async (line) => {
    const message = JSON.parse(line);
    if (!message.method) { waiting.get(message.id)?.(message.result ?? message.error); waiting.delete(message.id); return; }
    const p = message.params ?? {};
    const ok = (result) => send({id:message.id,result});
    const fail = (text, code=-32603) => send({id:message.id,error:{code,message:text}});
    try {
      if (trace) await appendFile(trace, message.method+'\n');
      switch (message.method) {
        case 'initialize':
          if (scenario === 'hang') return;
          ok({protocolVersion:scenario === 'protocol' ? 99 : 1, agentInfo:{name:`${provider}-fixture`,version:'1.0'}, authMethods:[{id:'cached',name:'Existing CLI login'}],agentCapabilities:{loadSession:true,promptCapabilities:{image:true,embeddedContext:true},sessionCapabilities:{close:{}}}}); break;
        case 'session/new': {
          trace=join(p.cwd,'protocol.log'); await appendFile(trace,'session/new\n');
          if (scenario === 'auth') { fail('Authentication required: sign in through CLI',-32000); break; }
          const sessionId = `${provider}-root-${++sequence}`;
          sessions.set(sessionId,{cwd:p.cwd,config:options(),mode:{currentValue:'default'}});
          await writeFile(join(p.cwd,`${sessionId}.json`),JSON.stringify([]));
          ok({sessionId,configOptions:options(),...modes()});
          update(sessionId,{sessionUpdate:'available_commands_update',availableCommands:[{name:'status',description:'Show status'}]}); break;
        }
        case 'session/load': {
          const history=JSON.parse(await readFile(join(p.cwd,`${p.sessionId}.json`),'utf8'));
          const config=await readFile(join(p.cwd,`${p.sessionId}-config.json`),'utf8').then(JSON.parse).catch(()=>options());
          const mode=await readFile(join(p.cwd,`${p.sessionId}-mode.json`),'utf8').then(JSON.parse).catch(()=>({currentValue:'default'}));
          sessions.set(p.sessionId,{cwd:p.cwd,config,mode});
          if(provider==='grok') update(p.sessionId,{sessionUpdate:'current_mode_update',currentModeId:mode.currentValue});
          for (const item of history) update(p.sessionId,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:item}});
          ok({sessionId:scenario === 'wrong-id' ? 'replacement' : p.sessionId,configOptions:config,...modes(config.find(o=>o.id==='mode')?.currentValue)}); break;
        }
        case 'session/set_config_option': {
          const session=sessions.get(p.sessionId);
          if (scenario === 'reject-mode' && p.configId === 'collaboration_mode') { fail('Mode unavailable'); break; }
          if (scenario === 'delay-mode') await new Promise(resolve=>setTimeout(resolve,80));
          if (scenario === 'unconfirmed-mode' && p.configId === 'collaboration_mode') { ok({configOptions:session.config}); break; }
          if (p.configId === 'mode') { fail('Use session/set_mode'); break; }
          if (p.configId === 'model') {
            const old=session.config;
            session.config=options(p.value).map(o=>['mode','collaboration_mode'].includes(o.id) ? old.find(v=>v.id===o.id) ?? o : o);
          }
          else session.config.find(option=>option.id===p.configId).currentValue=p.value;
          await writeFile(join(session.cwd,`${p.sessionId}-config.json`),JSON.stringify(session.config));
          ok({configOptions:session.config}); break;
        }
        case 'session/set_mode': {
          if (!modeChoices.includes(p.modeId)) { fail('Mode unavailable'); break; }
          const session=sessions.get(p.sessionId);
          if(provider==='grok') { session.mode.currentValue=p.modeId; await writeFile(join(session.cwd,`${p.sessionId}-mode.json`),JSON.stringify(session.mode)); }
          else session.config.find(o=>o.id==='mode').currentValue=p.modeId;
          await writeFile(join(session.cwd,`${p.sessionId}-config.json`),JSON.stringify(session.config));
          update(p.sessionId,{sessionUpdate:'current_mode_update',currentModeId:p.modeId}); ok({}); break;
        }
        case 'session/close': ok({}); break;
        case 'session/cancel': for (const resolve of waiting.values()) resolve({action:'cancel'}); waiting.clear(); break;
        case 'session/prompt': {
          const text=p.prompt.filter(p=>p.type==='text').map(p=>p.text).join('');
          if (text==='crash') { process.exit(2); return; }
          if (text==='malformed') process.stdout.write('not json\n');
          const session=sessions.get(p.sessionId);
          if (text==='plan-change' || text==='execute-plan') {
            const control=provider==='grok' ? session.mode : session.config.find(o=>o.id===(provider==='codex' ? 'collaboration_mode' : 'mode'));
            if (!control) { fail('Plan mode unavailable'); break; }
            if (control.currentValue==='plan' && (text==='execute-plan' || provider==='codex')) {
              const result=provider==='grok' ? await request('_x.ai/exit_plan_mode',{sessionId:p.sessionId,toolCallId:'exit-plan',planContent:'Plan: change greeting.txt from hello to ahoy.'}) : await request('session/request_permission',{sessionId:p.sessionId,toolCall:{toolCallId:'exit-plan',title:provider==='claude' ? 'Approve Plan' : 'Implement this plan?',kind:'switch_mode',rawInput:{plan:'Change greeting.txt to ahoy'}},options:provider==='claude' ? [{optionId:'exit-plan-default',kind:'allow_once',name:'Yes, manually approve edits'},{optionId:'reject',kind:'reject_once',name:'No, keep planning'}] : [{optionId:'implement_plan',kind:'allow_once',name:'Yes, implement this plan'},{optionId:'revise_plan',kind:'reject_once',name:'No, and tell Codex what to do differently'}]});
              if (provider==='grok' ? result.outcome==='approved' : result.outcome?.optionId===(provider==='claude' ? 'exit-plan-default' : 'implement_plan')) {
                control.currentValue='default';
                await writeFile(join(session.cwd,`${p.sessionId}-config.json`),JSON.stringify(session.config));
                if(provider==='grok') await writeFile(join(session.cwd,`${p.sessionId}-mode.json`),JSON.stringify(session.mode));
                update(p.sessionId,provider!=='codex' ? {sessionUpdate:'current_mode_update',currentModeId:'default'} : {sessionUpdate:'config_option_update',configOptions:session.config});
              }
            }
            if (control.currentValue!=='plan') await writeFile(join(session.cwd,'greeting.txt'),'ahoy\n');
            update(p.sessionId,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:control.currentValue==='plan' ? 'Plan: change greeting.txt from hello to ahoy.' : 'Implemented greeting.txt.'}});
          }
          if (text==='permission') {
            const result=await request('session/request_permission',{sessionId:p.sessionId,toolCall:{toolCallId:'tool',title:'Run checks'},options:[{optionId:'allow',name:'Allow',kind:'allow_once'},{optionId:'deny',name:'Reject',kind:'reject_once'}]});
            update(p.sessionId,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:JSON.stringify(result)}});
          }
          if (text==='question') {
            const result=provider==='grok'
              ? await request('_x.ai/ask_user_question',{sessionId:p.sessionId,toolCallId:'question-tool',mode:'default',questions:[{question:'Choose scope',multiSelect:null,options:[{label:'backend',description:'Backend'}]}]})
              : await request('elicitation/create',{mode:'form',sessionId:p.sessionId,message:'Choose scope',requestedSchema:{type:'object',required:['scope'],properties:{scope:{type:'string',oneOf:[{const:'backend',title:'Backend'}]}}}});
            if (provider==='grok' && result.outcome!=='cancelled' && (result.outcome!=='accepted' || result.answers?.['Choose scope']?.[0]!=='backend')) { fail('Invalid native question response'); break; }
            update(p.sessionId,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:JSON.stringify(result)}});
          }
          if (text==='worker') {
            const child=`${provider}-child`;
            await writeFile(join(session.cwd,`${child}.json`),JSON.stringify(['worker-original-context']));
            if (provider==='codex') update(p.sessionId,{sessionUpdate:'subagent_spawned',subagentSessionId:child,name:'Scout',task:'Inspect'});
            else if (provider==='claude') update(p.sessionId,{sessionUpdate:'subagent_update',sessionId:child,title:'Scout',state:{type:'working'}});
            update(child,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'worker-original-context'}});
            if (provider==='grok') update(p.sessionId,{sessionUpdate:'tool_call_update',toolCallId:'spawn',rawOutput:{type:'SubagentCompleted',subagent_id:child,resume_from_hint:child}});
            else if (provider==='codex') update(p.sessionId,{sessionUpdate:'subagent_state_update',subagentSessionId:child,state:'idle'});
            else update(p.sessionId,{sessionUpdate:'subagent_update',sessionId:child,state:{type:'idle'}});
          }
          const history=JSON.parse(await readFile(join(session.cwd,`${p.sessionId}.json`),'utf8'));
          const answer=text==='recall' ? history.join(' ') : `remembered:${text}`;
          if (text==='tools-and-attachments') {
            if (!p.prompt.some(block=>block.type==='image') || !p.prompt.some(block=>block.type==='resource')) throw new Error('Expected image and embedded text context');
            update(p.sessionId,{sessionUpdate:'plan',entries:[{content:'Inspect attachment',priority:'high',status:'in_progress'}]});
            update(p.sessionId,{sessionUpdate:'tool_call',toolCallId:'read-attachment',title:'Read attachment',kind:'read',status:'in_progress',rawInput:{path:'note.txt'}});
            update(p.sessionId,{sessionUpdate:'tool_call_update',toolCallId:'read-attachment',status:'completed',content:[{type:'content',content:{type:'text',text:'Attachment read'}}]});
            update(p.sessionId,{sessionUpdate:'plan',entries:[{content:'Inspect attachment',priority:'high',status:'completed'}]});
          }
          update(p.sessionId,{sessionUpdate:'agent_thought_chunk',content:{type:'text',text:'Checking'}});
          update(p.sessionId,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:answer}});
          history.push(answer); await writeFile(join(session.cwd,`${p.sessionId}.json`),JSON.stringify(history));
          ok({stopReason:'end_turn'}); break;
        }
        default: fail('Unknown method',-32601);
      }
    } catch (error) { fail(String(error)); }
  });
}
