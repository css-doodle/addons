customElements.whenDefined('css-doodle').then(() => {
    const CSSDoodle = customElements.get('css-doodle');

    // the open sides of a cell, as bits
    const TOP = 1, RIGHT = 2, BOTTOM = 4, LEFT = 8;
    const STEPS = [[0, -1, TOP, BOTTOM], [1, 0, RIGHT, LEFT], [0, 1, BOTTOM, TOP], [-1, 0, LEFT, RIGHT]];

    // a perfect maze by depth-first search, in from the top of the first cell
    // and out at the bottom of the last; a cell with an open side is visited
    function build(X, Y, random) {
        let open = new Uint8Array(X * Y), stack = [0];
        open[0] = TOP;
        while (stack.length) {
            let c = stack.at(-1), x = c % X, y = (c - x) / X;
            let next = STEPS.filter(([dx, dy]) =>
                x + dx >= 0 && x + dx < X && y + dy >= 0 && y + dy < Y && !open[c + dx + dy * X]
            );
            if (!next.length) {
                stack.pop();
                continue;
            }
            let [dx, dy, from, to] = next[Math.floor(random(next.length))];
            let n = c + dx + dy * X;
            open[c] |= from;
            open[n] |= to;
            stack.push(n);
        }
        open[X * Y - 1] |= BOTTOM;
        return open;
    }

    // each wall is drawn once, by the cell below or on its right,
    // and every cell draws the post at its top left corner
    CSSDoodle.use('maze', {
        value: ([width = '1px', color = 'currentColor'], { x, y, X, Y, random, state }) => {
            let open = state.open ??= build(X, Y, random);
            let sides = open[(y - 1) * X + x - 1];
            let line = (at, size) => `linear-gradient(${color} 0 0) ${at} / ${size} no-repeat`;
            let walls = [line('left top', `${width} ${width}`)];
            if (!(sides & TOP)) walls.push(line('top', `100% ${width}`));
            if (!(sides & LEFT)) walls.push(line('left', `${width} 100%`));
            if (x == X) walls.push(line('right', `${width} 100%`));
            if (y == Y && !(sides & BOTTOM)) walls.push(line('bottom', `100% ${width}`));
            return walls.join(', ');
        },
    });
});
