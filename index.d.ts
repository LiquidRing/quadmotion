// Type declarations for quadmotion (plain ESM implementation in src/).

export type RGB = readonly [number, number, number];
export type TokenKey = string;

export interface PaletteToken {
  key: TokenKey;
  name: string;
  rgb: RGB;
  ansi16: number;
  ansi16Bg: number;
  priority: number;
}

export type PixelGrid = (TokenKey | null)[][];

export interface Cell {
  glyph: string;
  /** 0..15 quadrant mask, -1 for overlay text */
  mask: number;
  fg: TokenKey | null;
  bg: TokenKey | null;
  wide?: boolean;
  skip?: boolean;
}

export interface CompileWarning {
  code: string;
  message: string;
  col?: number;
  row?: number;
  colorsFound?: string[];
  where?: string;
}

export interface CompiledFrame {
  cols: number;
  rows: number;
  cells: Cell[][];
  warnings: CompileWarning[];
}

export interface Overlay {
  text: string;
  col?: number;
  row?: number;
  fg?: TokenKey;
  bg?: TokenKey;
}

export interface TerminalCapabilities {
  isTTY?: boolean;
  trueColor?: boolean;
  syncOutput?: boolean;
  syncProbed?: boolean;
  isAppleTerminal?: boolean;
  bgFill?: boolean;
  noColor?: boolean;
  reducedMotion?: boolean;
  fullRepaint?: boolean;
  columns?: number;
}

export interface Issue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  where?: string;
}

export interface Rig {
  name: string;
  cols: number;
  rows: number;
  width: number;
  height: number;
  palette: Record<TokenKey, PaletteToken>;
  paletteOrder: TokenKey[];
  poses: Record<string, PixelGrid>;
  timelines: Record<string, { name: string; tickMs: number; loop: boolean; frames: { pose: string; hold: number; dx: number; dy: number; overlays: Overlay[] }[] }>;
  defaultTimeline: string;
  reducedMotionPose: string;
  events: Record<string, string>;
  raw: unknown;
}

export interface CompiledRig {
  rig: Rig;
  poses: Record<string, CompiledFrame>;
  timelines: Record<string, { name: string; tickMs: number; loop: boolean; frames: { pose: string; hold: number; durationMs: number; frame: CompiledFrame }[] }>;
  warnings: CompileWarning[];
}

export const QUADRANT_GLYPHS: readonly string[];
export const GLYPH_TO_MASK: Readonly<Record<string, number>>;
export function charWidth(codePoint: number): 0 | 1 | 2;

export class RigError extends Error {
  issues: Issue[];
}
export function loadRig(raw: unknown): { rig: Rig; issues: Issue[] };
export function hold(pose: string, ticks?: number, extra?: object): { pose: string; hold: number };

export function compileGridToFrame(grid: PixelGrid, palette: Record<TokenKey, PaletteToken>): CompiledFrame;
export function applyOverlays(frame: CompiledFrame, overlays: Overlay[], palette: Record<TokenKey, PaletteToken>): CompiledFrame;
export function frameToText(frame: CompiledFrame): string[];
export function frameToAnsiLines(frame: CompiledFrame, palette: Record<TokenKey, PaletteToken>, caps?: TerminalCapabilities): string[];
export function renderSynchronizedFrame(lines: string[], prevLines: string[] | null, caps?: TerminalCapabilities): { payload: string; lines: string[] };
export const SYNC_BEGIN: string;
export const SYNC_END: string;
export const CURSOR_HIDE: string;
export const CURSOR_SHOW: string;

export function compileRig(raw: unknown): CompiledRig;
export function linesFor(compiled: CompiledRig, caps: TerminalCapabilities): {
  poses: Record<string, string[]>;
  timelines: Record<string, { tickMs: number; loop: boolean; frames: { durationMs: number; lines: string[] }[] }>;
};
export function poseTexts(compiled: CompiledRig): Record<string, string[]>;
export function frameToSpans(frame: CompiledFrame, palette: Record<TokenKey, PaletteToken>, opts?: { bgFill?: boolean }): { text: string; fg?: string; bg?: string }[][];
export function toBundle(compiled: CompiledRig): object;

export function detectCapabilities(env?: Record<string, string | undefined>, stream?: { isTTY?: boolean; columns?: number }): Required<TerminalCapabilities>;
export function detectCapabilitiesAsync(env?: Record<string, string | undefined>, io?: object): Promise<Required<TerminalCapabilities>>;
export function probeSyncOutput(io?: object): Promise<boolean | null>;

export class TerminalPlayer {
  constructor(compiled: CompiledRig | object, caps: TerminalCapabilities, opts?: object);
  play(timeline?: string, opts?: { loops?: number }): Promise<void>;
  draw(frame: CompiledFrame): void;
  stop(): void;
  restore(): void;
}

export function validateRig(raw: unknown, opts?: { seamThreshold?: number }): {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  info: Issue[];
  summary: { name?: string; canvas?: string; poses?: string[]; timelines?: string[] };
};

