customElements.whenDefined('css-doodle').then(() => {
    const CSSDoodle = customElements.get('css-doodle');

    const SPACES = new Set(['oklab', 'srgb', 'srgb-linear']);
    const POSITION = /^(left|right|top|bottom|center)$|^[-+.\d(]/;

    const glsl = (strings, ...values) => strings.reduce((out, s, i) => out + values[i - 1] + s).trim();
    const num = n => {
        let s = String(+n.toFixed(5));
        return /[.e]/.test(s) ? s : s + '.0';
    };
    // a number, or GLSL when it's math
    const term = v => typeof v == 'number' ? num(v) : v;
    const vec = v => `vec${v.length}(${v.map(term).join(', ')})`;

    function readPoints(text, { color, words, warn, math }) {
        let points = [], point, at = false;
        for (let word of words(text)) {
            if (word == 'at' && point) at = true;
            else if (point && at && POSITION.test(word)) point.at.push(word);
            else if (point && !at && /^[-+.\d(]/.test(word)) point.spread = word;
            else points.push(point = { color: word, at: [] }), at = false;
        }
        return points.map(p => ({
            k: color(p.color),
            xy: p.at.length ? position(p.at, warn, math) : null,
            spread: p.spread?.[0] == '(' ? math(p.spread) ?? 0 : /%$/.test(p.spread) ? parseFloat(p.spread) / 100 : 0,
        }));
    }

    function position(words, warn, math) {
        let x, y, rest = [];
        for (let w of words) {
            if (w == 'left' || w == 'right') x = +(w == 'right');
            else if (w == 'top' || w == 'bottom') y = +(w == 'bottom');
            else if (w == 'center') rest.push(.5);
            else if (/%$/.test(w)) rest.push(parseFloat(w) / 100);
            else if (w[0] == '(') {
                let code = math(w);
                if (!code) return;
                rest.push(code);
            } else {
                warn(`invalid position ${w}`);
                return;
            }
        }
        return [x ?? rest.shift() ?? .5, y ?? rest.shift() ?? .5];
    }

    function output(space) {
        let convert = {
            oklab: 'c = c * mat3(1, .3963377774, .2158037573, 1, -.1055613458, -.0638541728, 1, -.0894841775, -1.291485548);\n'
                + 'c = g_gamma(c * c * c * mat3(4.0767416621, -3.3077115913, .2309699292, -1.2684380046, 2.6097574011, -.3413193965, -.0041960863, -.7034186147, 1.707614701));',
            'srgb-linear': 'c = g_gamma(c);',
        }[space] || '';
        return glsl`
        vec3 g_gamma(vec3 c) {
            c = max(c, 0.0);
            return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - .055, 12.92 * c, step(c, vec3(.0031308)));
        }
        vec4 g_out(vec4 k) {
            vec3 c = k.a > 0.0 ? k.rgb / k.a : vec3(0);
            ${convert}
            return clamp(vec4(c, k.a), 0.0, 1.0);
        }
      `;
    }

    function mesh(rows, api) {
        let grid = rows.map(row => readPoints(row, api));
        if (grid.length == 1) grid.push(grid[0]);
        let C = Math.max(2, ...grid.map(row => row.length)), R = grid.length;
        let P = [], K = [], moving = false;
        grid.forEach((row, j) => {
            for (let i = 0; i < C; i++) {
                let point = row[Math.min(i, row.length - 1)];
                let [x, y] = point.xy || [i / (C - 1), j / (R - 1)];
                moving ||= typeof x != 'number' || typeof y != 'number';
                P.push(vec([x, y]));
                K.push(vec(point.k));
            }
        });
        return glsl`
        const int C = ${C}, R = ${R};
        ${moving ? `vec2 P[${P.length}];` : `const vec2 P[${P.length}] = vec2[](${P.join(', ')});`}
        const vec4 K[${K.length}] = vec4[](${K.join(', ')});
        vec4 g_node(int i, int j, out vec2 p) {
            int i0 = clamp(i, 0, C - 1), j0 = clamp(j, 0, R - 1);
            int i1 = i < 0 ? 1 : i >= C ? C - 2 : i0, j1 = j < 0 ? 1 : j >= R ? R - 2 : j0;
            float s = i == i0 ? 1.0 : 2.0, t = j == j0 ? 1.0 : 2.0;
            vec4 w = vec4(s * t, s * (1.0 - t), (1.0 - s) * t, (1.0 - s) * (1.0 - t));
            p = w.x * P[j0 * C + i0] + w.y * P[j1 * C + i0] + w.z * P[j0 * C + i1] + w.w * P[j1 * C + i1];
            return w.x * K[j0 * C + i0] + w.y * K[j1 * C + i0] + w.z * K[j0 * C + i1] + w.w * K[j1 * C + i1];
        }
        vec4 g_w(float f) {
            return vec4(((-.5 * f + 1.0) * f - .5) * f, (1.5 * f - 2.5) * f * f + 1.0, ((-1.5 * f + 2.0) * f + .5) * f, (.5 * f - .5) * f * f);
        }
        vec4 g_dw(float f) {
            return vec4((-1.5 * f + 2.0) * f - .5, (4.5 * f - 5.0) * f, (-4.5 * f + 4.0) * f + .5, (1.5 * f - 1.0) * f);
        }
        vec4 g_patch(vec2 uv, out vec2 s, out mat2 J) {
            vec2 n = clamp(floor(uv), vec2(0), vec2(C - 2, R - 2)), f = uv - n;
            vec4 wu = g_w(f.x), wv = g_w(f.y), du = g_dw(f.x), dv = g_dw(f.y);
            vec4 c = vec4(0);
            s = vec2(0); J = mat2(0);
            for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
                vec2 p;
                vec4 k = g_node(int(n.x) + x - 1, int(n.y) + y - 1, p);
                s += wu[x] * wv[y] * p;
                J[0] += du[x] * wv[y] * p;
                J[1] += wu[x] * dv[y] * p;
                c += wu[x] * wv[y] * k;
            }
            return c;
        }
        void main() {
            ${moving ? `P = vec2[](${P.join(', ')});\n            ` : ''}vec2 q = vec2(gl_FragCoord.x / u_resolution.x, 1.0 - gl_FragCoord.y / u_resolution.y);
            vec2 top = vec2(C - 1, R - 1), uv = q * top, s;
            mat2 J;
            for (int n = 1; n < 13; n++) {
                float a = min(float(n) / 8.0, 1.0);
                g_patch(uv, s, J);
                s = mix(uv / top, s, a);
                J = (1.0 - a) * mat2(1.0 / top.x, 0, 0, 1.0 / top.y) + a * J;
                if (abs(determinant(J)) > 1e-9) uv = clamp(uv - inverse(J) * (s - q), vec2(0), top);
            }
            FragColor = g_out(g_patch(uv, s, J));
        }
      `;
    }

    function freeform(rows, api) {
        let points = rows.flatMap(row => readPoints(row, api));
        for (let a of points) a.xy ??= [.5, .5];
        let near = a => Math.min(1, ...points.filter(b => b != a).map(b => Math.hypot(a.xy[0] - b.xy[0], a.xy[1] - b.xy[1])));
        let P = `vec2[](${points.map(a => vec(a.xy)).join(', ')})`;
        // with math, each pixel finds the spreads, and how far each point
        // is from the nearest other, as the points move
        let moving = points.some(a => [...a.xy, a.spread].some(v => typeof v != 'number'));
        let spreads = [
            `P = ${P};`,
            `float A[N] = float[](${points.map(a => term(a.spread)).join(', ')});`,
            'for (int i = 0; i < N; i++) {',
            '    float m = 1.0;',
            '    for (int j = 0; j < N; j++) if (j != i) m = min(m, distance(P[i], P[j]));',
            '    S[i] = vec2(A[i], (A[i] != 0.0 ? 0.0 : m * m / 4.0) + 1e-5);',
            '}',
        ];
        return glsl`
        const int N = ${points.length};
        ${moving ? 'vec2 P[N];' : `const vec2 P[N] = ${P};`}
        const vec4 K[N] = vec4[](${points.map(a => vec(a.k)).join(', ')});
        ${moving ? 'vec2 S[N];' : `const vec2 S[N] = vec2[](${points.map(a => vec([a.spread, (a.spread ? 0 : near(a) ** 2 / 4) + 1e-5])).join(', ')});`}
        void main() {
            ${moving ? spreads.join('\n            ') + '\n            ' : ''}vec2 q = vec2(gl_FragCoord.x / u_resolution.x, 1.0 - gl_FragCoord.y / u_resolution.y);
            vec4 c = vec4(0);
            float w = 0.0;
            for (int i = 0; i < N; i++) {
                float d = max(distance(q, P[i]) - S[i].x, 0.0);
                float e = 1.0 / pow(d * d + S[i].y, 1.5);
                c += e * K[i];
                w += e;
            }
            FragColor = g_out(c / w);
        }
      `;
    }

    function draw(kind, code, { color, expr, split, words, warn }) {
        let rows = split(code).filter(Boolean);
        let space = 'oklab';
        if (/^in\s/.test(rows[0])) {
            space = rows.shift().slice(3).trim();
            if (!SPACES.has(space)) warn(`unknown space ${space}`), space = 'oklab';
        }
        if (!rows.length) {
            warn('no colors');
            return 'void main() { FragColor = vec4(0); }';
        }
        let premultiplied = value => {
            let rgba = color(value, space);
            if (!rgba) warn(`unknown color ${value}`);
            let [r, g, b, a] = rgba || [0, 0, 0, 0];
            return [r * a, g * a, b * a, a];
        };
        // math, in parentheses, with t the time in seconds, which moves the
        // gradient; `9%` counts as 9, and it comes back from 0 to 1
        let math = text => {
            let code = expr ? expr(text) : (warn('math needs a newer css-doodle'), null);
            return code && `${code} * 0.01`;
        };
        return output(space) + '\n' + kind(rows, { color: premultiplied, words, warn, math });
    }

    CSSDoodle.use('mesh-gradient', { shader: (code, api) => draw(mesh, code, api) });
    CSSDoodle.use('freeform-gradient', { shader: (code, api) => draw(freeform, code, api) });
});
