// IIFE entry for the showcase page: exposes window.QMStage.
import { createLive } from "./browser.mjs";
globalThis.QMStage = { createLive };
