/*
 * Carnatic Notation Editor
 * Application logic: swara entry, tala and raga handling, validation,
 * rendering, save / open, PDF export and touch support.
 */

// ---------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------
// $ returns the first element matching a selector, $$ returns all of them as an array
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// Escapes text before it is placed inside HTML so user input cannot break the markup
const esc = s => String(s).replace(/[&<>"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
}[c]));

/* swara vocabulary: 16 names mapped to semitone positions */
const PIT = {
    S: 0,
    R1: 1,
    R2: 2,
    R3: 3,
    G1: 2,
    G2: 3,
    G3: 4,
    M1: 5,
    M2: 6,
    P: 7,
    D1: 8,
    D2: 9,
    D3: 10,
    N1: 9,
    N2: 10,
    N3: 11
};

// ---------------------------------------------------------------
// Data: swaras, ragas and talas
// ---------------------------------------------------------------
// A valid swara token: S, P, R1-R3, G1-G3, M1-M2, D1-D3 or N1-N3
// HOLD holds the marks that stretch the previous note (, = one beat, ; = two beats, - = hold)
const TOK = /^(S|P|[RGND][1-3]|M[12])$/;
const HOLD = ",;-";

// Builds an [arohana, avarohana] pair. If no avarohana is given it is the
// arohana reversed (used by symmetric ragas)
const RG = (a, v) => {
    const t = a.replace(/'/g, '').split(' ');
    return [a, v || ["S'", ...t.slice(1, -1).reverse(), 'S'].join(' ')];
};

// Built-in ragas
const BR = {
    "Mayamalavagowla": RG("S R1 G3 M1 P D1 N3 S'"),
    "Shankarabharanam": RG("S R2 G3 M1 P D2 N3 S'"),
    "Kalyani": RG("S R2 G3 M2 P D2 N3 S'"),
    "Kharaharapriya": RG("S R2 G2 M1 P D2 N2 S'"),
    "Harikambhoji": RG("S R2 G3 M1 P D2 N2 S'"),
    "Hanumatodi": RG("S R1 G2 M1 P D1 N2 S'"),
    "Bhairavi": RG("S R2 G2 M1 P D1 N2 S'"),
    "Keeravani": RG("S R2 G2 M1 P D1 N3 S'"),
    "Charukesi": RG("S R2 G3 M1 P D1 N2 S'"),
    "Hamsadhwani": RG("S R2 G3 P N3 S'"),
    "Mohanam": RG("S R2 G3 P D2 S'"),
    "Kambhoji": RG("S R2 G3 M1 P D2 S'", "S' N2 D2 P M1 G3 R2 S"),
    "Begada": RG("S G3 R2 G3 M1 P D2 N3 S'", "S' N3 D2 P M1 G3 R2 S"),
    "Abhogi": RG("S R2 G2 M1 D2 S'"),
    "Madhyamavati": RG("S R2 M1 P N2 S'"),
    "Arabhi": RG("S R2 M1 P D2 S'", "S' N3 D2 P M1 G3 R2 S"),
    "Sri": RG("S R2 M1 P N2 S'", "S' N2 P M1 R2 G2 R2 S"),
    "Hindolam": RG("S G2 M1 D1 N2 S'")
};

// Built-in talas written as anga strings (I = laghu, O = drutam, U = anudrutam, C = plain group)
const BT = {
    "Adi (Chatusra Triputa)": "I4 O O",
    "Rupakam": "O I2",
    "Misra Chapu": "C3 C2 C2",
    "Khanda Chapu": "C2 C3",
    "Tisra Triputa": "I3 O O",
    "Jhampa": "I7 U O",
    "Ata": "I5 I5 O O",
    "Eka": "I4",
    "Dhruva": "I4 O I4 I4",
    "Matya": "I4 O I4"
};

// Custom talas and ragas created by the user, kept in localStorage
let CT = {};
let CR = {};
try {
    CT = JSON.parse(localStorage.getItem('cne:talas') || '{}');
    CR = JSON.parse(localStorage.getItem('cne:ragas') || '{}');
} catch (e) {
    // storage is not available (private mode or blocked), carry on without it
}

// Built-in and custom talas / ragas merged into one list
const TALAS = () => ({ ...BT, ...CT });
const RAGAS = () => ({ ...BR, ...CR });

// An empty avartana row. s = swaras, l = sahitya (lyrics), o = octave dots, f = cell formatting
const newRow = () => ({
    s: [],
    l: [],
    o: [],
    f: []
});

// A fresh, empty composition
const blank = () => ({
    title: '',
    raga: '',
    tala: 'Adi (Chatusra Triputa)',
    composer: '',
    k: 1,
    secs: [{ n: 'Pallavi', rows: [newRow()] }]
});

// ---------------------------------------------------------------
// Application state
// ---------------------------------------------------------------
// S is the composition being edited, U and R are the undo and redo stacks
let ext = false;
let kb = false;
let pdfGrid = true;
let S = blank();
let U = [];
let R = [];
let gate = 0;
let tm = 0;
let vt = 0;
let curSec = 0;
let lastM = [];
let anc = 0;
let cur = 0;
let lastS = null;

/* Algorithm 1: tala grammar parser */
function parseTala(str) {
    const angas = [];
    let total = 0;
    const tk = (str || '').trim().split(/\s+/).filter(Boolean);
    if (!tk.length) {
        return { err: 'Enter at least one anga.' };
    }
    for (const t of tk) {
        const m = /^(I|O|U|C)(\d*)$/i.exec(t);
        if (!m) {
            return { err: `“${t}” is not an anga. Use I, I3, O, U or C5.` };
        }
        const c = m[1].toUpperCase();
        if ((c == 'O' || c == 'U') && m[2]) {
            return { err: `${c} has a fixed length, so remove the number.` };
        }
        const n = c == 'O' ? 2 : c == 'U' ? 1 : (+m[2] || (c == 'I' ? 4 : 0));
        if (n < 1 || n > 16) {
            return { err: `${t}: length must be between 1 and 16 beats.` };
        }
        angas.push({ sym: c == 'C' ? '~' : c, n });
        total += n;
    }
    if (total > 32) {
        return { err: 'A tala can have at most 32 beats.' };
    }
    return { angas, total };
}

// Returns the parsed tala, falling back to 8 beats if the current tala is invalid
const talaInfo = () => {
    const t = parseTala(TALAS()[S.tala]);
    return t.err ? { angas: [{ sym: 'I', n: 8 }], total: 8 } : t;
};

// Number of cells in one avartana row (beats x notes per beat)
const ncell = () => talaInfo().total * S.k;

// Makes sure every array in a row has exactly n entries
function fit(r, n) {
    for (const a of ['s', 'l', 'o', 'f']) {
        r[a] = r[a] || [];
        r[a].length = n;
        for (let i = 0; i < n; i++) {
            if (r[a][i] == null) {
                r[a][i] = a == 'o' ? 0 : a == 'f' ? {} : '';
            }
        }
    }
}

// Collects the formatting of one cell (lines, kampita, dots, inline style)
const fx = (r, i) => {
    const f = r.f[i] || {};
    return {
        ub: f.ub || 0,
        ua: f.ua || 0,
        k: f.k || 0,
        o: r.o[i] || 0,
        st: (f.b ? 'font-weight:800;' : '') + (f.c ? 'color:' + f.c + ';' : '') + (f.z ? 'font-size:' + (19 + 3 * f.z) + 'px;' : '')
    };
};

// ---------------------------------------------------------------
// Rendering the sheet
// ---------------------------------------------------------------
// Markup for the octave dots and kampita mark inside each cell
const DOTS = '<i class="dt t">•</i><i class="dt b">•</i><i class="kp">~</i>';

// Rebuilds the whole sheet from the composition data
function render() {
    const t = talaInfo();
    const k = S.k;
    const n = t.total * k;
    setCW();
    head();
    let h = '';
    S.secs.forEach((sc, si) => {
        h += `<section class="sec" data-si="${si}"><div class="sh"><input class="sn" value="${esc(sc.n)}" aria-label="Section name"><span class="ctl"><button data-act="addrow">+ Row</button><button data-act="delsec">Delete section</button></span></div>`;
        sc.rows.forEach((r, ri) => {
            fit(r, n);
            h += `<div class="row" data-ri="${ri}">`;
            let i = 0;
            t.angas.forEach(a => {
                h += `<div class="ang"><div class="as">${a.sym}</div><div class="cl">`;
                for (let b = 0; b < a.n * k; b++, i++) {
                    h += `<div class="c${b == 0 ? ' ab' : b % k ? ' sb' : ''}" data-i="${i}"><div class="w">${DOTS}<input class="s" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" aria-label="Swara ${i + 1}" value="${esc(r.s[i])}"></div><input class="l" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Sahitya ${i + 1}" value="${esc(r.l[i])}"></div>`;
                }
                h += '</div></div>';
            });
            h += `<div class="end">‖</div><span class="ctl"><button data-act="delrow" title="Delete this row">×</button></span></div>`;
        });
        h += '</section>';
    });
    $('#secs').innerHTML = h;
    $$('.s').forEach(paint);
    if (typeof setIM == 'function') {
        setIM();
    }
    anc = cur = Math.min(cur, Math.max(0, $$('.s').length - 1));
    sel();
    validate();
}

// Applies the stored formatting of a cell to its input box
function paint(inp) {
    const r = rowOf(inp);
    const i = idxOf(inp);
    const x = fx(r, i);
    const w = inp.parentNode;
    w.dataset.o = x.o;
    w.dataset.k = x.k;
    inp.dataset.ub = x.ub;
    inp.dataset.ua = x.ua;
    inp.style.cssText = x.st;
}

// Picks a cell width so a full avartana fits on screen
function setCW() {
    const t = talaInfo();
    const k = S.k;
    const sh = $('#sheet');
    const pad = parseFloat(getComputedStyle(sh).paddingLeft) || 0;
    const av = sh.clientWidth - 2 * pad - 30;
    const mx = Math.max(...t.angas.map(a => a.n)) * k;
    const base = k <= 2 ? 52 : k == 3 ? 46 : 42;
    const c1 = Math.floor(av / (t.total * k));
    document.documentElement.style.setProperty('--cw', (c1 >= 34 ? Math.min(base, c1) : Math.max(30, Math.min(base, Math.floor(av / mx)))) + 'px');
}

// Updates the title, raga and tala details above the sheet
function head() {
    const rg = RAGAS()[S.raga];
    $('#docname').textContent = S.title || 'Untitled composition';
    $('#shTitle').textContent = S.title || 'Untitled composition';
    $('#shMeta').innerHTML = `<span>Raga: <b>${esc(S.raga || 'not chosen')}</b></span><span>Tala: <b>${esc(S.tala)}</b></span>${S.composer ? `<span>Composer: <b>${esc(S.composer)}</b></span>` : ''}`;
    $('#shRaga').innerHTML = rg ? `Arohana: ${esc(rg[0])}<br>Avarohana: ${esc(rg[1])}` : '';
}

// Fills the raga and tala drop-downs
function fill() {
    $('#fRaga').innerHTML = '<option value="">Select raga</option>' + Object.keys(RAGAS()).map(r => `<option>${esc(r)}</option>`).join('');
    $('#fTala').innerHTML = Object.keys(TALAS()).map(r => `<option>${esc(r)}</option>`).join('');
    setMeta();
}

// Copies the composition details into the toolbar fields
function setMeta() {
    $('#fTitle').value = S.title;
    $('#fComp').value = S.composer;
    $('#fRaga').value = S.raga;
    $('#fTala').value = S.tala;
    $('#fK').value = S.k;
}

// Shows a message in the status bar
function say(m, c) {
    const e = $('#st');
    e.textContent = m;
    e.style.color = c || '';
}

/* Algorithm 2: rule-based validation */
function validate() {
    const M = [];
    const rg = RAGAS()[S.raga];
    const tl = parseTala(TALAS()[S.tala]);
    let names = null;
    let pits = null;
    if (rg) {
        names = new Set((rg[0] + ' ' + rg[1]).replace(/'/g, '').split(/\s+/));
        pits = new Set([...names].map(x => PIT[x]));
    }
    if (!S.title.trim()) {
        M.push(['w', 'Add a composition title.']);
    }
    if (!rg) {
        M.push(['e', 'Choose a raga, or create a custom raga from the Tools menu.']);
    }
    if (tl.err) {
        M.push(['e', 'Tala: ' + tl.err]);
    }
    if (!S.secs.some(sc => sc.rows.some(r => r.s.some(v => v)))) {
        M.push(['e', 'The composition is empty. Enter some notes.']);
    }
    $$('.c').forEach(c => c.classList.remove('warn', 'bad'));
    S.secs.forEach((sc, si) => sc.rows.forEach((r, ri) => {
        let f = 0;
        const at = `${sc.n || 'Section'}, row ${ri + 1}`;
        r.s.forEach((v, i) => {
            const cell = $(`.sec[data-si="${si}"] .row[data-ri="${ri}"] .c[data-i="${i}"]`);
            const bad = m => {
                M.push(['e', `${at}, cell ${i + 1}: ${m}`, si, ri, i]);
                cell && cell.classList.add('bad');
            };
            const wn = m => {
                M.push(['w', `${at}, cell ${i + 1}: ${m}`, si, ri, i]);
                cell && cell.classList.add('warn');
            };
            if (!v) {
                return;
            }
            f++;
            const sw = TOK.test(v);
            if (!sw && !HOLD.includes(v)) {
                bad(`“${v}” is not a valid swara`);
            } else if (!sw && r.o[i]) {
                bad('a dot cannot sit on a hold mark');
            } else if (sw && names && !names.has(v)) {
                const ex = [...names].find(x => PIT[x] == PIT[v]);
                wn(ex ? `${v} has the same pitch as ${ex}; ${S.raga} is written with ${ex}` : `${v} is not in ${S.raga}`);
            }
        });
        if (f && f < r.s.length) {
            M.push(['w', `${at}: avartana incomplete, ${f} of ${r.s.length} cells filled`, si, ri, 0]);
        }
    }));
    lastM = M;
    const ne = M.filter(m => m[0] == 'e').length;
    const nw = M.length - ne;
    $('#stats').textContent = `${S.raga || 'No raga'}  |  ${S.tala}  |  ${S.secs.reduce((q, x) => q + x.rows.length, 0)} avartanas  |  ${ne} errors, ${nw} to check`;
    $('#msgs').innerHTML = `<h3>${M.length ? `${ne} error${ne == 1 ? '' : 's'}, ${nw} to check` : '<span class="ok">No problems found. The composition is valid.</span>'}</h3>` +
        M.slice(0, 40).map((m, j) => `<button class="${m[0] == 'e' ? 'e' : 'w2'}" data-m="${j}">${esc(m[1])}</button>`).join('') + (M.length > 40 ? `<div class="hint">…and ${M.length - 40} more</div>` : '');
    return M;
}

/* undo and autosave */
// Autosave is switched off (kept so the existing calls still work)
const draft = () => {
};

// Saves a snapshot for undo (keeps the last 100)
function pushU() {
    U.push(JSON.stringify(S));
    if (U.length > 100) {
        U.shift();
    }
    R = [];
}

// Called on every edit: groups quick typing into one undo step and re-validates shortly after
function edit() {
    if (!gate) {
        pushU();
    }
    clearTimeout(gate);
    gate = setTimeout(() => gate = 0, 800);
    clearTimeout(vt);
    vt = setTimeout(() => {
        validate();
        draft();
    }, 300);
}

// Runs a structural change (add row, delete section...) with undo support
function struct(f) {
    pushU();
    f();
    render();
    draft();
}

// Moves a snapshot between the undo and redo stacks
function restore(a, b) {
    if (!a.length) {
        return say('Nothing to ' + (a === U ? 'undo' : 'redo'));
    }
    b.push(JSON.stringify(S));
    S = JSON.parse(a.pop());
    setMeta();
    render();
}

/* Algorithm 3: token-based entry with auto-advancing cursor */
// Finds the row data and cell index that belong to an input box
const rowOf = el => S.secs[+el.closest('.sec').dataset.si].rows[+el.closest('.row').dataset.ri];
const idxOf = el => +el.closest('.c').dataset.i;

// Moves focus by d cells; going past the last cell adds a new row
function move(inp, d) {
    const cls = inp.classList.contains('s') ? '.s' : '.l';
    const L = $$(cls);
    const j = L.indexOf(inp) + d;
    if (j >= L.length) {
        pushU();
        S.secs[S.secs.length - 1].rows.push(newRow());
        render();
        const N = $$(cls);
        N[L.length] && N[L.length].focus();
        return;
    }
    if (j >= 0) {
        L[j].focus();
        L[j].select();
    }
}

// Toggles an octave dot (dir 1 = above, -1 = below) on a cell
function mark(inp, dir) {
    const r = rowOf(inp);
    const i = idxOf(inp);
    r.o[i] = r.o[i] == dir ? 0 : dir;
    paint(inp);
}

// Stores a finished swara in a cell
function commit(inp, v) {
    const r = rowOf(inp);
    const i = idxOf(inp);
    r.s[i] = v;
    inp.value = v;
    if (!TOK.test(v)) {
        r.o[i] = 0;
    }
    paint(inp);
}

// Handles typing in a swara cell: one key for S and P, letter + number for the rest
function onS(inp) {
    const r = rowOf(inp);
    const i = idxOf(inp);
    const v = inp.value;
    clearTimeout(tm);
    if (v === '') {
        r.s[i] = '';
        return;
    }
    let c = v.slice(-1);
    const up = c.toUpperCase();
    if (c == "'" || c == '.') {
        const dir = c == "'" ? 1 : -1;
        if (TOK.test(r.s[i])) {
            inp.value = r.s[i];
            mark(inp, dir);
            move(inp, 1);
        } else if (!v.slice(0, -1)) {
            inp.value = '';
            const L = $$('.s');
            const p = L[L.indexOf(inp) - 1];
            if (p && TOK.test(rowOf(p).s[idxOf(p)])) {
                mark(p, dir);
            }
        } else {
            inp.value = r.s[i];
        }
        return;
    }
    if (HOLD.includes(c)) {
        commit(inp, c);
        move(inp, 1);
        return;
    }
    if (up == 'S' || up == 'P') {
        commit(inp, up);
        tm = setTimeout(() => move(inp, 1), 400);
        return;
    }
    if ('RGMDN'.includes(up) && /[A-Za-z]/.test(c)) {
        r.s[i] = '';
        inp.value = up;
        paint(inp);
        say(`${up}: now type ${up == 'M' ? '1 or 2' : '1, 2 or 3'}`);
        return;
    }
    if (/[1-3]/.test(c)) {
        const p = v.slice(-2, -1).toUpperCase();
        const t = p + c;
        if (TOK.test(t) && v.length == 2) {
            commit(inp, t);
            tm = setTimeout(() => move(inp, 1), 400);
            say('');
            return;
        }
    }
    inp.value = r.s[i] || '';
    say(`“${c}” is not valid here. Use S, P, R1–R3, G1–G3, M1–M2, D1–D3, N1–N3, or , ; - to hold.`, '#ffb4a8');
}

// ---------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------
$('#secs').addEventListener('input', e => {
    const t = e.target;
    edit();
    if (t.classList.contains('s')) {
        onS(t);
    } else if (t.classList.contains('l')) {
        const v = t.value;
        if (/\s$/.test(v)) {
            t.value = v.trim();
            rowOf(t).l[idxOf(t)] = t.value;
            move(t, 1);
        } else {
            rowOf(t).l[idxOf(t)] = v;
        }
    } else if (t.classList.contains('sn')) {
        S.secs[+t.closest('.sec').dataset.si].n = t.value;
    }
});
$('#secs').addEventListener('focusout', e => {
    const t = e.target;
    if (t.classList.contains('s') && t.isConnected) {
        const v = rowOf(t).s[idxOf(t)];
        if (t.value !== v) {
            t.value = v;
        }
    }
});
$('#secs').addEventListener('keydown', e => {
    const t = e.target;
    if (!t.matches('.s,.l')) {
        return;
    }
    const isS = t.classList.contains('s');
    const k = e.key;
    const n = ncell();
    const L = $$(isS ? '.s' : '.l');
    const ix = L.indexOf(t);
    const go = j => {
        if (L[j]) {
            e.preventDefault();
            L[j].focus();
            L[j].select();
        }
    };
    if (isS && e.shiftKey && (k == 'ArrowRight' || k == 'ArrowLeft')) {
        e.preventDefault();
        cur = Math.max(0, Math.min(L.length - 1, cur + (k == 'ArrowRight' ? 1 : -1)));
        sel();
        return;
    }
    if (k == ' ') {
        e.preventDefault();
        clearTimeout(tm);
        move(t, 1);
    } else if (k == 'Enter') {
        e.preventDefault();
        move(t, n);
    } else if (k == 'ArrowRight' && (isS || t.selectionStart == t.value.length)) {
        go(ix + 1);
    } else if (k == 'ArrowLeft' && (isS || t.selectionStart == 0)) {
        go(ix - 1);
    } else if (k == 'ArrowDown') {
        e.preventDefault();
        isS ? t.closest('.c').querySelector('.l').focus() : go(ix + n);
    } else if (k == 'ArrowUp') {
        e.preventDefault();
        isS ? go(ix - n) : t.closest('.c').querySelector('.s').focus();
    } else if (k == 'Backspace' && !t.value) {
        e.preventDefault();
        clearTimeout(tm);
        const p = L[ix - 1];
        if (p) {
            const r = rowOf(p);
            const i = idxOf(p);
            edit();
            if (isS) {
                r.s[i] = '';
                r.o[i] = 0;
                r.f[i] = {};
                paint(p);
            } else {
                r.l[i] = '';
            }
            p.value = '';
            p.focus();
        }
    }
});
$('#secs').addEventListener('focusin', e => {
    const t = e.target;
    const s = t.closest('.sec');
    if (s) {
        curSec = +s.dataset.si;
    }
    if (t.classList.contains('s')) {
        lastS = t;
        const ix = $$('.s').indexOf(t);
        if (ext) {
            cur = ix;
        } else {
            anc = cur = ix;
        }
        sel();
    }
});
$('#secs').addEventListener('mousedown', e => {
    if (e.shiftKey && e.target.classList.contains('s')) {
        e.preventDefault();
        cur = $$('.s').indexOf(e.target);
        sel();
    }
});
$('#secs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) {
        act(b.dataset.act, e);
    }
});
$('#msgs').addEventListener('click', e => {
    const b = e.target.closest('[data-m]');
    if (!b) {
        return;
    }
    const m = lastM[+b.dataset.m];
    if (m[2] == null) {
        return;
    }
    const c = $(`.sec[data-si="${m[2]}"] .row[data-ri="${m[3]}"] .c[data-i="${m[4]}"] .s`);
    c && (c.scrollIntoView({ block: 'center' }), c.focus());
});
$('#fTitle').oninput = e => {
    edit();
    S.title = e.target.value;
    head();
};
$('#fComp').oninput = e => {
    edit();
    S.composer = e.target.value;
    head();
};
$('#fRaga').onchange = e => {
    pushU();
    S.raga = e.target.value;
    head();
    validate();
};
$('#fTala').onchange = e => struct(() => S.tala = e.target.value);
$('#fK').onchange = e => struct(() => S.k = +e.target.value);
$('#insMenu').onclick = e => {
    const b = e.target.closest('[data-sec]');
    if (b) {
        struct(() => S.secs.push({ n: b.dataset.sec, rows: [newRow()] }));
        document.activeElement.blur();
    }
};
document.querySelector('.bar').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b) {
        act(b.dataset.act, e);
        document.activeElement.blur();
    }
});
$('.tb .gout').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    b && act(b.dataset.act, e);
});

