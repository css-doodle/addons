customElements.whenDefined('css-doodle').then(() => {
    const CSSDoodle = customElements.get('css-doodle');

    const glsl = (strings, ...values) => strings.reduce((out, s, i) => out + values[i - 1] + s).trim();
    const num = n => {
        let s = String(+n.toFixed(5));
        return /[.e]/.test(s) ? s : s + '.0';
    };
    const vec = v => `vec${v.length}(${v.map(num).join(', ')})`;
    const linear = v => v > .04045 ? ((v + .055) / 1.055) ** 2.4 : v / 12.92;
    const angle = text => parseFloat(text) * { turn: 360, rad: 180 / Math.PI }[text.replace(/[-\d.]/g, '')] || parseFloat(text) || 0;

    // a number option is a number, or GLSL when it's math; k times it
    const term = (v, k = 1) => typeof v == 'number' ? num(v * k) : k == 1 ? v : `${v} * ${num(k)}`;
    const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?(%|deg|turn|rad)?$/i;

    // Kubelka-Munk on the three channels, in linear light. K/S of a pigment
    // adds up with its concentration, and one more step turns it back into
    // a reflectance, so blue and yellow come out green.
    const mixing = glsl`
        vec3 g_mix(vec3 ks) {
            ks = max(ks, 0.0);
            vec3 c = 1.0 + ks - sqrt(ks * ks + 2.0 * ks);
            c = mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - .055, step(.0031308, c));
            return clamp(c, 0.0, 1.0);
        }
        float g_hash(float n) {
            return fract(sin(n * 12.9898 + mod(u_seed.x, 997.0) * 78.233) * 43758.5453);
        }
    `;

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

    // `colors: …;` then the options, or the colors alone; each comb of a
    // list, or of a repeat, pulls again
    function read(code, { color, expr, split, words, warn }, known) {
        let list = declarations(code, ['colors', ...known]) ?? [['colors', code]];
        let first = '', options = [];
        for (let [name, value] of list) {
            if (value == null || !(name == 'colors' || known.includes(name))) warn(`unknown option ${name}`);
            else if (name == 'colors') first = split(value).join(' ');
            else options.push(...(name == 'comb' && value ? split(value) : [value]).map(v => [name, words(v), v]));
        }
        let colors = words(first).map(value => {
            let rgba = color(value);
            if (!rgba) warn(`unknown color ${value}`);
            return (rgba || [0, 0, 0, 1]).slice(0, 3).map(linear).map(c => Math.max(c, .004));
        });
        let ks = colors.map(c => vec(c.map(v => (1 - v) ** 2 / (2 * v))));
        // a number alone reads as it always has, through `parse`; else it is
        // the math of @pattern, with t the time in seconds, which animates
        // the image, and comes back as GLSL through `wrap`. In the math
        // `9%` counts as 9 and an angle in degrees
        let number = (text, parse, wrap = code => code) => {
            let list = words(text ?? '');
            if (text != null && !(list.length == 1 && NUMBER.test(list[0]))) {
                let code = expr ? expr(text) : (warn('math needs a newer css-doodle'), null);
                if (code) return wrap(code);
            }
            return parse(list[0]);
        };
        return { ks, options, number, get: name => options.findLast(([n]) => n == name)?.[2] };
    }

    // drops, pressed in one after another, then combs pulled through them.
    // Each pixel undoes the combs, then the drops from the last, and
    // takes the color of the drop it lands in.
    function marble(code, api) {
        let { ks, options, number, get } = read(code, api, ['drops', 'size', 'comb', 'flow']);
        if (ks.length < 2) return api.warn('no colors'), 'void main() { FragColor = vec4(0); }';
        let size = number(get('size'), x => (parseFloat(x) || 9) / 100, c => term(c, .01));
        let drops = number(get('drops'), x => Math.max(0, Math.min(400, parseInt(x ?? 30) || 0)), c => `clamp(${c}, 0.0, 400.0)`);
        let flow = number(get('flow'), x => parseFloat(x) || 0);
        let combs = options.filter(([n]) => n == 'comb');
        if (!combs.length) combs.push(['comb', []]);
        let tines = combs.map(([, [spacing = '8%', turn = '90deg']]) => {
            let s = number(spacing, x => parseFloat(x) / 100 || .08, c => `max(${term(c, .01)}, 0.001)`);
            let a = number(turn, x => angle(x) * Math.PI / 180, c => `radians(${c})`);
            return typeof s == 'number' && typeof a == 'number' ? vec([s, Math.cos(a), Math.sin(a), s * 2.5]) : `g_tine(${term(s)}, ${term(a)})`;
        });
        // a moving comb is built for each pixel, and a flowing one slides
        // across its tines; drops that come in over time grow from nothing
        let moving = tines.some(t => t.startsWith('g_')), falling = typeof drops != 'number';
        let tineList = `vec4[](${tines.join(', ')})`;
        let wave = flow === 0 ? '' : ` - u_time * ${term(flow, .1)}`;
        return mixing + glsl`
        const int ${falling ? '' : `N = ${drops}, `}T = ${tines.length}, M = ${ks.length};
        const vec3 KS[M] = vec3[](${ks.join(', ')});
        ${moving ? 'vec4 g_tine(float s, float a) { return vec4(s, cos(a), sin(a), s * 2.5); }' : `const vec4 TINE[T] = ${tineList};`}
        int g_at(vec2 p, float aspect) {
            ${moving ? `vec4 TINE[T] = ${tineList};
            ` : ''}for (int c = T - 1; c >= 0; c--) {
                vec4 t = TINE[c];
                vec2 m = t.yz;
                float d = dot(p, vec2(-m.y, m.x)) / t.x${wave}, j = floor(d + .5), u = 0.0;
                for (int i = -2; i <= 2; i++) {
                    float q = j + float(i);
                    u += (mod(q, 2.0) < 1.0 ? 1.0 : -1.0) * exp(-abs(d - q) * 5.0);
                }
                p -= m * u * t.w;
            }
            ${falling ? `float D = ${drops};
            int N = int(ceil(D));
            ` : ''}for (int k = N - 1; k >= 0; k--) {
                float f = float(k) * 4.0;
                vec2 c = vec2(g_hash(f) * aspect, g_hash(f + 1.0));
                float r = ${term(size)} * (.5 + g_hash(f + 2.0))${falling ? ' * min(D - float(k), 1.0)' : ''};
                vec2 v = p - c;
                float l = dot(v, v);
                if (l < r * r) return M > 1 ? 1 + int(g_hash(f + 3.0) * float(M - 1)) : 0;
                p = c + v * sqrt(1.0 - r * r / l);
            }
            return 0;
        }
        void main() {
            float aspect = u_resolution.x / u_resolution.y;
            vec2 p = gl_FragCoord.xy / u_resolution.y, o[4] = vec2[](vec2(-.375, -.125), vec2(.125, -.375), vec2(.375, .125), vec2(-.125, .375));
            vec3 ks = vec3(0);
            for (int s = 0; s < 4; s++) ks += KS[g_at(p + o[s] / u_resolution.y, aspect)];
            FragColor = vec4(g_mix(ks / 4.0), 1.0);
        }
      `;
    }

    // inks in water: each ink is a cloud of a warped noise, and where
    // clouds meet the pigments mix
    function ink(code, api) {
        let { ks, number, get } = read(code, api, ['scale', 'warp', 'flow']);
        if (ks.length < 2) return api.warn('no colors'), 'void main() { FragColor = vec4(0); }';
        let scale = number(get('scale'), x => parseFloat(x) || 2), warp = number(get('warp'), x => parseFloat(x ?? 2) || 0);
        let flow = number(get('flow'), x => parseFloat(x) || 0);
        // the clouds drift as the noise that curls them moves on
        let drift = k => flow === 0 ? '' : ` + u_time * ${term(flow, k)}`;
        return mixing + glsl`
        const int M = ${ks.length};
        const vec3 KS[M] = vec3[](${ks.join(', ')});
        float g_noise(vec2 p) {
            vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
            float s = mod(u_seed.x, 997.0);
            float a = g_hash(i.x + i.y * 57.0 + s), b = g_hash(i.x + 1.0 + i.y * 57.0 + s);
            float c = g_hash(i.x + (i.y + 1.0) * 57.0 + s), d = g_hash(i.x + 1.0 + (i.y + 1.0) * 57.0 + s);
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }
        float g_fbm(vec2 p) {
            float v = 0.0, a = .5;
            for (int i = 0; i < 5; i++) { v += a * g_noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; }
            return v;
        }
        void main() {
            vec2 p = gl_FragCoord.xy / u_resolution.y * ${term(scale)};
            float w = ${term(warp)};
            vec2 q = vec2(g_fbm(p), g_fbm(p + vec2(5.2, 1.3)));
            vec2 r = vec2(g_fbm(p + w * q + vec2(1.7, 9.2)${drift(.06)}), g_fbm(p + w * q + vec2(8.3, 2.8)${drift(.05)}));
            vec3 ks = vec3(0);
            float total = 0.0;
            for (int k = 1; k < M; k++) {
                float c = smoothstep(.42, .62, g_fbm(p + w * r + float(k) * vec2(3.1, 1.7)));
                ks += c * KS[k];
                total += c;
            }
            float water = max(0.0, 1.0 - total);
            FragColor = vec4(g_mix((ks + water * KS[0]) / max(1.0, total)), 1.0);
        }
      `;
    }

    CSSDoodle.use('marble', { shader: marble });
    CSSDoodle.use('marble.ink', { shader: ink });
});
