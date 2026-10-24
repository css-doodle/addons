customElements.whenDefined('css-doodle').then(() => {
    const CSSDoodle = customElements.get('css-doodle');

    // bounce -> easing, so a grid works it out once rather than per cell
    const springs = new Map();

    // a damped spring let go at 0, pulled to 1, sampled until it settles
    function spring(bounce) {
        bounce = Math.min(.95, Math.max(0, bounce));
        if (springs.has(bounce)) return springs.get(bounce);
        let zeta = 1 - bounce, wd = Math.sqrt(1 - zeta * zeta);
        let at = t => wd
            ? 1 - Math.exp(-zeta * t) * (Math.cos(wd * t) + zeta / wd * Math.sin(wd * t))
            : 1 - Math.exp(-t) * (1 + t);
        let end = 0;
        for (let t = 0; t < 200; t += .02) {
            if (Math.abs(at(t) - 1) > .001) end = t;
        }
        let n = Math.max(30, Math.ceil(end * 2));
        let stops = Array.from({ length: n }, (_, i) => +at(end * i / n).toFixed(3));
        let easing = `linear(${stops.join(', ')}, 1)`;
        springs.size > 64 && springs.delete(springs.keys().next().value);
        springs.set(bounce, easing);
        return easing;
    }

    CSSDoodle.use('spring', {
        value: ([bounce = .3]) => spring(+bounce || 0),
    });
});
