import test from 'node:test';
import assert from 'node:assert/strict';
import { load, parseCss, parseGrid, generateCss, golden } from './core.js';

// every character is a solid box, 80 px wide and 100 px tall at 160 px to the em
const fonts = [];
let loaded = true;
globalThis.document = {
    fonts: { check: () => loaded, load: async () => { loaded = true; } },
    createElement: () => {
        let drawn;
        return { getContext: () => ({
            set font(face) { fonts.push(face); },
            measureText: () => ({ width: 80, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 80, actualBoundingBoxAscent: 100, actualBoundingBoxDescent: 0 }),
            fillText: (char, x, y) => drawn = char == ' ' ? { x: -1e9, y: 0 } : { x, y },
            getImageData: function () {
                let { width: W, height: H } = this.canvas, data = new Uint8ClampedArray(4 * W * H);
                for (let i = 0; i < W * H; ++i) {
                    let x = i % W, y = i / W | 0;
                    if (x >= drawn.x && x < drawn.x + 80 && y >= drawn.y - 100 && y < drawn.y) data[4 * i + 3] = 255;
                }
                return { data };
            },
        }) };
    },
    createElementNS: () => ({
        d: '',
        setAttribute(name, value) { this.d = value; },
        getTotalLength() { return parseFloat(this.d.match(/[HV](\d+)/)?.[1]) || 0; },
        getPointAtLength(s) { return this.d.includes('V') ? { x: 0, y: s } : { x: s, y: 0 }; },
    }),
};
await load('glyph-field');
// the canvas the fake context draws on is the one it was made for
const make = document.createElement;
document.createElement = () => {
    let canvas = make(), ctx = canvas.getContext();
    ctx.canvas = canvas;
    canvas.getContext = () => ctx;
    return canvas;
};

const draw = (code, seed = 1) => {
    let waits = [];
    let { styles, warnings } = generateCss(parseCss(code), parseGrid('1'), seed, 64, null, [], '', { wait: p => waits.push(p) });
    return { value: styles.cells.match(/content:"([^"]*)"/)?.[1], waits, warnings: warnings.map(w => w.message) };
};
const glyphs = d => d.split('M').filter(Boolean).map(r => r.replace('Z', '').split('L').map(p => p.split(' ').map(Number)));
const span = (points, i) => [Math.min(...points.map(p => p[i])), Math.max(...points.map(p => p[i]))];

test('each letter is a ring of its own, laid on the em of 100', () => {
    let { value, warnings } = draw('content: "@glyph-field(ab)"');
    let [a, b] = glyphs(value);
    assert.deepEqual(warnings, []);
    assert.equal(glyphs(value).length, 2);
    assert.ok(Math.abs(span(a, 0)[1] - 50) < 1.5 && span(b, 0)[0] > 48);
    assert.ok(Math.abs(span([...a, ...b], 1)[1] - 62.5) < 1.5, 'the box is 62.5 high');
    assert.equal(span([...a, ...b], 0)[0], 0);
    assert.match(draw('content: "@glyph-field.box(ab)"').value, /^0 0 (99|100)(\.\d)? 6[23](\.\d)?$/);
});

test('quotes around the text go, spaces only move the pen', () => {
    let a = draw('content: "@glyph-field(\'a b\')"').value;
    assert.equal(glyphs(a).length, 2);
    assert.ok(span(glyphs(a)[1], 0)[0] > 90, 'the space is one advance');
});

test('tracking adds to the advance', () => {
    let [a, b] = glyphs(draw('content: "@glyph-field(text: ab; tracking: 10)"').value);
    assert.ok(span(b, 0)[0] - span(a, 0)[1] > 8);
});

test('the font option keeps its commas and sets the face', () => {
    fonts.length = 0;
    draw('content: "@glyph-field(text: a; font: italic bold Georgia, serif)"');
    assert.ok(fonts.includes('italic bold 160px Georgia,serif'), fonts.join('|'));
});

test('skeleton gives the middle line of a letter, open', () => {
    // a 50 x 62.5 box thins to the vertical line through its middle
    let { value } = draw('content: "@glyph-field(text: a; skeleton)"');
    assert.doesNotMatch(value, /Z/);
    let [line] = glyphs(value);
    assert.equal(glyphs(value).length, 1);
    assert.ok(span(line, 0)[1] - span(line, 0)[0] < 1, 'straight');
    assert.ok(span(line, 1)[1] - span(line, 1)[0] > 10);
});

