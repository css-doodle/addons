customElements.whenDefined('css-doodle').then(() => {
    const CSSDoodle = customElements.get('css-doodle');

    const N = 512;
    const images = new Map(), paths = new Map();

    function load(src) {
        let img = new Image(), entry = { img };
        img.crossOrigin = 'anonymous';
        entry.ready = new Promise(resolve => {
            img.onload = () => resolve(entry.ok = true);
            img.onerror = () => resolve(entry.ok = false);
        });
        img.src = src;
        return entry;
    }

    // Douglas–Peucker, keeps the points farther than tol from the chord
    function thin(ring, tol) {
        let keep = new Uint8Array(ring.length), stack = [[0, ring.length - 1]];
        keep[0] = keep[ring.length - 1] = 1;
        while (stack.length) {
            let [a, b] = stack.pop(), [ax, ay] = ring[a], dx = ring[b][0] - ax, dy = ring[b][1] - ay;
            let l = Math.hypot(dx, dy) || 1, far = tol, at = 0;
            for (let i = a + 1; i < b; ++i) {
                let d = Math.abs((ring[i][0] - ax) * dy - (ring[i][1] - ay) * dx) / l;
                if (d > far) far = d, at = i;
            }
            if (at) keep[at] = 1, stack.push([a, at], [at, b]);
        }
        return ring.filter((_, i) => keep[i]);
    }

    // the outline where the ink crosses level, in the image's own pixels:
    // ink is alpha when the image has transparent pixels, darkness when not
    function trace(img, level) {
        let w = img.naturalWidth || N, h = img.naturalHeight || w, s = (N - 2) / Math.max(w, h);
        let canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = canvas.height = N;
        let ox = (N - w * s) / 2, oy = (N - h * s) / 2;
        ctx.drawImage(img, ox, oy, w * s, h * s);
        let data = ctx.getImageData(0, 0, N, N).data, ink = new Float32Array(N * N), opaque = true;
        for (let y = Math.ceil(oy) + 1; y < N - oy - 1; ++y) {
            for (let x = Math.ceil(ox) + 1; x < N - ox - 1; ++x) opaque &&= data[4 * (y * N + x) + 3] == 255;
        }
        for (let i = 0, p = 0; i < N * N; ++i, p += 4) {
            let a = data[p + 3];
            ink[i] = (opaque ? a / 255 * (255 - .2126 * data[p] - .7152 * data[p + 1] - .0722 * data[p + 2]) : a) - 255 * level;
        }
        // marching squares, ink on the left: outer rings and holes wind opposite ways
        let next = new Int32Array(2 * N * N).fill(-1), rings = [];
        for (let i = 0; i < N * (N - 1); ++i) {
            let c = [i, i + 1, i + N + 1, i + N].map(k => ink[k] > 0);
            if (c.every(v => v == c[0])) continue;
            let keys = [2 * i, 2 * i + 3, 2 * i + 2 * N, 2 * i + 1], list = [];
            for (let j = 0; j < 4; ++j) if (c[j] != c[(j + 1) % 4]) list.push([keys[j], c[(j + 1) % 4]]);
            let k = list.length, sum = ink[i] + ink[i + 1] + ink[i + N] + ink[i + N + 1], step = sum > 0 ? k - 1 : 1;
            list.forEach(([key, into], m) => into && (next[key] = list[(m + step) % k][0]));
        }
        let digits = Math.max(0, Math.ceil(Math.log10(10 * N / Math.max(w, h))));
        let at = key => {
            let i = key >> 1, v = ink[i], t = v / (v - ink[i + (key & 1 ? N : 1)]), x = i % N + .5, y = (i / N | 0) + .5;
            key & 1 ? y += t : x += t;
            return [(x - ox) / s, (y - oy) / s];
        };
        for (let k = 0; k < next.length; ++k) {
            if (next[k] < 0) continue;
            let ring = [];
            for (let key = k, to; (to = next[key]) >= 0; key = to) {
                ring.push(at(key));
                next[key] = -1;
            }
            ring = thin(ring, .5 / s);
            // specks under 6 square pixels of the trace are left out
            let area = ring.reduce((sum, [x, y], i) => sum + ring.at(i - 1)[0] * y - x * ring.at(i - 1)[1], 0) * s * s / 2;
            if (Math.abs(area) > 6) rings.push('M' + ring.map(p => p.map(v => +v.toFixed(digits)).join(' ')).join('L') + 'Z');
        }
        return rings.join('') || 'M0 0';
    }

    CSSDoodle.use('trace', {
        // the last argument is the level when it reads as one, so a data
        // URL keeps the commas it was split at
        value: (args, { wait, warn }) => {
            let level = '50%';
            if (args.length > 1 && /^\s*[\d.]+%?\s*$/.test(args.at(-1))) level = args.at(-1).trim(), args = args.slice(0, -1);
            let src = args.join(',').trim().replace(/^url\((.*)\)$/s, '$1').trim().replace(/^(['"])(.*)\1$/s, '$2');
            if (!src) return warn('no image'), 'M0 0';
            let entry = images.get(src) ?? images.set(src, load(src)).get(src);
            if (entry.ok === undefined) return wait(entry.ready), 'M0 0';
            if (!entry.ok) return warn('cannot load image'), 'M0 0';
            let key = level + ' ' + src;
            if (!paths.has(key)) paths.set(key, trace(entry.img, Math.min(Math.max(parseFloat(level) / (level.includes('%') ? 100 : 1), .01), .99) || .5));
            return paths.get(key);
        },
    });
});