/* formatting: applies to the selected cell range (click, then Shift+click or Shift+arrows) */
function sel() {
    $$('.c.sel').forEach(c => c.classList.remove('sel'));
    const L = $$('.s');
    const a = Math.min(anc, cur);
    const b = Math.max(anc, cur);
    if (a != b) {
        for (let j = a; j <= b; j++) {
            L[j] && L[j].closest('.c').classList.add('sel');
        }
    }
    $('#selinfo').textContent = a != b ? `${b - a + 1} cells selected` : 'Selection';
    tbState();
}

// Highlights the toolbar buttons that match the selected cells
function tbState() {
    const el = selCells()[0];
    $$('#fb [data-f]').forEach(b => {
        b.classList.remove('on');
        if (!el) {
            return;
        }
        const [p, v] = b.dataset.f.split(':');
        if (p == 'x' || p == 'z' || p == 'c') {
            return;
        }
        const r = rowOf(el);
        const i = idxOf(el);
        const cur = p == 'o' ? r.o[i] : (r.f[i][p] || 0);
        if (cur === +v) {
            b.classList.add('on');
        }
    });
}

// Returns the inputs of all selected cells
const selCells = () => {
    const L = $$('.s');
    const a = Math.min(anc, cur);
    const b = Math.max(anc, cur);
    return L.slice(a, b + 1);
};

