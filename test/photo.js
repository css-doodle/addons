import test from 'node:test';
import assert from 'node:assert/strict';
import { load, parseCss, parseGrid, generateCss, golden } from './core.js';

// images by url, decoded at their own size; any other url fails to load
const IMAGES = {};
function image(url, width, height, pixel) {
    let data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
    }
    IMAGES[url] = { data, width, height };
}
globalThis.Image = class {
    set src(url) { this.url = url; }
    decode() {
        let found = IMAGES[this.url];
        if (!found) return Promise.reject(new Error('not found'));
        this.naturalWidth = found.width;
        this.naturalHeight = found.height;
        return Promise.resolve();
    }
};
globalThis.document = {
    createElement: () => {
        let canvas = {
            getContext: () => ({
                drawImage: img => canvas.url = img.url,
                getImageData: () => IMAGES[canvas.url],
            }),
        };
        return canvas;
    },
};

await load('photo');

// cells by "x,y", from rules grouped by selector lists; the first draw
// loads the images, the second reads them
async function draw(code) {
    let run = () => generateCss(parseCss(code), parseGrid('1'), 1, 64);
    let first = run();
    await new Promise(resolve => setTimeout(resolve));
    let { styles, warnings } = run();
    let cells = {};
    for (let [, selectors, body] of styles.cells.matchAll(/([^}{]+) \{([^}]*)\}/g)) {
        for (let [, x, y] of selectors.matchAll(/#c-(\d+)-(\d+)-1/g)) {
            let cell = cells[x + ',' + y] ??= {};
            for (let [, name, value] of body.matchAll(/(--\w+):([^;]*);/g)) cell[name] = value;
        }
    }
    return { first: first.styles.cells, cells, warnings: [...new Set(warnings.map(w => w.message))] };
}

const BLACK = [0, 0, 0, 255], WHITE = [255, 255, 255, 255], RED = [255, 0, 0, 255], GREEN = [0, 255, 0, 255];

test('@photo() covers the grid with the image and averages each cell in linear light', async () => {
    // green edges cropped away; black and white, then red
    image('six.png', 6, 2, x => [GREEN, BLACK, WHITE, RED, RED, GREEN][x]);
    let { first, cells, warnings } = await draw('@grid: 2x1; --c: @photo(six.png); --l: @photo.lum(six.png);');
    assert.match(first, /--c:transparent;\s*--l:1;/);
    assert.deepEqual(warnings, []);
    assert.deepEqual(cells, {
        '1,1': { '--c': 'rgb(188 188 188)', '--l': '0.761' },
        '2,1': { '--c': 'rgb(255 0 0)', '--l': '0.532' },
    });
});

test('@photo() keeps transparency, and @photo.lum() reads it over white', async () => {
    image('glass.png', 3, 1, x => [[0, 0, 255, 128], [0, 0, 0, 0], BLACK][x]);
    let { cells } = await draw('@grid: 3x1; --c: @photo(glass.png); --l: @photo.lum(glass.png);');
    assert.deepEqual(Object.values(cells).map(cell => cell['--c']), ['rgb(0 0 255 / 0.5)', 'rgb(0 0 0 / 0)', 'rgb(0 0 0)']);
    assert.deepEqual(Object.values(cells).map(cell => cell['--l']), ['0.781', '1', '0']);
});

test('@photo() takes the nearest pixel when cells outnumber pixels', async () => {
    image('tiny.png', 2, 2, (x, y) => [[RED, GREEN], [BLACK, WHITE]][y][x]);
    let { cells } = await draw('@grid: 4; --c: @photo(tiny.png);');
    assert.equal(cells['1,1']['--c'], 'rgb(255 0 0)');
    assert.equal(cells['4,1']['--c'], 'rgb(0 255 0)');
    assert.equal(cells['1,4']['--c'], 'rgb(0 0 0)');
    assert.equal(cells['4,4']['--c'], 'rgb(255 255 255)');
});

test('@photo() takes url(), quotes, and data urls with commas', async () => {
    image('data:image/png;base64,AA,BB', 1, 1, () => RED);
    for (let arg of ['data:image/png;base64,AA,BB', 'url("data:image/png;base64,AA,BB")', '"data:image/png;base64,AA,BB"']) {
        let { cells, warnings } = await draw(`@grid: 1; --c: @photo(${arg});`);
        assert.deepEqual(warnings, [], arg);
        assert.equal(cells['1,1']['--c'], 'rgb(255 0 0)', arg);
    }
});

test('@photo() warns about an image it cannot read', async () => {
    let { cells, warnings } = await draw('@grid: 1; --c: @photo(missing.png); --l: @photo.lum(missing.png);');
    assert.deepEqual(warnings, ['image not loaded']);
    assert.deepEqual(cells['1,1'], { '--c': 'transparent', '--l': '1' });
    assert.deepEqual((await draw('@grid: 1; --c: @photo();')).warnings, ['no image']);
});

test('draws what it drew before', async () => {
    image('golden.png', 5, 4, (x, y) => [x * 60, y * 80, 200, 255 - x * 40]);
    let { cells } = await draw('@grid: 3x2; --c: @photo(golden.png); --l: @photo.lum(golden.png);');
    golden('photo', cells);
});
