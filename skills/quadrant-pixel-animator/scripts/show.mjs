#!/usr/bin/env node
// node scripts/show.mjs --input rig.json [options]   (see SKILL.md)
process.argv.splice(2, 0, "show");
await import("./lib/cli.mjs");