// Applies a format (bold, size, lines, dots, kampita...) to the selected cells
function fmt(p, v) {
    const L = selCells();
    if (!L.length) {
        return say('Click a cell first.');
    }
    pushU();
    const val = el => {
        const r = rowOf(el);
        const i = idxOf(el);
        return p == 'o' ? r.o[i] : (r.f[i][p] || 0);
    };
    const set = (el, x) => {
        const r = rowOf(el);
        const i = idxOf(el);
        if (p == 'o') {
            r.o[i] = x;
        } else if (x) {
            r.f[i][p] = x;
        } else {
            delete r.f[i][p];
        }
    };
    if (p == 'z') {
        L.forEach(el => set(el, Math.max(-2, Math.min(3, val(el) + v))));
    } else if (p == 'x') {
        L.forEach(el => {
            const r = rowOf(el);
            const i = idxOf(el);
            r.f[i] = {};
            r.o[i] = 0;
        });
    } else if (p == 'c' && !v) {
        L.forEach(el => set(el, 0));
    } else {
        const all = L.every(el => val(el) === v);
        L.forEach(el => set(el, all ? 0 : v));
    }
    L.forEach(paint);
    validate();
    draft();
    tbState();
}
$('#fb').addEventListener('mousedown', e => {
    if (e.target.closest('button')) {
        e.preventDefault();
    }
});
$('#fb').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) {
        return;
    }
    if (b.dataset.x) {
        ext = !ext;
        b.classList.toggle('on', ext);
        say(ext ? 'Range on: tap the last cell of the range.' : 'Range off.');
        return;
    }
    if (b.dataset.f) {
        const [p, v] = b.dataset.f.split(':');
        fmt(p, p == 'c' ? v : +v);
    } else if (b.dataset.t && lastS && lastS.isConnected) {
        pushU();
        commit(lastS, b.dataset.t);
        validate();
        draft();
        move(lastS, 1);
    }
});

