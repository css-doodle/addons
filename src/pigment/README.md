# pigment

`@pigment()` mixes colors the way paint mixes, so blue and yellow make
green instead of gray.

```css
@use: pigment;
background: @pigment(#002185, #fcd200);
```

## @pigment()

```css
background: @pigment(blue, yellow);
background: @pigment(red 30%, blue);
background: @pigment(teal, white 20%, @p(gold, crimson) 10%);
```

`@pigment(<color> [<percentage>], <color> [<percentage>], …)`

- Percentages work like `color-mix()`: either side of the color, the colors
  without one share what is left, and the total is scaled to 100%.
- Takes any number of colors and returns one `rgb()` color.
- A transparent color thins the mix instead of darkening it.
- Colors out of the sRGB range are clipped.

The mixing is Kubelka-Munk on 38 spectral bands, ported from
[spectral.js](https://github.com/rvanwijnen/spectral.js) by Ronald van
Wijnen (MIT). It stays within 2/255 of spectral.js per channel.
