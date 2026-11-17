// Registry of act groups. Each group file exports ACTS and PALETTE.
import * as basics from "./acts/basics.mjs";
import * as play from "./acts/play.mjs";
import * as weather from "./acts/weather.mjs";
import * as work from "./acts/work.mjs";

export const GROUPS = { basics, play, weather, work };
export const ACTS = Object.assign({}, ...Object.values(GROUPS).map((g) => g.ACTS));
export const GROUP_PALETTE = Object.assign({}, ...Object.values(GROUPS).map((g) => g.PALETTE));