/* modal */
// ---------------------------------------------------------------
// Dialogs, PDF export and menu actions
// ---------------------------------------------------------------
// Opens the pop-up dialog with a title, HTML body and a row of buttons
function modal(t, h, btns) {
    $('#mt').textContent = t;
    $('#mb').innerHTML = h;
    $('#mb').onclick = $('#mb').oninput = null;
    $('#mf').innerHTML = '';
    btns.forEach(([x, f, p]) => {
        const b = document.createElement('button');
        b.textContent = x;
        if (p) {
            b.className = 'pri';
        }
        b.onclick = f;
        $('#mf').append(b);
    });
    $('#modal').hidden = false;
    const i = $('#mb input');
    i && i.focus();
}

// Closes the dialog
const closeM = () => $('#modal').hidden = true;

/* Algorithm 4: PDF export. A static print view is built from the data, rasterised, and cut into A4 pages at row boundaries */
// Builds the print / PDF view from the data (not from the input boxes)
function buildPV() {
    if (validate().length) {
        $('#pv').innerHTML = '<p style="padding:40px;font:16px system-ui,sans-serif">This composition has validation problems and cannot be printed. Fix them in the editor first.</p>';
        return;
    }
    const t = talaInfo();
    const k = S.k;
    const rg = RAGAS()[S.raga];
    const n = ncell();
    let h = `<div class="blk"><h1>${esc(S.title || 'Untitled composition')}</h1><div class="pm"><span>Raga: <b>${esc(S.raga || '-')}</b></span><span>Tala: <b>${esc(S.tala)}</b></span>${S.composer ? `<span>Composer: <b>${esc(S.composer)}</b></span>` : ''}</div>${rg ? `<div class="pa2">Arohana: ${esc(rg[0])}<br>Avarohana: ${esc(rg[1])}</div>` : ''}</div>`;
    S.secs.forEach(sc => {
        h += `<div class="blk ph">${esc(sc.n)}</div>`;
        sc.rows.forEach(r => {
            fit(r, n);
            h += '<div class="row blk">';
            let i = 0;
            t.angas.forEach(a => {
                h += `<div class="ang"><div class="as">${a.sym}</div><div class="cl">`;
                for (let b = 0; b < a.n * k; b++, i++) {
                    const x = fx(r, i);
                    h += `<div class="c${b == 0 ? ' ab' : b % k ? ' sb' : ''}"><div class="w" data-o="${x.o}" data-k="${x.k}">${DOTS}<span class="sv" data-ub="${x.ub}" data-ua="${x.ua}" style="${x.st}">${esc(r.s[i]) || '&nbsp;'}</span></div><span class="lv">${esc(r.l[i]) || '&nbsp;'}</span></div>`;
                }
                h += '</div></div>';
            });
            h += '<div class="end">‖</div></div>';
        });
    });
    $('#pv').innerHTML = h;
    $('#pv').classList.toggle('ng', !pdfGrid);
}

