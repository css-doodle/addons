# photo

`@photo()` lays an image over the grid and gives each cell its color.

```css
@use: photo;
@grid: 40 / 60vmin;
background: @photo(cat.jpg);
```

## @photo()

`@photo(<url>)`

- Returns the average color of the image under the cell, as `rgb()`.
- The image covers the grid like `background-size: cover`, centered,
  with cells taken as square.
- `url()`, quotes, and data URLs with commas work.
- Returns `transparent` until the image is in; the doodle then draws
  again with the same seed.

## @photo.lum()

`@photo.lum(<url>)`

- The cell's lightness, from `0` black to `1` white, as the eye sees it.
  Transparent parts read as white, and so does an image still loading.
- Drives any property, a halftone for one:

```css
@size: calc(sqrt(1 - @photo.lum(cat.jpg)) * 100%);
border-radius: 50%;
background: #111;
```

## Notes

- The image is read through a canvas: one from another site needs CORS
  headers. Same-site images and data URLs always work.
- It is read at 512 pixels on the longest side at most.
- Warns `image not loaded` and `no image`. Prerender doesn't wait.
