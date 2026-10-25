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
background: @marble(
  colors: white, #002185, #fcd200;
  drops: 60;
  size: 6%;
  comb: 5% 90deg, 14% 0deg;
);
background: @marble(colors: #f4ecd8, #1d3557, #e63946, #f1c453; flow: 1);
```

`@marble(<color> <color> …)`, or with options:

```
@marble(
  colors: <color>, <color>, …;
  drops: <n>;
  size: <percentage>;
  comb: <spacing> [<angle>], …;
  flow: <n>;
)
```

- The first color is the paper, the rest are inks.
- Options are optional and go in any order.
- `drops` is how many drops fall, 30 by default, up to 400. Later drops
  push the earlier ones aside.
- `size` is the average drop radius, as a percentage of the height, 9% by default.
- `comb` pulls a comb across, then each one after a comma pulls another
  one over it. `<spacing>` is the distance between tines, as a percentage
  of the height, 8% by default. `<angle>` is the direction of the pull,
  90deg by default (`deg` or `turn`). One comb is pulled when none is given.
- `flow` slides the combs across their tines, so the feathers ripple. 1
  is a slow drift, 2 twice as fast, and 0, the default, keeps it still.
- The same seed draws the same marbling.

## @marble.ink()

```css
background: @marble.ink(#fbf7ee #0a3d91 #ffc400 #d6336c);
background: @marble.ink(
  colors: #111, #ffd166, #ef476f, #06d6a0;
  scale: 1.5;
  warp: 3;
);
background: @marble.ink(colors: #fbf7ee, #0a3d91, #ffc400, #d6336c; flow: 1);
```

`@marble.ink(<color> <color> …)`, or with options:

```
@marble.ink(
  colors: <color>, <color>, …;
  scale: <n>;
  warp: <n>;
  flow: <n>;
)
```

- The first color is the water, the rest are inks.
- `scale` is how many clouds fit in the height, 2 by default.
- `warp` is how much the clouds curl, 2 by default; 0 leaves them round.
- `flow` is how fast the clouds drift as they curl, 0 by default.

## Moving

A number option also takes math, as in `@pattern`, with `t` for the time
in seconds. The image moves when an option reads `t`:

```css
background: @marble(colors: #f4ecd8, #1d3557, #e63946, #f1c453; drops: min(t * 5, 40));
background: @marble(colors: #f4ecd8, #1d3557, #e63946, #f1c453; comb: 6% (90deg + 20deg * sin(t)));
background: @marble.ink(colors: #fbf7ee, #0a3d91, #ffc400, #d6336c; warp: 2 + sin(t));
```

- `t` is the shader's time. `@t` is CSS time, which the shader never sees.
- `9%` is a percentage and `t % 2` the remainder; angles take `deg`,
  `turn` or `rad`. The functions are GLSL's, like `sin()`, `min()` and
  `smoothstep()`.
- A comb's spacing or angle goes in parentheses when it is math.
- `drops` brings each drop in as the count passes it, growing from nothing.
- Math that doesn't read warns, and the option keeps the number it starts
  with, or its default.
- Math needs a css-doodle newer than 0.65. `flow` works with any.

The mixing is Kubelka-Munk on the red, green and blue channels, in linear
light. [pigment](../pigment/) does it on 38 spectral bands, so the greens
and purples differ a little.
