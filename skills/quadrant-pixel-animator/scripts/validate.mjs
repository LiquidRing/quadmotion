#!/usr/bin/env node
// node scripts/validate.mjs --input rig.json [options]   (see SKILL.md)
process.argv.splice(2, 0, "validate");
await import("./lib/cli.mjs");
