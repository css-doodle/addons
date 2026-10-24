import assert from 'node:assert/strict';
import { load, Func, golden, glslTest as test } from './core.js';

await load('gradient-2d');

const COLORS = { red: [1, 0, 0, 1], blue: [0, 0, 1, 1], white: [1, 1, 1, 1], half: [1, .5, 0, .5], transparent: [0, 0, 0, 0] };
const extra = { getRgbaColor: value => COLORS[value] ?? null };

const run = (name, code) => {
    let warnings = [];
    let fragment = Func[name].shader(code, extra, message => warnings.push(message));
    return { fragment, warnings };
};
const mesh = code => run('mesh-gradient', code);
const freeform = code => run('freeform-gradient', code);
const line = (fragment, start) => fragment.split('\n').map(l => l.trim()).find(l => l.startsWith(start));

test('mesh rows are separated by commas, colors in a row by spaces', () => {
    let { fragment, warnings } = mesh('red blue,white red');
    assert.equal(line(fragment, 'const int C'), 'const int C = 2, R = 2;');
    assert.equal(line(fragment, 'const vec2 P'), 'const vec2 P[4] = vec2[](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));');
    assert.equal(line(fragment, 'const vec4 K'), 'const vec4 K[4] = vec4[](vec4(1.0, 0.0, 0.0, 1.0), vec4(0.0, 0.0, 1.0, 1.0), vec4(1.0, 1.0, 1.0, 1.0), vec4(1.0, 0.0, 0.0, 1.0));');
    assert.deepEqual(warnings, []);
});

test('one mesh row runs left to right, one color per row runs top to bottom', () => {
    let row = mesh('red blue').fragment;
    assert.equal(line(row, 'const int C'), 'const int C = 2, R = 2;');
    assert.equal(line(row, 'const vec4 K'), 'const vec4 K[4] = vec4[](vec4(1.0, 0.0, 0.0, 1.0), vec4(0.0, 0.0, 1.0, 1.0), vec4(1.0, 0.0, 0.0, 1.0), vec4(0.0, 0.0, 1.0, 1.0));');
    let column = mesh('red,blue').fragment;
    assert.equal(line(column, 'const int C'), 'const int C = 2, R = 2;');
    assert.equal(line(column, 'const vec4 K'), 'const vec4 K[4] = vec4[](vec4(1.0, 0.0, 0.0, 1.0), vec4(1.0, 0.0, 0.0, 1.0), vec4(0.0, 0.0, 1.0, 1.0), vec4(0.0, 0.0, 1.0, 1.0));');
});

test('at moves a mesh point, the others stay on the even grid', () => {
    let { fragment } = mesh('red red red,red white at 70% 35% red,red red red');
    assert.match(line(fragment, 'const vec2 P'), /vec2\(0\.0, 0\.5\), vec2\(0\.7, 0\.35\), vec2\(1\.0, 0\.5\)/);
    assert.match(line(mesh('red blue at top 60%,red blue').fragment, 'const vec2 P'), /^const vec2 P\[4\] = vec2\[\]\(vec2\(0\.0, 0\.0\), vec2\(0\.6, 0\.0\),/);
});

test('freeform points take a position and an optional spread', () => {
    let { fragment, warnings } = freeform('red at top left,blue 20% at right,white at 30%');
    assert.equal(line(fragment, 'const vec2 P'), 'const vec2 P[N] = vec2[](vec2(0.0, 0.0), vec2(1.0, 0.5), vec2(0.3, 0.5));');
    assert.equal(line(fragment, 'const vec2 S'), 'const vec2 S[N] = vec2[](vec2(0.0, 0.08501), vec2(0.2, 0.00001), vec2(0.0, 0.08501));');
    assert.deepEqual(warnings, []);
});

test('colors are premultiplied in the interpolation space', () => {
    assert.match(mesh('half transparent').fragment, /vec4\(0\.5, 0\.25, 0\.0, 0\.5\), vec4\(0\.0, 0\.0, 0\.0, 0\.0\)/);
    assert.match(mesh('red blue').fragment, /c = g_gamma\(c \* c \* c \* mat3/);
    assert.doesNotMatch(mesh('in srgb,red blue').fragment, /c = g_gamma/);
    assert.match(mesh('in srgb-linear,red blue').fragment, /c = g_gamma\(c\);/);
});

test('bad input warns and falls back', () => {
    assert.deepEqual(mesh('in hsl,red nope').warnings, ['unknown space hsl', 'unknown color nope']);
    let { fragment, warnings } = mesh('red blue at 20px 10%');
    assert.deepEqual(warnings, ['invalid position 20px']);
    assert.match(line(fragment, 'const vec2 P'), /vec2\(1\.0, 0\.0\)/);
    assert.deepEqual(freeform('in oklab').warnings, ['no colors']);
});

test('draws what it drew before', () => golden('gradient-2d', {
    mesh: mesh('red blue white,white at 40% 60% red blue').fragment,
    srgb: mesh('in srgb,half blue').fragment,
    freeform: freeform('red at top left,blue 20% at right,white at 30%').fragment,
}));
