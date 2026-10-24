# spring

`@spring()` gives a spring-like easing for animations and transitions.

```css
@use: spring;
transition: translate 1s @spring(.4);
```

## @spring()

`@spring([<bounce>])`

- Returns a `linear()` easing: a spring let go at the start, settling
  at the end.
- `<bounce>` goes from `0` (no overshoot) to `.95`. Default: `.3`.
- The whole spring fits the duration, so bouncier springs want longer
  durations.
