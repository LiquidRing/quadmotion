import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const skill = join(root, "skills", "quadrant-pixel-animator");

const files = (dir, prefix = "") =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name), `${prefix}${d.name}/`) : [`${prefix}${d.name}`]));

test("SKILL.md frontmatter follows the Agent Skills spec", () => {
  const md = readFileSync(join(root, "skill-src", "SKILL.md"), "utf8");
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md);
  assert.ok(m, "frontmatter block");
  const fm = Object.fromEntries(m[1].split("\n").map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()]));
  assert.equal(fm.name, "quadrant-pixel-animator");
  assert.match(fm.name, /^[a-z0-9-]{1,64}$/);
  assert.ok(fm.description.length > 0 && fm.description.length <= 1024, `description length ${fm.description.length}`);
  assert.equal(fm["allowed-tools"], "Bash(node:*) Read Write Edit");
  assert.ok(md.split("\n").length < 500);
});

test("built skill bundles an up-to-date copy of src/", { skip: !existsSync(skill) && "run npm run build:skill first" }, () => {
  for (const f of files(join(root, "src"))) {
    const a = readFileSync(join(root, "src", f), "utf8");
    const b = readFileSync(join(skill, "scripts", "lib", f), "utf8");
    assert.equal(b, a, `scripts/lib/${f} is stale: run npm run build:skill`);
  }
});
