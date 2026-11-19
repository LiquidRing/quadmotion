# Full color in the Claude Code desktop app (field notes)

The `claude-mod` target draws terminal glyphs. In the Claude Code desktop app
the band above the prompt can show a full-color pixel grid instead. These
notes come from a working mod in another project (Wired Signal); QuadMotion
does not generate this path yet, and it has not been verified here.

## How it is built

- The band is drawn by a Client module: `<Client module="./strip.tsx" height={N}>`
  returned from the `AbovePrompt` render hook. The module ticks on its own
  with `surface.every`.
- A frame is a pixel grid of any density: K sub-pixel rows per text row.
- Each text row is `Box height={1} flexDirection="row" overflow="hidden"`.
  Inside it, segments; each segment has K strips of `height={100/K + "%"}`;
  each strip is runs of one color: `<Box width="x%" backgroundColor=...>`.
  Transparent tails are dropped.
- Widths are percentages rounded by the cumulative edge (`pc(b) - pc(a)`), so
  nothing drifts.
- Text overlays are their own segments: `Box width% backgroundColor` with
  `<Text mono wrap="clip">`, mixed with pixel segments in the same row.
- The terminal gets the same frame through 2x2 quadrants (two colors per
  cell, the rest folded), as QuadMotion compiles it.

## Limits

- A Client tree allows 20k nodes, depth 32 and 100,000 serialized characters
  per frame. The characters run out first: one colored run costs about 65,
  and a 32x49 character on a 3x7 grid takes about 41k.
- Save characters by merging identical neighbouring strips, using numeric
  widths where possible, and nesting less. Rain and particles are cheaper as
  a layer of glyphs than as Boxes (12-15% in measurements).

## Pitfalls

- An empty row is a Box of the right height with no children.
- In SVG for the desktop app, avoid `shape-rendering` and `@media` other than
  `prefers-reduced-motion`; otherwise the app freezes the animation.
- `ClientElements` is the terminal element table without `Client`, `Raster`
  and `Image`, so an Svg is not available inside the band.
