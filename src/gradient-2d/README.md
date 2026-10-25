# gradient-2d

`@mesh-gradient()` and `@freeform-gradient()`, a simpler syntax for the
[CSS 2D gradients explainer](https://github.com/w3c/csswg-drafts/blob/main/css-images-5/explainers/2d-gradients.md),
drawn with WebGL like `@pattern`.

```css
@use: gradient-2d;
```

## @mesh-gradient()

```css
background: @mesh-gradient(red gold, teal navy);
background: @mesh-gradient(#f43 gold #0bf, #a0f white at 40% 60% #0c6, navy #f0a teal);
```

`@mesh-gradient([in <space>,] <row>, <row>, …)`

- Rows are separated by commas, top row first; colors in a row by spaces.
- Points sit on an even grid; `<color> at <x> <y>` moves one point.
- The curves between points are smooth, with no control points to set.
- One row runs left to right; one color per row runs top to bottom.
- A shorter row repeats its last color.
- A point moved close to the edge can fold the gradient there.

## @freeform-gradient()

```css
background: @freeform-gradient(red at top left, gold 20% at 70% 30%, teal at bottom);
```

`@freeform-gradient([in <space>,] <color> [<spread>] at <position>, …)`

- Each color blends out from its position.
- `<spread>` is a percentage: the radius the color stays solid.
- A color without a position sits at the center.

## Moving

A position or a spread also takes math in parentheses, as in `@pattern`,
with `t` for the time in seconds. The gradient moves when any reads `t`:

```css
background: @mesh-gradient(#f43 gold #0bf, #a0f white at (50% + 25% * sin(t)) (50% + 25% * cos(t)) #0c6, navy #f0a teal);
background: @freeform-gradient(red at top left, gold (10% + 8% * sin(t * 2)) at 70% 30%, teal at (50% + 40% * sin(t)) bottom);
```

- `t` is the shader's time. `@t` is CSS time, which the shader never sees.
- `9%` is a percentage and `t % 2` the remainder. `left`, `top` and the
  other words don't go in math. The functions are GLSL's, like `sin()`,
  `min()` and `smoothstep()`.
- Points that move keep blending with their nearest neighbors as they go.
- Math that doesn't read warns, and the point goes where it would without
  a position, or without a spread.
- Math needs a css-doodle newer than 0.65.

## Values

- Positions take percentages and `left`, `right`, `top`, `bottom`, `center`, not lengths.
- Spaces are `oklab` (default), `srgb` and `srgb-linear`. Colors mix with premultiplied alpha.
