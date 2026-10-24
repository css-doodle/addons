customElements.whenDefined('css-doodle').then(() => {
    const CSSDoodle = customElements.get('css-doodle');

    // glyphs are traced at F pixels to the em and laid out at 100 units
    const F = 160, PAD = 12, K = 100 / F, MID = -35;
    const OPTIONS = ['font', 'along', 'skeleton', 'tracking', 'wave', 'jitter', 'spin'];
    const glyphs = new Map(), layouts = new Map();
    const angle = text => parseFloat(text) * { turn: 360, rad: 180 / Math.PI }[text.replace(/[-\d.]/g, '')] || parseFloat(text) || 0;

    // Douglas-Peucker, keeps the points farther than tol from the chord
    function thin(line, tol) {
        let keep = new Uint8Array(line.length), stack = [[0, line.length - 1]];
        keep[0] = keep[line.length - 1] = 1;
        while (stack.length) {
            let [a, b] = stack.pop(), [ax, ay] = line[a], dx = line[b][0] - ax, dy = line[b][1] - ay;
            let l = Math.hypot(dx, dy) || 1, far = tol, at = 0;
            for (let i = a + 1; i < b; ++i) {
                let d = Math.abs((line[i][0] - ax) * dy - (line[i][1] - ay) * dx) / l;
                if (d > far) far = d, at = i;
            }
            if (at) keep[at] = 1, stack.push([a, at], [at, b]);
        }
        return line.filter((_, i) => keep[i]);
    }

    // marching squares on the ink, ink on the left: outer rings and holes wind opposite ways
    function outline(ink, W, H) {
        let next = new Int32Array(2 * W * H).fill(-1), rings = [];
        for (let i = 0; i < W * (H - 1); ++i) {
            let c = [i, i + 1, i + W + 1, i + W].map(k => ink[k] > 0);
            if (c.every(v => v == c[0])) continue;
            let keys = [2 * i, 2 * i + 3, 2 * i + 2 * W, 2 * i + 1], list = [];
            for (let j = 0; j < 4; ++j) if (c[j] != c[(j + 1) % 4]) list.push([keys[j], c[(j + 1) % 4]]);
            let k = list.length, sum = ink[i] + ink[i + 1] + ink[i + W] + ink[i + W + 1], step = sum > 0 ? k - 1 : 1;
            list.forEach(([key, into], m) => into && (next[key] = list[(m + step) % k][0]));
        }
        let at = key => {
            let i = key >> 1, v = ink[i], t = v / (v - ink[i + (key & 1 ? W : 1)]), x = i % W + .5, y = (i / W | 0) + .5;
            key & 1 ? y += t : x += t;
            return [x, y];
        };
        for (let k = 0; k < next.length; ++k) {
            if (next[k] < 0) continue;
            let ring = [];
            for (let key = k, to; (to = next[key]) >= 0; key = to) ring.push(at(key)), next[key] = -1;
            ring = thin(ring, .6);
            if (ring.length > 2) rings.push(ring);
        }
        return rings;
    }

    // Zhang-Suen thinning, then the pixel chains between ends and forks
    function skeleton(ink, W, H) {
        let on = Uint8Array.from(ink, v => +(v > 0)), near = [-W, -W + 1, 1, W + 1, W, W - 1, -1, -W - 1];
        for (let more = true; more;) {
            more = false;
            for (let pass = 0; pass < 2; ++pass) {
                let gone = [];
                for (let i = W + 1; i < W * (H - 1) - 1; ++i) {
                    if (!on[i]) continue;
                    let p = near.map(d => on[i + d]), n = p.reduce((a, b) => a + b);
                    let turns = p.reduce((a, v, j) => a + (!v && p[(j + 1) % 8]), 0);
                    let [p2, p3, p4, p5, p6, p7, p8, p9] = p;
                    if (n < 2 || n > 6 || turns != 1) continue;
                    if (pass ? p2 * p4 * p8 + p2 * p6 * p8 : p2 * p4 * p6 + p4 * p6 * p8) continue;
                    gone.push(i);
                }
                for (let i of gone) on[i] = 0;
                more ||= gone.length > 0;
            }
        }
        let links = i => near.map(d => i + d).filter(j => on[j]);
        let seen = new Uint8Array(W * H), lines = [], walk = (i, j) => {
            let line = [i];
            for (; j != null && !seen[j]; ) {
                seen[j] = 1, line.push(j);
                let more = links(j).filter(k => k != line.at(-2) && !seen[k] && !line.slice(0, -2).includes(k));
                if (links(j).length != 2 && line.length > 1) break;
                j = more[0];
            }
            return line;
        };
        for (let i = W; i < W * (H - 1); ++i) {
            if (!on[i] || links(i).length == 2) continue;
            for (let j of links(i)) if (!seen[j]) lines.push(walk(i, j));
        }
        for (let i = W; i < W * (H - 1); ++i) if (on[i] && !seen[i]) seen[i] = 1, lines.push(walk(i, links(i)[0]));
        // spurs of a fork shorter than a tenth of the em are left out
        return lines
            .filter(l => l.length > 1 && !(l.length < F / 10 && (links(l[0]).length == 1 || links(l.at(-1)).length == 1)))
            .map(l => thin(l.map(i => [i % W + .5, (i / W | 0) + .5]), 1));
    }

    // the glyph in em units of 100: its advance and its lines, from the baseline-left
    function glyph(face, char, strokes) {
        let key = face + '\n' + char + strokes;
        if (glyphs.has(key)) return glyphs.get(key);
        let canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.font = face;
        let m = ctx.measureText(char), left = Math.ceil(m.actualBoundingBoxLeft) + PAD, top = Math.ceil(m.actualBoundingBoxAscent) + PAD;
        let W = left + Math.ceil(Math.max(m.width, m.actualBoundingBoxRight)) + PAD, H = top + Math.ceil(m.actualBoundingBoxDescent) + PAD;
        canvas.width = W, canvas.height = H;
        ctx.font = face;
        ctx.fillText(char, left, top);
        let data = ctx.getImageData(0, 0, W, H).data, ink = new Float32Array(W * H);
        for (let i = 0; i < W * H; ++i) ink[i] = data[4 * i + 3] - 127.5;
        let lines = (strokes ? skeleton : outline)(ink, W, H).map(line => line.map(([x, y]) => [(x - left) * K, (y - top) * K]));
        let entry = { advance: m.width * K, lines };
        glyphs.set(key, entry);
        return entry;
    }

    // `name: value;` declarations, cut at the semicolons outside parentheses
    // and quotes; a name alone is a flag. Null when none names a known
    // option, for a call that is the main value alone.
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

    // `text: …;` then the options, `skeleton` alone, or the text alone
    function read(args, warn) {
        let text = args.join(',').trim(), options = {};
        for (let [name, value] of declarations(text, ['text', ...OPTIONS]) ?? [['text', text]]) {
            if (name == 'skeleton' ? value == null : value != null && (name == 'text' || OPTIONS.includes(name))) options[name] = value ?? '';
            else warn(`unknown option ${name}`);
        }
        options.text = (options.text ?? '').replace(/^(['"])(.*)\1$/s, '$2');
        return options;
    }

    function lay(options, { stream, wait, warn }) {
        let { text, font = 'sans-serif', along, tracking, wave, jitter, spin } = options;
        if (typeof document == 'undefined') return warn('no canvas'), null;
        let [, lead, family] = font.match(/^((?:(?:italic|oblique|normal|bold|bolder|lighter|\d+)\s+)*)(.*)$/s);
        let face = `${lead}${F}px ${family}`;
        if (document.fonts && !document.fonts.check(face, text)) return wait(document.fonts.load(face, text)), null;
        let path, length;
        if (along) {
            path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', along);
            length = path.getTotalLength();
            if (!(length > 0)) return warn('invalid path'), null;
        }
        let [waveSize, period] = (wave || '').split(/\s+/).map(parseFloat);
        waveSize ||= 0, period ||= 100;
        let turn = angle(spin || '0'), shake = parseFloat(jitter) || 0, track = parseFloat(tracking) || 0;
        let rand = stream(), pen = 0, out = [];
        for (let char of new Intl.Segmenter().segment(text)) {
            let g = glyph(face, char.segment, 'skeleton' in options), [a, b, c] = [rand(), rand(), rand()];
            let spot = pen + g.advance / 2, x = spot, y = 0, theta = 0, half = g.advance / 2;
            if (path) {
                let at = Math.min(Math.max(spot, 0), length), p = path.getPointAtLength(at);
                let [p0, p1] = [Math.max(at - .5, 0), Math.min(at + .5, length)].map(s => path.getPointAtLength(s));
                x = p.x, y = p.y, theta = Math.atan2(p1.y - p0.y, p1.x - p0.x);
            }
            let dy = waveSize * Math.sin(2 * Math.PI * spot / period) + (b * 2 - 1) * shake, dx = (a * 2 - 1) * shake;
            let r = (c * 2 - 1) * turn * Math.PI / 180, [sn, cs] = [Math.sin(r), Math.cos(r)], [st, ct] = [Math.sin(theta), Math.cos(theta)];
            for (let line of g.lines) out.push(line.map(([px, py]) => {
                let lx = px - half, ly = py - MID;
                let qx = lx * cs - ly * sn + dx, qy = lx * sn + ly * cs + MID + dy;
                return [x + qx * ct - qy * st, y + qx * st + qy * ct];
            }));
            pen += g.advance + track;
        }
        // a loop, as spreading a long text's points into Math.min overflows the stack
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let line of out) for (let [x, y] of line) {
            x0 = Math.min(x0, x), y0 = Math.min(y0, y), x1 = Math.max(x1, x), y1 = Math.max(y1, y);
        }
        let lines = out.map(line => line.map(([x, y]) => [x - x0, y - y0]));
        return { lines, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0), skeleton: 'skeleton' in options };
    }

    function build(args, api) {
        let options = read(args, api.warn), key = JSON.stringify([options, api.seed]);
        if (!layouts.has(key)) {
            let result = lay(options, api);
            if (!result) return null;
            layouts.size > 16 && layouts.delete(layouts.keys().next().value);
            layouts.set(key, result);
        }
        return layouts.get(key);
    }

    const n = v => +v.toFixed(1);
    CSSDoodle.use('glyph-field', {
        value: (args, api) => {
            let field = build(args, api);
            return field ? field.lines.map(line => 'M' + line.map(p => p.map(n).join(' ')).join('L') + (field.skeleton ? '' : 'Z')).join('') || 'M0 0' : 'M0 0';
        },
    });
    CSSDoodle.use('glyph-field.box', {
        value: (args, api) => {
            let field = build(args, api);
            return field ? `0 0 ${n(field.width)} ${n(field.height)}` : '0 0 1 1';
        },
    });
});
