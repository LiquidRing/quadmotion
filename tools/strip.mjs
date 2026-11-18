// Same as `node src/cli.mjs strip ...`; see src/strip.mjs for options.
import { runStrip } from "../src/strip.mjs";

console.log(await runStrip(process.argv.slice(2)));
