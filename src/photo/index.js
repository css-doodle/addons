customElements.whenDefined('css-doodle').then(() => {
    const CSSDoodle = customElements.get('css-doodle');

    // the longest side an image is read at
    const MAX = 512;

    const LINEAR = Float64Array.from({ length: 256 }, (_, v) =>
        (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4
    );
    const gamma = v => Math.round(255 * (v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055));

    // url -> { promise }, then { image } or { error } once it settles
    const images = new Map();
    function load(url) {
        let entry = images.get(url);
        if (!entry) {
            let img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = url;
            images.set(url, entry = {});
            entry.promise = img.decode().then(() => {
                let w = img.naturalWidth || MAX, h = img.naturalHeight || MAX, k = Math.min(1, MAX / Math.max(w, h));
                let canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(w * k));
                canvas.height = Math.max(1, Math.round(h * k));
                let context = canvas.getContext('2d', { willReadFrequently: true });
                context.drawImage(img, 0, 0, canvas.width, canvas.height);
                entry.image = context.getImageData(0, 0, canvas.width, canvas.height);
            }).catch(() => entry.error = true);
        }
        return entry;
    }

    // the image over the grid like background-size: cover, averaged per
    // cell in linear light, [r, g, b, a] for each cell
    function sample({ data, width, height }, X, Y) {
        let scale = Math.min(width / X, height / Y);
        let left = (width - X * scale) / 2, top = (height - Y * scale) / 2;
        let span = (from, i, end) => {
            let a = Math.min(end - 1, Math.floor(from + i * scale));
            return [a, Math.min(end, Math.max(a + 1, Math.floor(from + (i + 1) * scale)))];
        };
        let cells = [];
        for (let y = 0; y < Y; y++) {
            let [y0, y1] = span(top, y, height);
            for (let x = 0; x < X; x++) {
                let [x0, x1] = span(left, x, width);
                let r = 0, g = 0, b = 0, a = 0;
                for (let py = y0; py < y1; py++) {
                    for (let px = x0; px < x1; px++) {
                        let at = (py * width + px) * 4, w = data[at + 3] / 255;
                        r += LINEAR[data[at]] * w;
                        g += LINEAR[data[at + 1]] * w;
                        b += LINEAR[data[at + 2]] * w;
                        a += w;
                    }
                }
                cells.push(a ? [r / a, g / a, b / a, a / (x1 - x0) / (y1 - y0)] : [0, 0, 0, 0]);
            }
        }
        return cells;
    }

    // the cell's [r, g, b, a] once the image is in, else null
    function read(args, { x, y, X, Y, state, wait, warn }) {
        let url = args.join(',').trim().replace(/^url\(([^]*)\)$/, '$1').trim().replace(/^(['"])([^]*)\1$/, '$2');
        if (!url) return warn('no image'), null;
        let entry = load(url);
        if (entry.error) return warn('image not loaded'), null;
        if (!entry.image) return wait(entry.promise), null;
        state[url] ??= sample(entry.image, X, Y);
        return state[url][(y - 1) * X + x - 1];
    }

    CSSDoodle.use('photo', {
        value: (args, api) => {
            let cell = read(args, api);
            if (!cell) return 'transparent';
            let [r, g, b, a] = cell, rgb = `${gamma(r)} ${gamma(g)} ${gamma(b)}`;
            return a < .995 ? `rgb(${rgb} / ${+a.toFixed(2)})` : `rgb(${rgb})`;
        },
    });

    // lightness from 0 to 1, as the eye sees it, over white
    CSSDoodle.use('photo.lum', {
        value: (args, api) => {
            let cell = read(args, api);
            if (!cell) return '1';
            let [r, g, b, a] = cell, l = (.2126 * r + .7152 * g + .0722 * b) * a + 1 - a;
            return String(+(l > 216 / 24389 ? 1.16 * Math.cbrt(l) - .16 : l * 24389 / 2700).toFixed(3));
        },
    });
});
