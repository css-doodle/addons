/*! Wave function collapse after WaveFunctionCollapse, (c) 2016 Maxim Gumin, MIT, https://github.com/mxgmn/WaveFunctionCollapse */
customElements.whenDefined('css-doodle').then(() => {
    const CSSDoodle = customElements.get('css-doodle');

    // left, down, right, up
    const DX = [-1, 0, 1, 0], DY = [0, 1, 0, -1], OPPOSITE = [2, 3, 0, 1];

    // a seeded stream of its own, so @r values around it stay put; it is
    // keyed by what shapes the layout, so new values keep the same layout
    function stream(text) {
        let a = 0x9e3779b9;
        for (let i = 0; i < text.length; i++) {
            a = Math.imul(a ^ text.charCodeAt(i), 0x5bd1e995);
            a ^= a >>> 15;
        }
        return () => {
            let t = a += 0x6d2b79f5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // The solver, on a grid that wraps around. Every cell starts with all
    // patterns; the cell with the lowest entropy is observed (one pattern
    // kept, picked by weight), and the bans spread to the neighbors through
    // counts of the patterns that still support each one. Returns the pattern
    // of each cell and when it was decided, from 0 to 1, or null on a
    // contradiction.
    function run(W, H, weights, propagator, random, setup) {
        let T = weights.length, size = W * H, failed = false;
        let wave = new Uint8Array(size * T).fill(1);
        let compatible = new Int32Array(size * T * 4);
        let ones = new Int32Array(size).fill(T);
        let logs = weights.map(w => w * Math.log(w));
        let sum = weights.reduce((a, b) => a + b), logSum = logs.reduce((a, b) => a + b);
        let sums = new Float64Array(size).fill(sum), logSums = new Float64Array(size).fill(logSum);
        let entropy = new Float64Array(size).fill(Math.log(sum) - logSum / sum);
        let decided = new Int32Array(size), steps = 0, stack = [];

        let ban = (i, t) => {
            if (!wave[i * T + t]) return;
            wave[i * T + t] = 0;
            compatible.fill(0, (i * T + t) * 4, (i * T + t) * 4 + 4);
            stack.push(i, t);
            let left = --ones[i];
            if (!left) failed = true;
            if (left == 1) decided[i] = steps;
            sums[i] -= weights[t];
            logSums[i] -= logs[t];
            entropy[i] = Math.log(sums[i]) - logSums[i] / sums[i];
        };
        let propagate = () => {
            while (stack.length && !failed) {
                let t1 = stack.pop(), i1 = stack.pop(), x1 = i1 % W, y1 = (i1 - x1) / W;
                for (let d = 0; d < 4; d++) {
                    let i2 = (x1 + DX[d] + W) % W + (y1 + DY[d] + H) % H * W;
                    for (let t2 of propagator[d][t1]) {
                        if (--compatible[(i2 * T + t2) * 4 + d] == 0) ban(i2, t2);
                    }
                }
            }
            return !failed;
        };

        for (let i = 0; i < size; i++) {
            for (let t = 0; t < T; t++) {
                for (let d = 0; d < 4; d++) compatible[(i * T + t) * 4 + d] = propagator[OPPOSITE[d]][t].length;
            }
        }
        for (let i = 0; i < size; i++) {
            for (let t = 0; t < T; t++) {
                if (propagator.some(p => !p[t].length)) ban(i, t);
            }
        }
        setup?.(ban);
        if (!propagate()) return null;

        while (true) {
            let min = 1e4, node = -1;
            for (let i = 0; i < size; i++) {
                if (ones[i] > 1 && entropy[i] <= min) {
                    let noise = 1e-6 * random();
                    if (entropy[i] + noise < min) min = entropy[i] + noise, node = i;
                }
            }
            if (node < 0) break;
            steps++;
            let r = random() * sums[node], keep = -1;
            for (let t = 0; t < T; t++) {
                if (wave[node * T + t]) {
                    keep = t;
                    if ((r -= weights[t]) <= 0) break;
                }
            }
            for (let t = 0; t < T; t++) {
                if (t != keep) ban(node, t);
            }
            if (!propagate()) return null;
        }
        return {
            cells: Array.from({ length: size }, (_, i) => wave.indexOf(1, i * T) - i * T),
            order: Array.from(decided, step => +(step / (steps || 1)).toFixed(3)),
        };
    }

    // a few tries, as a contradiction can come up late
    function solve(model, X, Y, random, warn, setup) {
        for (let i = 0; i < 10; i++) {
            let result = run(X, Y, model.weights, model.propagator, random, setup);
            if (result) return result;
        }
        warn('contradiction');
    }

    // The overlapping model: every n x n window of the sample, wrapping
    // around, with its rotations and reflections up to `symmetry`, weighted
    // by how often it shows up. Two patterns sit next to each other when
    // their overlap agrees. A cell takes the top left of its pattern.
    // Ground patterns start on the sample's bottom row, unturned.
    function overlapping(rows, n, symmetry) {
        let SX = rows[0].length, SY = rows.length, tokens = [];
        let sample = rows.flat().map(token => (tokens.includes(token) || tokens.push(token), tokens.indexOf(token)));
        let pattern = f => Array.from({ length: n * n }, (_, i) => f(i % n, (i - i % n) / n));
        let rotate = p => pattern((x, y) => p[n - 1 - y + x * n]);
        let reflect = p => pattern((x, y) => p[n - 1 - x + y * n]);
        let index = new Map(), patterns = [], weights = [], ground = new Set();
        for (let y = 0; y < SY; y++) {
            for (let x = 0; x < SX; x++) {
                let ps = [pattern((dx, dy) => sample[(x + dx) % SX + (y + dy) % SY * SX])];
                for (let k = 1; k < 8; k++) ps.push(k % 2 ? reflect(ps[k - 1]) : rotate(ps[k - 2]));
                ps.slice(0, symmetry).forEach((p, k) => {
                    let key = p.join();
                    if (index.has(key)) weights[index.get(key)]++;
                    else index.set(key, patterns.length), patterns.push(p), weights.push(1);
                    if (y == SY - 1 && k < 2) ground.add(index.get(key));
                });
            }
        }
        let agrees = (p1, p2, dx, dy) => {
            for (let y = Math.max(0, dy); y < Math.min(n, n + dy); y++) {
                for (let x = Math.max(0, dx); x < Math.min(n, n + dx); x++) {
                    if (p1[x + n * y] != p2[x - dx + n * (y - dy)]) return false;
                }
            }
            return true;
        };
        let propagator = DX.map((dx, d) => patterns.map(p1 =>
            patterns.flatMap((p2, t2) => agrees(p1, p2, dx, DY[d]) ? [t2] : [])
        ));
        return { patterns, weights, propagator, tokens, ground };
    }

    // The tiled model, with tiles described by the labels on their four
    // sides: top, right, bottom, left. Each turn of a tile is a pattern of its
    // own, unless its sides read the same as an earlier turn. Two tiles sit
    // next to each other when the sides they share have the same label.
    function tiled(entries) {
        let tiles = [];
        entries.forEach(({ sides, weight }, tile) => {
            for (let turn = 0, s = sides; turn < 4; turn++, s = [s[3], ...s.slice(0, 3)]) {
                if (!tiles.some(t => t.tile == tile && t.sides.join() == s.join())) tiles.push({ tile, turn, sides: s, weight });
            }
        });
        // the side facing each direction, and the side of the neighbor facing back
        let face = [3, 2, 1, 0], back = [1, 0, 3, 2];
        let propagator = face.map((f, d) => tiles.map(a =>
            tiles.flatMap((b, t2) => a.sides[f] == b.sides[back[d]] ? [t2] : [])
        ));
        return { tiles, weights: tiles.map(t => t.weight), propagator };
    }

    // a sample pixel is a character as it reads, emoji included,
    // or a word when the rows are split by /
    const segmenter = globalThis.Intl?.Segmenter && new Intl.Segmenter();
    const characters = text => segmenter ? Array.from(segmenter.segment(text), s => s.segment) : [...text];

    function readRows(sample, words) {
        let parts = words(String(sample));
        if (!parts.includes('/')) return parts.map(characters);
        let rows = [[]];
        for (let part of parts) part == '/' ? rows.push([]) : rows.at(-1).push(part);
        return rows;
    }

    // `name: value;` declarations, cut at the semicolons outside parentheses
    // and quotes; a name alone is a flag. Null when none names a known
    // option, for the older `value, name value, …` form.
    function declarations(text, names) {
        let pieces = [], depth = 0, quote = '', from = 0;
        for (let i = 0; i < text.length; i++) {
            let c = text[i];
            if (quote) c == quote && (quote = '');
            else if (c == '"' || c == "'") quote = c;
            else if (c == '(' || c == ')') depth += c == '(' ? 1 : -1;
            else if (c == ';' && !depth) pieces.push(text.slice(from, i)), from = i + 1;
        }
        let list = [...pieces, text.slice(from)].map(p => p.trim()).filter(Boolean)
            .map(p => p.match(/^([\w-]+)\s*:\s*([^]*)$/)?.slice(1) ?? [p, null]);
        return list.some(([name, value]) => value != null && names.includes(name)) ? list : null;
    }

    // `sample: …;` and the options as declarations, `ground` alone; or in the
    // older form the sample, then options and legend entries after commas
    function readOptions([sample = '', ...rest], { split, words, warn }) {
        let options = { sample: String(sample), legend: {}, n: 3, symmetry: 8, ground: false };
        let set = (name, value) => {
            if (name == 'n' && /^[23]$/.test(value)) options.n = +value;
            else if (name == 'symmetry' && /^[1-8]$/.test(value)) options.symmetry = +value;
            else if (name == 'ground' && !value) options.ground = true;
            else return false;
            return true;
        };
        let list = declarations([sample, ...rest].join(','), ['sample', 'legend', 'n', 'symmetry']);
        if (list) for (let [name, value] of list) {
            if (name == 'sample' && value != null) options.sample = value;
            else if (name == 'legend' && value != null) for (let entry of split(value)) {
                let [key, ...parts] = words(entry);
                if (parts.length) options.legend[key] = parts.join(' ');
                else warn(`invalid legend ${entry}`);
            }
            else if (!set(name, value)) warn(`unknown option ${name}${value == null ? '' : ': ' + value}`);
        } else for (let arg of rest) {
            let [name, ...value] = words(String(arg));
            if (set(name, value.join(' '))) continue;
            if (value.length) options.legend[name] = value.join(' ');
            else warn(`unknown option ${arg}`);
        }
        return options;
    }

    function readTiles(args, words, warn) {
        let entries = [];
        for (let arg of args) {
            let parts = words(String(arg)), weight = 1;
            if (parts.length > 2 && /^[\d.]+$/.test(parts.at(-1))) weight = +parts.pop();
            let sides = parts.pop();
            if (!parts.length || characters(sides).length != 4 || !(weight > 0)) {
                warn(`invalid tile ${arg}`);
                return;
            }
            entries.push({ value: parts.join(' '), sides: characters(sides), weight });
        }
        return entries.length ? entries : undefined;
    }

    // Solves are kept by doodle seed, grid and what shapes the layout, so
    // the same call anywhere in the doodle reads the same solve, and values
    // that change from cell to cell don't solve again. Their warnings are
    // told once per call in each draw.
    const solves = new Map();
    function cached(key, { state, warn }, make) {
        if (!solves.has(key)) {
            if (solves.size > 32) solves.delete(solves.keys().next().value);
            let notes = [];
            solves.set(key, { ...make(note => notes.push(note)), notes });
        }
        let solved = solves.get(key);
        if (!state.told) solved.notes.forEach(warn), state.told = true;
        return solved;
    }

    // the cells of the last @wfc.tiles() and the order of the last solve,
    // for @wfc.turn() and @wfc.order()
    let last, lastOrder;

    CSSDoodle.use('wfc', {
        value: (args, api) => {
            let { x, y, X, Y, seed, words, state, warn } = api;
            let { sample, legend, n, symmetry, ground } = readOptions(args, api);
            let key = ['wfc', seed, X, Y, sample, n, symmetry, ground].join('\n');
            let { cells = [], tokens = [], order } = cached(key, api, warn => {
                let rows = readRows(sample, words);
                if (!rows.length || rows.some(row => row.length != rows[0].length)) {
                    warn('uneven sample rows');
                    return {};
                }
                let model = overlapping(rows, n, symmetry);
                // the sample's bottom row runs along the bottom row, and nowhere else
                let setup = ground ? ban => {
                    for (let i = 0; i < X * Y; i++) {
                        for (let t = 0; t < model.weights.length; t++) {
                            if (model.ground.has(t) != i >= X * (Y - 1)) ban(i, t);
                        }
                    }
                } : null;
                let { cells = [], order } = solve(model, X, Y, stream(key), warn, setup) || {};
                return { cells: cells.map(t => model.tokens[model.patterns[t][0]]), tokens: model.tokens, order };
            });
            if (!state.checked) {
                for (let name in legend) {
                    if (tokens.length && !tokens.includes(name)) warn(`unknown option ${name} ${legend[name]}`);
                }
                state.checked = true;
            }
            lastOrder = order;
            let token = cells[(y - 1) * X + x - 1];
            return token == null ? '' : legend[token] ?? token;
        },
    });

    CSSDoodle.use('wfc.tiles', {
        value: (args, api) => {
            let { x, y, X, Y, seed, words } = api;
            let entries = readTiles(args, words, api.warn);
            if (!entries) return '';
            let key = ['tiles', seed, X, Y, ...entries.map(e => e.sides.join('') + ' ' + e.weight)].join('\n');
            let solved = cached(key, api, warn => {
                let { tiles, weights, propagator } = tiled(entries);
                let { cells = [], order } = solve({ weights, propagator }, X, Y, stream(key), warn) || {};
                return { cells: cells.map(t => tiles[t]), order };
            });
            last = solved.cells;
            lastOrder = solved.order;
            let cell = last[(y - 1) * X + x - 1];
            return cell ? entries[cell.tile].value : '';
        },
    });

    // the turn of the tile the last @wfc.tiles() gave this cell
    CSSDoodle.use('wfc.turn', {
        value: (args, { x, y, X }) => (last?.[(y - 1) * X + x - 1]?.turn ?? 0) * 90 + 'deg',
    });

    // when the last @wfc() or @wfc.tiles() decided this cell, from 0 to 1
    CSSDoodle.use('wfc.order', {
        value: (args, { x, y, X }) => lastOrder?.[(y - 1) * X + x - 1] ?? 0,
    });
});
