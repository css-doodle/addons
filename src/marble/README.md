# marble

`@marble()` is paper marbling: ink drops on water, pulled into feathers with
a comb. `@marble.ink()` is ink in water, soft clouds that mix. Both are drawn
with WebGL like `@pattern`, and where pigments meet they mix like paint, so
blue and yellow make green.

```css
@use: marble;
background: @marble(#f4ecd8 #1d3557 #e63946 #f1c453);
```

## @marble()

```css
background: @marble(#f4ecd8 #1d3557 #e63946 #f1c453 #2a9d8f);
background: @marble(white #002185 #fcd200, drops 60, size 6%, comb 5% 90deg, comb 14% 0deg);
```

`@marble(<color> <color> …, [drops <n>], [size <percentage>], [comb <spacing> [<angle>]], …)`

- The first color is the paper, the rest are inks.
- `drops` is how many drops fall, 30 by default, up to 400. Later drops
  push the earlier ones aside.
- `size` is the average drop radius, as a percentage of the height, 9% by default.
- `comb` pulls a comb across, then the next `comb` pulls another one over it.
  `<spacing>` is the distance between tines, as a percentage of the height,
  8% by default. `<angle>` is the direction of the pull, 90deg by default
  (`deg` or `turn`). One comb is pulled when none is given.
- The same seed draws the same marbling.

## @marble.ink()

```css
background: @marble.ink(#fbf7ee #0a3d91 #ffc400 #d6336c);
background: @marble.ink(#111 #ffd166 #ef476f #06d6a0, scale 1.5, warp 3);
```

`@marble.ink(<color> <color> …, [scale <n>], [warp <n>])`

- The first color is the water, the rest are inks.
- `scale` is how many clouds fit in the height, 2 by default.
- `warp` is how much the clouds curl, 2 by default; 0 leaves them round.

The mixing is Kubelka-Munk on the red, green and blue channels, in linear
light. [pigment](../pigment/) does it on 38 spectral bands, so the greens
and purples differ a little.
