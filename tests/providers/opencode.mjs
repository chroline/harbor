#!/usr/bin/env node
if(process.argv.includes("--version")){console.log("opencode v2.3.0");process.exit(0);}
import { run } from './agent.mjs';
run('opencode');
