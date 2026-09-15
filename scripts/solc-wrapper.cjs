#!/usr/bin/env node
// Foundry standard-json adapter for the pinned solc-js package. No remote compiler download.
const solc = require('solc');
if (process.argv.includes('--version')) { console.log('solc, the solidity compiler commandline interface\nVersion: ' + solc.version()); }
else { let input=''; process.stdin.setEncoding('utf8'); process.stdin.on('data', d=>input+=d); process.stdin.on('end',()=>process.stdout.write(solc.compile(input))); }
