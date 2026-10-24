import test from 'node:test';
import assert from 'node:assert/strict';
import { load, parseCss, parseGrid, generateCss, golden } from './core.js';

// a 200x100 image: a ring around (100, 50), outer radius 40, inner 20,
// in alpha when transparent, or dark on white when opaque
const images = {
    'ring.png': (r) => [0, 0, 0, r > 20 && r < 40 ? 255 : 0],
    'ring.jpg': (r) => (r > 20 && r < 40 ? [40, 40, 40] : [250, 250, 250]).concat(255),
    'gray.jpg': () => [100, 100, 100, 255],
};
const loads = [];
globalThis.Image = class {
    set src(src) {
        this.name = src;
        loads.push(src);
        Object.assign(this, src in images ? { naturalWidth: 200, naturalHeight: 100 } : {});
        setTimeout(() => src in images ? this.onload() : this.onerror());
    }
};
globalThis.document = { createElement: () => {
    let drawn;
    return { getContext: () => ({
        drawImage: (img, x, y, w, h) => drawn = { img, x, y, w, h },
        getImageData: () => {
            let n = 512, data = new Uint8ClampedArray(4 * n * n), { img, x, y, w, h } = drawn;
            for (let i = 0; i < n * n; ++i) {
                let px = i % n + .5, py = (i / n | 0) + .5;
                if (px < x || px > x + w || py < y || py > y + h) continue;
                let r = Math.hypot((px - x) / w * 200 - 100, (py - y) / h * 100 - 50);
                data.set(images[img.name](r), 4 * i);
            }
            return { data };
        },
    }) };
} };
await load('trace');

const draw = code => {
    let waits = [], host = { wait: p => waits.push(p) };
    let { styles, warnings } = generateCss(parseCss(code), parseGrid('1'), 1, 64, null, [], '', host);
    return { cells: styles.cells, waits, warnings: warnings.map(w => w.message) };
};
const rings = d => d.split('M').filter(Boolean).map(r => r.replace('Z', '').split('L').map(p => p.split(' ').map(Number)));
const signed = ring => ring.reduce((sum, [x, y], i) => sum + ring.at(i - 1)[0] * y - x * ring.at(i - 1)[1], 0) / 2;

test('@trace() waits for the image, then gives its outline in the image\'s pixels', async () => {
    let first = draw('content: "@trace(ring.png)"');
    assert.match(first.cells, /content:"M0 0"/);
    assert.equal(first.waits.length, 1);
    await first.waits[0];
    let d = draw('content: "@trace(url(\'ring.png\'))"').cells.match(/content:"([^"]*)"/)[1];
    let [outer, inner] = rings(d).sort((a, b) => Math.abs(signed(b)) - Math.abs(signed(a)));
    assert.equal(rings(d).length, 2);
    assert.ok(Math.sign(signed(outer)) == -Math.sign(signed(inner)), 'the hole winds the other way');
    assert.ok(Math.abs(Math.abs(signed(outer)) / (Math.PI * 40 * 40) - 1) < .02);
    assert.ok(outer.every(([x, y]) => Math.abs(Math.hypot(x - 100, y - 50) - 40) < .6));
    assert.ok(inner.every(([x, y]) => Math.abs(Math.hypot(x - 100, y - 50) - 20) < .6));
    assert.equal(loads.filter(src => src == 'ring.png').length, 1);
});

test('@trace() reads darkness in an opaque image, cut at a level', async () => {
    await draw('content: "@trace(ring.jpg) @trace(gray.jpg)"').waits[0];
    await new Promise(resolve => setTimeout(resolve));
    let d = draw('content: "@trace(ring.jpg)"').cells.match(/content:"([^"]*)"/)[1];
    assert.equal(rings(d).length, 2);
    // 61% dark: all ink at the 50% default, none above 61%
    let [box] = rings(draw('content: "@trace(gray.jpg)"').cells.match(/content:"([^"]*)"/)[1]);
    let [x0, x1] = [Math.min(...box.map(p => p[0])), Math.max(...box.map(p => p[0]))];
    assert.ok(Math.abs(x0) < .5 && Math.abs(x1 - 200) < .5);
    assert.match(draw('content: "@trace(gray.jpg, 70%)"').cells, /content:"M0 0"/);
    assert.match(draw('content: "@trace(gray.jpg, .7)"').cells, /content:"M0 0"/);
    assert.notEqual(draw('clip-path: @shape(path: @trace(ring.jpg))').cells.match(/clip-path:([^;]*)/)[1], 'polygon(50% 50%)');
});

test('@trace() warns when the image fails', async () => {
    await draw('content: "@trace(missing.png)"').waits[0];
    let { cells, warnings } = draw('content: "@trace(missing.png)"');
    assert.match(cells, /content:"M0 0"/);
    assert.deepEqual(warnings, ['cannot load image']);
});

test('@trace() takes a data url with its commas, and a level after it', async () => {
    let url = 'data:image/jpeg;base64,AA,BB';
    images[url] = images['gray.jpg'];
    await Promise.all(draw(`content: "@trace(${url})"`).waits);
    assert.equal(rings(draw(`content: "@trace(${url})"`).cells.match(/content:"([^"]*)"/)[1]).length, 1);
    assert.match(draw(`content: "@trace(${url}, 70%)"`).cells, /content:"M0 0"/);
    assert.match(draw(`content: "@trace(url(${url}), .7)"`).cells, /content:"M0 0"/);
    assert.deepEqual(loads.filter(src => src.startsWith('data:')), [url]);
    assert.deepEqual(draw('content: "@trace()"').warnings, ['no image']);
});

test('draws what it drew before', async () => {
    let code = 'content: "@trace(ring.png)"; --b: @trace(ring.jpg, .5);';
    await Promise.all(draw(code).waits);
    golden('trace', { cells: draw(code).cells });
});
