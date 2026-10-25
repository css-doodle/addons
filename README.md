# @css-doodle/addons

Functions for [css-doodle](https://css-doodle.com) that live outside its
bundle and are released on their own. Name one in the code and the doodle
loads it:

```css
@use: gradient-2d;
background: @mesh-gradient(red gold, teal navy);
```

## Addons

| Addon | Adds | |
| --- | --- | --- |
| [gradient-2d](src/gradient-2d/) | `@mesh-gradient()`, `@freeform-gradient()` | 2D gradients, drawn with WebGL |
| [marble](src/marble/) | `@marble()`, `@marble.ink()` | paper marbling and ink in water |
| [pigment](src/pigment/) | `@pigment()` | colors that mix like paint |
| [spring](src/spring/) | `@spring()` | spring-like easing |
| [trace](src/trace/) | `@trace()` | an image's outline as an SVG path |
| [wfc](src/wfc/) | `@wfc()`, `@wfc.tiles()`, `@wfc.turn()`, `@wfc.order()` | wave function collapse |

## Loading

### With @use

`@use: <name>` loads the addon from `@css-doodle/addons@1` on unpkg, or
jsDelivr if unpkg is down or takes over 5 seconds, once per page. The
doodle draws when it is in.

- Addons go by name, never by URL, so doodle code can only load
  css-doodle's own.
- `var(--rule)` items in the same list still insert code:
  `@use: gradient-2d, var(--rule)`.
- Write it in the outer doodle; a nested `@doodle` uses what the outer one
  loaded.
- An addon already on the page, from a script tag or an import, is not
  fetched again.

### From your own files

Set a base before the first doodle draws. It is tried before unpkg and
jsDelivr, and each addon is one file in it, like
`/vendor/css-doodle-addons/gradient-2d.js`:

```js
customElements.get('css-doodle').addonBase = '/vendor/css-doodle-addons/';
```

### With a script tag or import

Add it after css-doodle. This is the way for addons that are not
css-doodle's own, and for a page that blocks unpkg:

```html
<script src="https://unpkg.com/css-doodle/css-doodle.min.js"></script>
<script src="https://unpkg.com/@css-doodle/addons/gradient-2d.js"></script>
```

```js
import 'css-doodle';
import '@css-doodle/addons/gradient-2d';
```

Doodles already on the page that call an addon draw again, with the same
seed, when it arrives. They warn `unknown function @name()` once before.

## Writing one

An addon is a folder in `src/` with an `index.js` and a `README.md`.
`index.js` is one self-contained script, with no imports, that registers its
functions once the element is defined:

```js
customElements.whenDefined('css-doodle').then(() => {
    let CSSDoodle = customElements.get('css-doodle');
    CSSDoodle.use('stripes', {
        value: ([color = 'black'], { i }) => i % 2 ? color : 'transparent',
    });
});
```

### Values

`use(name, { value })` makes `@name(…)` a value. `value(args, api)` gets the
arguments, already evaluated and split at commas, and returns CSS text.
`api` has:

- `i`, `x`, `y`: the cell's index, column and row, like `@i`, `@x`, `@y`
- `I`, `X`, `Y`: the cell count, columns and rows
- `random()`: the doodle's seeded random, the same stream as `@r`;
  `random(n)` gives [0, n), `random(a, b)` gives [a, b)
- `seed`: the doodle's seed
- `stream(key)`: a seeded random of the addon's own, called like
  `random`. It leaves `@r` alone, and starts the same for the same seed
  and key every time, in the addon's variants too
- `state`: an object kept for this call across the cells of one draw,
  for work done once for the whole grid (fill it with `random`, not a
  cache of your own, so a redraw draws the same numbers)
- `wait(promise)`: the doodle draws again, with the same seed, once the
  promise settles; return a stand-in until then (prerender doesn't wait)

### Shaders

`use(name, { shader })` makes `@name(…)` an image drawn with WebGL, like
`@pattern`. `shader(text, api)` gets the argument text and returns
[`@shaders`](https://css-doodle.com) code: a fragment shader, or
`fragment {}` / `vertex {}` / `texture {}` sections. css-doodle supplies
`u_resolution`, `u_time`, `u_mouse`, `u_seed` and `FragColor`, sizes the
image, and animates it when it reads `u_time`.

Its `api` also has `expr(text)`: the math of `@pattern` as GLSL for a
float, with `t` for the time in seconds, `9%` as 9 and an angle in
degrees, or `null`, with a warning, when it doesn't read. Math that reads
`t` reads `u_time`, so the image moves.

### Both kinds

The `api` of both kinds has:

- `color(value, space)`: `[r, g, b, a]` for a CSS color in a `color-mix()`
  space (default `srgb`), or `null`
- `split(text)`: cuts at top-level commas
- `words(text)`: cuts at top-level spaces
- `warn(message)`: reports a warning on the doodle

### Variants

`use('name.kind', …)` adds `@name.kind(…)`, of either kind, once `name`
itself is in. Only an addon's own name takes variants.

### Rules

- A function with options takes them as declarations, like `@shape()`:
  `@name(colors: red, blue; scale: 2)`, a flag as a name alone. One or two
  plain values go in as they are, like the arguments of a CSS function.
- A number option of a shader takes math through `expr()`, so `t` can
  move it; a number alone still reads as it did.
- Output should depend only on the input, `random`, `seed` and `stream`,
  so a seed keeps drawing the same picture. Version the addon file.
- A name that is already taken is kept: a built-in name warns, an addon
  loaded twice is left out quietly.
- An error thrown inside an addon becomes a warning.

## Development

```bash
npm install
npm test            # against ../css-doodle, or set CSSD_SRC to its src/
npm run build       # dist/<name>.js and the package.json to publish
npm run test:dist   # builds, tests dist/, and draws the shaders in Chrome
```

`dist/` is the published package, so `dist/gradient-2d.js` is served as
`@css-doodle/addons@1/gradient-2d.js`. A new addon is a minor version, and
css-doodle needs no release. Pushing the version tag publishes it: the
release workflow runs the tests against css-doodle's `main`, then
`npm publish ./dist`:

```bash
npm version minor
git push --follow-tags
```

Never change the syntax of a published function, only add, and never what
it draws: `test/golden/` keeps each addon's output for a fixed input and
seed, and the tests fail when it changes. A breaking change, or a fix that
redraws shared doodles, goes out as the next major, which a new css-doodle
opts into. `GOLDEN=update npm test` writes the outputs anew, for that and
for a new addon.
