#!/usr/bin/env node
// node scripts/preview.mjs --input rig.json [options]   (see SKILL.md)
process.argv.splice(2, 0, "preview");
await import("./lib/cli.mjs");
