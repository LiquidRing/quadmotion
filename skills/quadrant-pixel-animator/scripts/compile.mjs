#!/usr/bin/env node
// node scripts/compile.mjs --input rig.json [options]   (see SKILL.md)
process.argv.splice(2, 0, "compile");
await import("./lib/cli.mjs");
