# maze

`@maze()` turns the grid into a maze, one cell per cell, with one path
between any two of them.

```css
@use: maze;
@grid: 20 / 60vmin;
background: @maze(2px, #222), #f4efe6;
```

## @maze()

`@maze([<width>], [<color>])`

- Returns background layers: the cell's walls and the post at its top
  left corner. Add your own layers after it.
- `<width>` defaults to `1px`, `<color>` to `currentColor`.
- The way in is at the top of the first cell, the way out at the bottom of
  the last.
- The maze follows the doodle's seed. Each `@maze()` in the code is its own
  maze.