// Downloads the composition directly as an A4 PDF
async function dlPDF() {
    if (validate().length) {
        return act('pdf');
    }
    if (!window.html2canvas || !window.jspdf) {
        return say('The PDF libraries did not load. Check your internet connection, or use Print instead.', '#ffb4a8');
    }
    say('Creating PDF…');
    buildPV();
    const pv = $('#pv');
    pv.classList.add('cap');
    try {
        await new Promise(r => setTimeout(r, 80));
        const W = pv.offsetWidth;
        const H = Math.floor(W * 269 / 182);
        const top0 = pv.getBoundingClientRect().top;
        const total = pv.offsetHeight;
        const B = $$('#pv .blk').map(b => {
            const q = b.getBoundingClientRect();
            return [q.top - top0, q.bottom - top0, b.classList.contains('ph')];
        });
        const pages = [];
        let st = 0;
        B.forEach((b, j) => {
            if (b[1] - st > H && b[0] > st) {
                let cut = b[0];
                if (j && B[j - 1][2] && B[j - 1][0] > st) {
                    cut = B[j - 1][0];
                }
                pages.push([st, cut]);
                st = cut;
            }
        });
        pages.push([st, total]);
        const cv = await html2canvas(pv, { scale: 2, backgroundColor: '#fff' });
        const sc = cv.width / W;
        const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });
        pages.forEach((p, pi) => {
            const h = Math.max(1, Math.round((p[1] - p[0]) * sc));
            const c = document.createElement('canvas');
            c.width = cv.width;
            c.height = h;
            const x = c.getContext('2d');
            x.fillStyle = '#fff';
            x.fillRect(0, 0, c.width, h);
            x.drawImage(cv, 0, Math.round(p[0] * sc), cv.width, h, 0, 0, cv.width, h);
            if (pi) {
                doc.addPage();
            }
            doc.addImage(c.toDataURL('image/jpeg', .95), 'JPEG', 14, 14, 182, 182 * h / cv.width);
        });
        const name = (S.title.trim() || 'carnatic-notation').replace(/[^\w\- ]+/g, '') + '.pdf';
        try {
            doc.save(name);
        } catch (e) {
            window.open(doc.output('bloburl'));
        }
        say(`PDF created: ${name}`);
    } catch (e) {
        say('PDF export failed: ' + (e && e.message || e) + '. Try Print instead.', '#ffb4a8');
    } finally {
        pv.classList.remove('cap');
    }
}