export function generateAnsiPlayer(compiled: CompiledRig): string;
export function generateInkModule(compiled: CompiledRig, opts?: { bgFill?: boolean }): string;
export function createMascotComponent(data: object, deps: { React: unknown; ink: unknown }): (props: {
  timeline?: string;
  playing?: boolean;
  reducedMotion?: boolean;
  loops?: number;
  onDone?: () => void;
}) => unknown;
export function toSpansBundle(compiled: CompiledRig, opts?: { bgFill?: boolean }): object;
export function generateClaudeMod(compiled: CompiledRig, opts?: { modName?: string; tickMs?: number; passes?: number; reducedMotion?: boolean; author?: string }): Record<string, string>;
export function generateSvg(compiled: CompiledRig, opts?: { timeline?: string; square?: boolean; scale?: number; clockSync?: boolean }): string;
export function generatePoseSvg(compiled: CompiledRig, pose: string, opts?: { square?: boolean; scale?: number }): string;

// ---- quadmotion/scenes ----
export interface SceneStats { frames: number; foldedCells: number }
export type CompiledScene = CompiledRig & { stats: SceneStats; rig: Rig & { title: string; description: string } };
export declare class Canvas {
  constructor(width: number, height: number);
  width: number;
  height: number;
  px: PixelGrid;
  set(x: number, y: number, tok: TokenKey | null): void;
  get(x: number, y: number): TokenKey | null;
  rect(x: number, y: number, w: number, h: number, tok: TokenKey | null): void;
  hline(x0: number, x1: number, y: number, tok: TokenKey | null): void;
  ellipse(cx: number, cy: number, rx: number, ry: number, tok: TokenKey | null): void;
  line(x0: number, y0: number, x1: number, y1: number, tok: TokenKey | null): void;
  blit(grid: PixelGrid, x: number, y: number, opts?: { remap?: Record<string, TokenKey | null>; flipX?: boolean }): void;
  static sprite(rows: string[]): PixelGrid;
}

// ---- Pip and the stage (src/stage) ----
export interface PipState {
  body?: "s2" | "s1" | "n" | "b" | "t1" | "t2" | string;
  legLen?: number;
  y?: number;
  eyes?: string;
  look?: number;
  lookY?: number;
  mouth?: string | null;
  blush?: boolean;
  armL?: string;
  armR?: string;
  antenna?: number;
  bulb?: "on" | "off" | "glow";
}
export type Action = (pip: Pip, world: World, ...args: any[]) => Generator<void, void, unknown>;
export declare class Pip {
  x: number;
  facing: 1 | -1;
  state: Required<PipState>;
  readonly busy: boolean;
  do(action: Action, ...args: any[]): this;
  interrupt(action: Action, ...args: any[]): this;
}
export declare class World {
  constructor(opts?: { cols?: number; rows?: number; seed?: number; groundRow?: number });
  cols: number;
  rows: number;
  W: number;
  H: number;
  ground: number;
  t: number;
  pip: Pip;
  props: { kind: string; x: number; step?(w: World): void; draw(c: Canvas, w: World): void; dead?: boolean; layer?: string }[];
  rand(): number;
  step(): void;
  render(): { canvas: Canvas; overlays: Overlay[] };
  dust(x: number, strength?: number): void;
  spray(x: number, y: number, n: number, opts?: object): void;
  say(text: string, ticks?: number, opts?: object): void;
  mark(text: string, ticks: number, opts?: object): void;
}
export interface Act {
  title: string;
  description: string;
  ticks: number;
  setup?(w: World): void;
  at?: Record<number, (w: World) => void>;
  run(w: World): void;
}
export const TICK_MS: number;
export const NEUTRAL: Readonly<Required<PipState>>;
export const walkTo: Action;
export const jump: Action;
export const wave: Action;
export const spin: Action;
export const lookAround: Action;
export const settle: Action;
export const pose: Action;
export const wait: Action;
export function drawPip(c: Canvas, state: PipState & { x: number; ground: number; facing?: 1 | -1 }): object;
export const EYES: Record<string, string[]>;
export const MOUTHS: Record<string, string[]>;
export const ARMS: Record<string, [number, number][]>;
export const BODY_SIZES: Record<string, [number, number]>;
export const PIP_PALETTE: Record<string, object>;
export const STAGE_PALETTE: Record<string, object>;
export const ACTS: Record<string, Act>;
export const GROUPS: Record<string, { ACTS: Record<string, Act>; PALETTE: Record<string, object> }>;
export function buildActs(ids?: string[]): CompiledScene[];
export function recordAct(act: Act & { id: string }): CompiledScene;
export function checkAct(scene: CompiledScene): { code: string; tick: number; message: string }[];
export function createLive(opts?: { seed?: number; cols?: number; rows?: number }): {
  readonly world: World;
  TICK_MS: number;
  step(): void;
  frame(): CompiledFrame;
  poke(): boolean;
  goto(x: number): void;
  walkHeld(dir: 1 | -1, held: () => boolean, run?: boolean): void;
  jump(dir?: number): void;
  play(id: string): void;
};
