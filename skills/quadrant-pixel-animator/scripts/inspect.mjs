#!/usr/bin/env node
// node scripts/inspect.mjs --input rig.json [options]   (see SKILL.md)
process.argv.splice(2, 0, "inspect");
await import("./lib/cli.mjs");
