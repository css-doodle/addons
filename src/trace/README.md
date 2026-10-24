# trace

`@trace()` turns an image into an outline, an SVG path that `path:` takes
anywhere a shape goes, the way `text:` does for letters.

```css
@use: trace;
clip-path: @shape(path: @trace(cat.png));
```

## @trace()

```css
clip-path: @shape(path: @trace(logo.svg));
@place: @plot.scatter(path: @trace(url(cat.png)));
clip-path: @tile.voronoi(path: @trace("data:image/png;base64,…"));
background: @svg(viewBox: 0 0 400 300; path { d: @trace(photo.jpg, 30%) });
```

`@trace(<image>, [<level>])`

- `<image>` is a URL, bare, quoted or in `url()`. `data:` URLs with commas
  work too.
- In an image with transparent pixels the ink is the alpha; in an opaque
  one, a JPG for instance, the ink is the dark part.
- `<level>` is where ink starts, `50%` by default, or a number from 0 to 1.
  A lower level takes in more of the gray.
- Holes stay holes. The path is in the image's own pixels, so it lines up
  with the image in an `@svg` of the same `viewBox`.
- The image is traced at 512 pixels on its longer side. Specks smaller
  than about 2x2 of those pixels are left out.
- The doodle draws nothing in its place until the image loads, then draws
  again with the same seed. One that fails warns `cannot load image`, and
  no URL warns `no image`.
- An image from another site needs CORS headers, or it fails.
- Browsers decode and smooth images a little differently, so the same
  seed can place points slightly differently from one engine to another.
