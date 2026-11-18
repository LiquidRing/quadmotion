// Assembles skills/quadrant-pixel-animator from skill-src/ + src/ + assets/ + schema/.
// The skill is self-contained: scripts import only ./lib (a copy of src/).

import { cpSync, rmSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "skills", "quadrant-pixel-animator");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "skill-src"), out, { recursive: true });
cpSync(join(root, "src"), join(out, "scripts", "lib"), { recursive: true });
mkdirSync(join(out, "assets"), { recursive: true });
cpSync(join(root, "assets", "pip.rig.json"), join(out, "assets", "starter-companion.rig.json"));
cpSync(join(root, "schema", "rig.schema.json"), join(out, "assets", "rig.schema.json"));
// The starter rig points at the schema next to it inside the skill.
const starter = join(out, "assets", "starter-companion.rig.json");
const { readFileSync } = await import("node:fs");
writeFileSync(starter, readFileSync(starter, "utf8").replace('"../schema/rig.schema.json"', '"./rig.schema.json"'));

const wrappers = {
  "compile.mjs": "compile",
  "validate.mjs": "validate",
  "preview.mjs": "preview",
  "inspect.mjs": "inspect",
  "show.mjs": "show",
  "strip.mjs": "strip",
};
for (const [file, command] of Object.entries(wrappers)) {
  writeFileSync(
    join(out, "scripts", file),
    `#!/usr/bin/env node
// node scripts/${file} --input rig.json [options]   (see SKILL.md)
process.argv.splice(2, 0, ${JSON.stringify(command)});
await import("./lib/cli.mjs");
`,
  );
}
writeFileSync(join(out, "scripts", "package.json"), `${JSON.stringify({ type: "module" }, null, 2)}\n`);

const list = (dir, prefix = "") =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? list(join(dir, d.name), `${prefix}${d.name}/`) : [`${prefix}${d.name}`]));
console.log(`built ${out}\n  ${list(out).join("\n  ")}`);