test('along a path the letters stand on it, turned with it', () => {
    let flat = draw('content: "@glyph-field(ab)"').value;
    assert.equal(draw('content: "@glyph-field(text: ab; along: M0 0H200)"').value, flat);
    let box = draw('content: "@glyph-field.box(text: ab; along: M0 0V200)"').value.split(' ').map(Number);
    assert.ok(Math.abs(box[2] - 62.5) < 1.5 && Math.abs(box[3] - 100) < 1.5, box.join(' '));
    assert.deepEqual(draw('content: "@glyph-field(text: ab; along: nope)"').warnings, ['invalid path']);
});

test('wave, jitter and spin follow the seed and nothing else', () => {
    let code = 'content: "@glyph-field(text: abc; wave: 8 90; jitter: 5; spin: 20)"';
    let one = draw(code, 1).value;
    assert.equal(draw(code, 1).value, one);
    assert.notEqual(draw(code, 2).value, one);
    assert.notEqual(draw(code, 'learn').value, draw(code, 'other').value);
    assert.notEqual(one, draw('content: "@glyph-field(abc)"').value);
    let plain = 'content: "@glyph-field(text: abc; wave: 8 90)"';
    assert.equal(draw(plain, 1).value, draw(plain, 2).value);
});

test('a font that is not in yet waits, and draws nothing meanwhile', async () => {
    loaded = false;
    let first = draw('content: "@glyph-field(text: zz; font: Slowly)"');
    assert.equal(first.value, 'M0 0');
    assert.equal(first.waits.length, 1);
    await first.waits[0];
    assert.equal(glyphs(draw('content: "@glyph-field(text: zz; font: Slowly)"').value).length, 2);
});

test('spin takes deg and turn', () => {
    let spin = angle => draw(`content: "@glyph-field(text: abc; spin: ${angle})"`).value;
    assert.equal(spin('.25turn'), spin('90deg'));
    assert.equal(spin('90deg'), spin('90'));
    assert.notEqual(spin('.25turn'), spin('.25'));
});

test('a long text lays out without running out of stack', () => {
    let { value, warnings } = draw(`content: "@glyph-field.box(${'a'.repeat(60000)})"`);
    assert.deepEqual(warnings, []);
    assert.match(value, /^0 0 \d+(\.\d)? 6[23](\.\d)?$/);
});

test('along reads the length of the path once', () => {
    let make = document.createElementNS, calls = 0;
    document.createElementNS = (...args) => {
        let path = make(...args), length = path.getTotalLength;
        path.getTotalLength = function () { return calls++, length.call(this); };
        return path;
    };
    try {
        draw('content: "@glyph-field(text: abcd; along: M0 0H300)"');
    } finally {
        document.createElementNS = make;
    }
    assert.equal(calls, 1);
});

test('the text alone, or quoted in declarations', () => {
    assert.equal(draw('content: "@glyph-field(abc)"').value, draw('content: "@glyph-field(text: abc)"').value);
    assert.equal(glyphs(draw(`content: "@glyph-field(text: 'a, b; c')"`).value).length, 5);
});

test('declarations warn of unknown options', () => {
    assert.deepEqual(draw('content: "@glyph-field(text: a; size: 3; skeleton: yes; a)"').warnings, ['unknown option size', 'unknown option skeleton', 'unknown option a']);
    assert.equal(glyphs(draw('content: "@glyph-field(a; b, c)"').value).length, 5, 'with no option named, it is all text');
});

test('declarations read inside @svg', () => {
    let d = draw('content: "@glyph-field(text: ab; tracking: 10)"').value;
    let { styles } = generateCss(parseCss('background: @svg(viewBox: 0 0 200 100; path { d: @glyph-field(text: ab; tracking: 10); fill: red })'), parseGrid('1'), 1, 64);
    assert.ok(decodeURIComponent(styles.cells).includes(`d="${d}"`));
});

test('draws what it drew before', () => golden('glyph-field', {
    jitter: draw('content: "@glyph-field(text: abc; wave: 8 90; jitter: 5; spin: 20)"', 'golden').value,
    skeleton: draw('content: "@glyph-field(text: ab; skeleton; tracking: 10)"').value,
    along: draw('content: "@glyph-field(text: ab; along: M0 0V200; jitter: 3)"', 'golden').value,
}));
