#!/usr/bin/env node
// node scripts/strip.mjs --input rig.json [options]   (see SKILL.md)
process.argv.splice(2, 0, "strip");
await import("./lib/cli.mjs");