// Opens the browser print window for the PDF view
function printPDF() {
    if (validate().length) {
        return act('pdf');
    }
    buildPV();
    setTimeout(() => {
        try {
            window.print();
        } catch (x) {
            say('Printing is blocked here. Open the file directly in Chrome or Edge.', '#ffb4a8');
        }
    }, 60);
}

// Runs a menu or toolbar action by name (new, save, open, undo, pdf...)
function act(a, e) {
    const sec = e && e.target && e.target.closest ? e.target.closest('.sec') : null;
    const si = sec ? +sec.dataset.si : curSec;
    ({
        new: () => struct(() => {
            S = blank();
            setMeta();
        }),
        save() {
            if (!S.title.trim()) {
                return say('Add a title before saving.', '#ffb4a8');
            }
            try {
                localStorage.setItem('cne:c:' + S.title, JSON.stringify(S));
                say(`Saved “${S.title}” in this browser.`);
            } catch (x) {
                say('Saving is blocked in this browser.', '#ffb4a8');
            }
        },
        open() {
            const ks = Object.keys(localStorage).filter(k => k.startsWith('cne:c:'));
            modal('Saved compositions', ks.length ? ks.map(k => `<div style="display:flex;gap:8px;margin:4px 0"><button data-o="${esc(k)}" style="flex:1;text-align:left;padding:6px">${esc(k.slice(6))}</button><button data-d="${esc(k)}" style="padding:6px">Delete</button></div>`).join('') : '<p>No saved compositions yet. Use File, Save to store the current one here.</p>', [['Close', closeM]]);
            $('#mb').onclick = x => {
                const o = x.target.dataset.o;
                const d = x.target.dataset.d;
                if (o) {
                    pushU();
                    S = JSON.parse(localStorage.getItem(o));
                    setMeta();
                    render();
                    closeM();
                }
                if (d) {
                    localStorage.removeItem(d);
                    act('open');
                }
            };
        },
        undo: () => restore(U, R),
        redo: () => restore(R, U),
        addrow: () => struct(() => S.secs[si].rows.push(newRow())),
        delrow() {
            const r = e.target.closest('.row');
            struct(() => {
                const rows = S.secs[si].rows;
                rows.splice(+r.dataset.ri, 1);
                if (!rows.length) {
                    rows.push(newRow());
                }
            });
        },
        delsec: () => struct(() => {
            S.secs.splice(si, 1);
            if (!S.secs.length) {
                S.secs.push({ n: 'Pallavi', rows: [newRow()] });
            }
        }),
        clear: () => struct(() => S.secs.forEach(s => s.rows = s.rows.map(newRow))),
        validate() {
            const M = validate();
            say(M.length ? `${M.length} issue${M.length > 1 ? 's' : ''} found. See the list below the sheet.` : 'Composition is valid.');
            $('#msgs').scrollIntoView({ behavior: 'smooth' });
        },
        pdf() {
            const M = validate();
            if (M.length) {
                const first = M.find(m => m[2] != null);
                modal('Cannot export yet', `<p class="err"><b>${M.length} problem${M.length > 1 ? 's' : ''}</b> must be fixed before this composition can be exported or printed.</p><ul style="padding-left:18px;margin:6px 0">${M.slice(0, 6).map(m => `<li>${esc(m[1])}</li>`).join('')}</ul>${M.length > 6 ? `<p class="hint">…and ${M.length - 6} more, listed below the sheet.</p>` : ''}`, [['Close', closeM], ['Go to first issue', () => {
                            closeM();
                            const c = first && $(`.sec[data-si="${first[2]}"] .row[data-ri="${first[3]}"] .c[data-i="${first[4]}"] .s`);
                            if (c) {
                                c.scrollIntoView({ block: 'center' });
                                c.focus();
                            } else {
                                $('#msgs').scrollIntoView({ behavior: 'smooth' });
                            }
                        }, 1]]);
                return;
            }
            const pick = f => () => {
                pdfGrid = document.querySelector('input[name=pg]:checked').value == '1';
                closeM();
                f();
            };
            modal('Export as PDF', `<p class="ok">Validation passed. The composition can be exported.</p>
    <label class="rd"><input type="radio" name="pg" value="1" ${pdfGrid ? 'checked' : ''}>With grid (every cell is boxed)</label>
    <label class="rd"><input type="radio" name="pg" value="0" ${pdfGrid ? '' : 'checked'}>Without grid (clean notation, only anga bars and the end mark)</label>
    <p class="hint"><b>Download PDF</b> saves a file directly. <b>Print</b> opens the print window, where you choose Save as PDF (A4).</p>`, [['Cancel', closeM], ['Print…', pick(printPDF)], ['Download PDF', pick(dlPDF), 1]]);
        },
        ctala() {
            modal('Create custom tala', `<label>Name<input id="ctn" placeholder="e.g. My Tala"></label><label>Angas<input id="cta" placeholder="I4 O I3 U C5"></label>
   <div class="hint">I = laghu (I3, I4, I5…), O = drutam (2 beats), U = anudrutam (1 beat), C5 = a plain group of 5 beats.</div><div id="ctp" class="hint"></div>`, [['Cancel', closeM], ['Save tala', () => {
                        const nm = $('#ctn').value.trim();
                        const p = parseTala($('#cta').value);
                        if (!nm || p.err || BT[nm]) {
                            return say(!nm ? 'Enter a tala name.' : BT[nm] ? 'That name is already a standard tala.' : p.err, '#ffb4a8');
                        }
                        CT[nm] = $('#cta').value.trim();
                        try {
                            localStorage.setItem('cne:talas', JSON.stringify(CT));
                        } catch (x) {
    // ignore
}
                        S.tala = nm;
                        fill();
                        render();
                        closeM();
                    }, 1]]);
            $('#cta').oninput = () => {
                const p = parseTala($('#cta').value);
                $('#ctp').innerHTML = p.err ? `<span class="err">${esc(p.err)}</span>` : `<span class="ok">Valid: ${p.angas.length} angas, ${p.total} beats per avartana.</span>`;
            };
        },
        craga() {
            const chk = () => {
                const nm = $('#crn').value.trim();
                const a = $('#cra').value.trim().split(/\s+/);
                const v = $('#crv').value.trim().split(/\s+/);
                const ok = t => /^(S|P|[RGND][1-3]|M[12])['.]?$/.test(t);
                if (!nm) {
                    return 'Enter a raga name.';
                }
                if (BR[nm]) {
                    return 'That raga already exists.';
                }
                for (const t of [...a, ...v]) {
                    if (!ok(t)) {
                        return `“${t}” is not a valid swara. Examples: S R2 G3 M1 P D2 N3.`;
                    }
                }
                if (a[0] != 'S' || a.at(-1) != "S'") {
                    return "Arohana must start at S and end at S'.";
                }
                if (v[0] != "S'" || v.at(-1) != 'S') {
                    return "Avarohana must start at S' and end at S.";
                }
                return '';
            };
            modal('Create custom raga', `<label>Name<input id="crn"></label><label>Arohana<input id="cra" placeholder="S R2 G3 P D2 S'"></label><label>Avarohana<input id="crv" placeholder="S' D2 P G3 R2 S"></label>
   <div class="hint">Separate swaras with spaces. Add ' for the upper Sa. Start at S and end at S'.</div><div id="crp" class="hint"></div>`, [['Cancel', closeM], ['Save raga', () => {
                        const m = chk();
                        if (m) {
                            return say(m, '#ffb4a8');
                        }
                        const nm = $('#crn').value.trim();
                        CR[nm] = [$('#cra').value.trim(), $('#crv').value.trim()];
                        try {
                            localStorage.setItem('cne:ragas', JSON.stringify(CR));
                        } catch (x) {
    // ignore
}
                        S.raga = nm;
                        fill();
                        head();
                        validate();
                        closeM();
                    }, 1]]);
            $('#mb').oninput = () => {
                const m = chk();
                $('#crp').innerHTML = m ? `<span class="err">${esc(m)}</span>` : '<span class="ok">Valid raga definition.</span>';
            };
        },
        help: () => modal('Notation guide and shortcuts', `<table class="k"><tr><td><b>S, P</b></td><td>Type one key. The cursor moves on by itself.</td></tr>
   <tr><td><b>R1 R2 R3</b><br><b>G1 G2 G3</b><br><b>M1 M2</b><br><b>D1 D2 D3</b><br><b>N1 N2 N3</b></td><td>Type the letter, then the number. Same-pitch pairs (R2 and G1, R3 and G2, D2 and N1, D3 and N2) are checked against the raga.</td></tr>
   <tr><td><b>' or .</b></td><td>Dot above or below the note you just typed (press again to remove)</td></tr><tr><td><b>, ; -</b></td><td>Hold for one beat, two beats, or hold</td></tr>
   <tr><td><b>Space / Enter</b></td><td>Next cell / same cell in next row</td></tr><tr><td><b>Arrows</b></td><td>Move around. Shift+arrows or Shift+click select several cells.</td></tr>
   <tr><td><b>Toolbar</b></td><td>Dots, single and double lines above or below, bold, size, colour and kampita apply to the selected cells.</td></tr>
   <tr><td><b>Ctrl+B, S, Z, Y, P</b></td><td>Bold, save, undo, redo, export</td></tr></table>`, [['Close', closeM, 1]])
    }[a] || (() => {
    }))();
}

// Keyboard shortcuts: Ctrl+S save, Ctrl+P export, Ctrl+B bold, Ctrl+Z/Y undo and redo
document.addEventListener('keydown', e => {
    const c = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key == 'Escape') {
        closeM();
    }
    if (c && k == 's') {
        e.preventDefault();
        act('save');
    } else if (c && k == 'p') {
        e.preventDefault();
        act('pdf');
    } else if (c && k == 'b') {
        e.preventDefault();
        fmt('b', 1);
    } else if (c && k == 'z' && !e.target.matches('#fTitle,#fComp')) {
        e.preventDefault();
        act(e.shiftKey ? 'redo' : 'undo');
    } else if (c && k == 'y') {
        e.preventDefault();
        act('redo');
    }
});

