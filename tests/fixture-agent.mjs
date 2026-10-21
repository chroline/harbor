import readline from 'node:readline';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const input=readline.createInterface({input:process.stdin});
const send=v=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...v})+'\n');
let booleanConfigSupported=false;
const sessions=new Map();let next=1;const awaiting=new Map();
function request(method,params){const id='agent-'+next++;send({id,method,params});return new Promise(resolve=>awaiting.set(id,resolve));}
function update(id,update){send({method:'session/update',params:{sessionId:id,update}})}
function modes(currentModeId='agent'){return{currentModeId,availableModes:[{id:'agent',name:'Agent'},{id:'plan',name:'Plan'},{id:'ask',name:'Ask'}]}}
function configs(model='model-fast'){return[{id:'model',name:'Model',category:'model',type:'select',currentValue:model,options:[{value:'model-fast',name:'Fast'},{value:'model-deep',name:'Deep'}]},{id:'reasoning',name:'Reasoning',category:'thought_level',type:'select',currentValue:model==='model-fast'?'low':'high',options:model==='model-fast'?[{value:'low',name:'Low'}]:[{value:'high',name:'High'},{value:'max',name:'Max'}]},booleanConfigSupported?{id:'fast-mode',name:'Fast mode',category:'model_config',type:'boolean',currentValue:false}:{id:'fast-mode',name:'Fast mode',category:'model_config',type:'select',currentValue:'off',options:[{value:'off',name:'Off'},{value:'on',name:'On'}]}]}
input.on('line',async line=>{const msg=JSON.parse(line);if(!msg.method){awaiting.get(msg.id)?.(msg.result??msg.error);awaiting.delete(msg.id);return}const p=msg.params??{};const ok=result=>send({id:msg.id,result});
 try{switch(msg.method){
 case 'initialize':booleanConfigSupported=p.clientCapabilities?.session?.configOptions?.boolean!=null;ok({protocolVersion:1,agentInfo:{name:'Harbor fixture',version:'1.0.0'},agentCapabilities:{loadSession:true},authMethods:[]});break;
 case 'session/new':{const id='session-'+next++;sessions.set(id,{cwd:p.cwd,config:configs()});ok({sessionId:id,configOptions:configs(),modes:modes()});break;}
 case 'session/load':sessions.set(p.sessionId,{cwd:p.cwd});update(p.sessionId,{sessionUpdate:'user_message_chunk',content:{type:'text',text:'Restored question'}});update(p.sessionId,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Restored answer'}});ok({configOptions:configs()});break;
 case 'session/set_config_option':{const s=sessions.get(p.sessionId);if(p.configId==='model')s.config=configs(p.value);else s.config.find(o=>o.id===p.configId).currentValue=p.value;ok({configOptions:s.config});break;}
 case 'session/set_mode':{if(!modes().availableModes.some(m=>m.id===p.modeId))throw new Error('Unsupported mode');sessions.get(p.sessionId).mode=p.modeId;update(p.sessionId,{sessionUpdate:'current_mode_update',currentModeId:p.modeId});ok({});break;}
 case 'session/cancel':for(const [id,resolve]of awaiting){resolve({outcome:{outcome:'cancelled'}});awaiting.delete(id)}break;
 case 'session/prompt':{
  const text=p.prompt[0].text;const s=sessions.get(p.sessionId);if(text==='crash'){process.exit(2);return}if(text==='malformed')process.stdout.write('not json\n');
  if(text==='permission'){const response=await request('session/request_permission',{sessionId:p.sessionId,toolCall:{toolCallId:'write-1',title:'Write greeting.txt',kind:'edit'},options:[{optionId:'allow-once',name:'Allow once',kind:'allow_once'},{optionId:'reject-once',name:'Reject',kind:'reject_once'}]});update(p.sessionId,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:JSON.stringify(response)}});}
  if(text==='files'){const path=join(s.cwd,'fixture.txt');await request('fs/write_text_file',{sessionId:p.sessionId,path,content:'alpha\nbeta\ngamma\n'});const r=await request('fs/read_text_file',{sessionId:p.sessionId,path,line:2,limit:1});update(p.sessionId,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:r.content}});}
  if(text==='terminal'){const t=await request('terminal/create',{sessionId:p.sessionId,command:process.execPath,args:['-e','process.stdout.write("terminal fixture")'],cwd:s.cwd,outputByteLimit:1024});await request('terminal/wait_for_exit',{sessionId:p.sessionId,terminalId:t.terminalId});const out=await request('terminal/output',{sessionId:p.sessionId,terminalId:t.terminalId});update(p.sessionId,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:out.output}});await request('terminal/release',{sessionId:p.sessionId,terminalId:t.terminalId});}
  if(text==='subagent'){update(p.sessionId,{sessionUpdate:'subagent_update',sessionId:'child-1',title:'Test investigator',state:{type:'working'},capabilities:{cancel:{}}});update('child-1',{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'The child inspected the test.'}});update(p.sessionId,{sessionUpdate:'subagent_update',sessionId:'child-1',state:{type:'idle',stopReason:'end_turn'}});}
  if(text==='telemetry'){await request('_cursor/task',{agentId:'cursor-worker',description:'Investigate',prompt:'Test',durationMs:10});await request('_cursor/update_todos',{todos:[]});}
  if(text==='question'){await request('cursor/ask_question',{title:'Choose a path',questions:[{id:'q',prompt:'Which?',options:[{id:'a',label:'A'}]}]});}
  update(p.sessionId,{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Completed: '+text}});ok({stopReason:'end_turn'});break;
 }
 default:send({id:msg.id,error:{code:-32601,message:'Unknown method'}})
 }}catch(e){send({id:msg.id,error:{code:-32603,message:String(e)}})}
});
