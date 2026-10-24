# glyph-field

`@glyph-field()` turns text into an SVG path, one letter at a time, so each
letter can be moved, turned, or laid along a curve. It is what `text:` does
for a shape, with control over every letter.

```css
@use: glyph-field;
clip-path: @shape(path: @glyph-field(CSS, font bold Georgia, serif));
```

## @glyph-field()

```css
background: @svg(viewBox: @glyph-field.box(Hello); path { d: @glyph-field(Hello); });
background: @svg(viewBox: 0 0 400 200; path { d: @glyph-field(ride the wave, wave 12 160, jitter 3, spin 12); });
background: @svg(viewBox: 0 0 400 200; path { d: @glyph-field(Hello, skeleton); fill: none; stroke: red; stroke-width: 4 });
background: @svg(viewBox: 0 0 440 440; path { d: @glyph-field(around the curve, along M0 200C0 -60 400 -60 400 200) });
```

`@glyph-field(<text>, [font <font>], [along <path>], [skeleton], [tracking <n>], [wave <height> [<period>]], [jitter <n>], [spin <angle>])`

- The text is drawn at a font size of 100 units, the left edge and the top at 0, so the
  path fits `@glyph-field.box()` with the same arguments, `0 0 <width> <height>`.
  `@shape(path:)` fits it by itself.
- `font` is a style, weight and family, like the CSS `font` without the size:
  `italic 700 Georgia, serif`. It is `sans-serif` by default. The doodle
  draws again, with the same seed, when a web font has loaded.
- By default the path is the outline of every letter, holes included, to fill.
  `skeleton` gives the line down the middle of each stroke instead, open, to stroke.
- `along` sets the letters on an SVG path, each turned to follow it, with the
  baseline on the curve. Text longer than the path piles up at its end.
- `tracking` adds space between letters, in units.
- `wave` lifts the letters on a sine, `<height>` units high every `<period>` units, 100 by default.
- `jitter` moves each letter by up to that many units, and `spin` turns it by up
  to that angle (`deg` or `turn`), either way.
- `wave`, `jitter` and `spin` follow the seed, so one seed draws one arrangement.
  Drawing a letter never changes the others.

## Notes

- A letter is traced from the canvas at 160 pixels to the em, like `@trace()`,
  so curves are polygons of about a half pixel at that size.
  Kerning is not applied, each letter has its own advance.
- The skeleton thins the letter with Zhang-Suen, so it follows the stroke's middle but is not exact at corners and ends.
- It needs a canvas, so a doodle prerendered in Node draws `M0 0`.