/* touch support: swara pad, tap-to-open menus, responsive widths */
// ---------------------------------------------------------------
// Touch support: swara pad and mobile layout
// ---------------------------------------------------------------
const mq = matchMedia('(max-width:820px)');

// Hides the phone keyboard in favour of the swara pad on small screens
function setIM() {
    const on = !kb && mq.matches;
    $$('.s').forEach(i => i.setAttribute('inputmode', on ? 'none' : 'text'));
}

// Keys shown on the on-screen swara pad
const PADK = ['S', 'R1', 'R2', 'R3', 'G1', 'G2', 'G3', 'M1', 'M2', 'P', 'D1', 'D2', 'D3', 'N1', 'N2', 'N3', ',', ';', '-', 'Ṡ', 'Ṣ', '⌫', '←', '→', '↑', '↓', '⏎', '⌨'];
$('#pad').innerHTML = PADK.map(k => `<button data-p="${k}">${k}</button>`).join('');
$('#pad').addEventListener('mousedown', e => e.preventDefault());

// Empties one cell
const clearCell = el => {
    const r = rowOf(el);
    const i = idxOf(el);
    r.s[i] = '';
    r.o[i] = 0;
    r.f[i] = {};
    el.value = '';
    paint(el);
};
$('#pad').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) {
        return;
    }
    const k = b.dataset.p;
    let f = lastS && lastS.isConnected ? lastS : $('.s');
    if (!f) {
        return;
    }
    if (document.activeElement !== f) {
        f.focus();
    }
    if (k == '⌨') {
        kb = !kb;
        setIM();
        say(kb ? 'Phone keyboard on. Tap ⌨ again for the swara pad.' : 'Swara pad on.');
        return;
    }
    clearTimeout(tm);
    const L = $$('.s');
    const n = ncell();
    if (k == '←') {
        return move(f, -1);
    }
    if (k == '→') {
        return move(f, 1);
    }
    if (k == '↑') {
        return move(f, -n);
    }
    if (k == '↓' || k == '⏎') {
        return move(f, n);
    }
    edit();
    if (k == '⌫') {
        if (f.value) {
            clearCell(f);
        } else {
            const p = L[L.indexOf(f) - 1];
            if (p) {
                clearCell(p);
                p.focus();
            }
        }
        return;
    }
    if (k == 'Ṡ' || k == 'Ṣ') {
        const t = TOK.test(rowOf(f).s[idxOf(f)]) ? f : L[L.indexOf(f) - 1];
        if (t && TOK.test(rowOf(t).s[idxOf(t)])) {
            mark(t, k == 'Ṡ' ? 1 : -1);
        }
        return;
    }
    commit(f, k);
    move(f, 1);
});

// Tap-to-open menus on touch devices
document.addEventListener('click', e => {
    const m = e.target.closest('.menu>button');
    $$('.menu.open').forEach(x => {
        if (!m || x !== m.parentNode) {
            x.classList.remove('open');
        }
    });
    if (m) {
        m.parentNode.classList.toggle('open');
    } else {
        const dd = e.target.closest('.dd');
        if (dd) {
            dd.parentNode.classList.add('shut');
        }
    }
});
$$('.menu').forEach(m => m.addEventListener('mouseleave', () => m.classList.remove('shut')));
let rt = 0;
addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
        setCW();
        setIM();
    }, 120);
});
mq.addEventListener && mq.addEventListener('change', setIM);

// Startup
window.addEventListener('beforeprint', buildPV);
try {
    localStorage.removeItem('cne:draft');
} catch (e) {
    // storage is not available (private mode or blocked), carry on without it
}
if (!S.secs || !S.secs.length) {
    S = blank();
}
fill();
render();
setIM();
const f0 = $('.s');
f0 && !mq.matches && f0.focus();