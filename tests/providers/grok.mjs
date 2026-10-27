#!/usr/bin/env node
if(process.argv.includes("--version")){console.log("grok 1.0.30 (04b7ffed98c6) [stable]");process.exit(0);}
import { run } from './agent.mjs';
run('grok');
