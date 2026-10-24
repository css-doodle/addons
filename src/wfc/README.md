# wfc

Wave function collapse, after Maxim Gumin's
[WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse):
the grid is filled so that it looks like a small sample, or so that tiles
fit together at their edges.

```css
@use: wfc;
```

## @wfc()

The overlapping model. Draw a small sample with one character per pixel;
every cell takes a character so that each `n` x `n` window of the grid
is one that shows up in the sample.

```css
@grid: 40 / 60vmin;
background: @wfc(
  sample:
    ..........
    .####.....
    .#..#.....
    .####..##.
    .......##.
    ..........;
  legend: . #f4efe6, # #1d3557;
);
```

`@wfc(<sample>)`, or with options:

```
@wfc(
  sample: <sample>;
  legend: <key> <value>, …;
  n: <2|3>;
  symmetry: <1-8>;
  ground;
)
```

- The sample is rows of the same length, split by spaces or new lines,
  one character per pixel (emoji count as one). It wraps around, and so
  does the grid.
- Options are optional and go in any order.
- Or a grid of values, rows split by `/`, one word per pixel; the words
  come back as they are, so no legend is needed:

  ```css
  background: @wfc(#eee #eee #eee #eee / #eee #222 #eee #eee / #eee #eee #eee #eee / #eee #eee #eee #eee);
  scale: @wfc(.2 .2 .2 .2 / .2 1 .2 .2 / .2 .2 .2 .2 / .2 .2 .2 .2);
  ```

- `legend` gives characters or words of the sample a value each: a
  color, a length, anything. Values may change from cell to cell, like
  `# @pigment(navy, teal @r(90)%)`; the layout stays the same. A
  character or word without a key comes back as itself.
- `n` is the window size, 3 by default. 2 copies less of the sample.
- `symmetry` is how many of the window's turns and flips count too:
  8 (default) takes all, 2 only left-right flips, 1 the sample as drawn.
- `ground`, written alone, keeps the sample's bottom row along the bottom
  of the grid, for things that stand on the ground. Use it with `symmetry: 2`.
- Some samples don't fit some grid sizes; then it warns `contradiction`
  and draws nothing. A different size or seed usually works.

## @wfc.tiles() and @wfc.turn()

The tiled model. Give each tile a value and the labels on its four sides,
top, right, bottom, left; tiles sit side by side where the labels match.

```css
@grid: 16 / 60vmin;
--line: linear-gradient(90deg, #0000 40%, #222 0 60%, #0000 0);
--corner: radial-gradient(circle at 100% 0, #0000 28.3%, #222 0 42.4%, #0000 0);
background: @wfc.tiles(var(--line) 1010, var(--corner) 1100, none 0000);
rotate: @wfc.turn();
```

`@wfc.tiles(<value> <sides> [<weight>], …)`

- `<sides>` is four characters, one label per side.
- Every turn of a tile is tried, so a corner covers all four corners.
  `@wfc.turn()`, written after it, gives the turn the cell needs: `0deg`,
  `90deg`, `180deg` or `270deg`.
- `<weight>` makes a tile more or less common, 1 by default.
- A set with a tile for every mix of side labels never contradicts:
  with labels `0` and `1`, that's `0000`, `1000`, `1100`, `1010`, `1110`
  and `1111`, since turns cover the rest. A set with gaps works on small
  grids and contradicts more often as the grid grows.

## @wfc.order()

```css
background: @wfc.tiles(var(--line) 1010, var(--corner) 1100, none 0000);
rotate: @wfc.turn();
animation: appear .5s calc(@wfc.order() * 4s) both;
```

- When the last `@wfc()` or `@wfc.tiles()` in the cell decided it, from `0`
  (before the first choice) to `1` (the last choice). Write it after that call.
- As an animation delay, the doodle fills in the order it was solved.

## Notes

- The layout follows the doodle's seed, and draws from a stream of its own,
  so `@r` values elsewhere stay put. Changing values or tile art keeps the
  layout; changing the sample, sides or weights makes a new one.
- The same call written twice reads the same layout.
- A solve takes tens of milliseconds for a 32 x 32 grid and a sample with
  a hundred windows; a 64 x 64 grid takes a few times more.
