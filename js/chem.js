/* Chemistry engine for the Balancing Chemical Equations tool.
 * - Exact rational arithmetic (BigInt) so large coefficients never lose precision
 * - Formula parser: parentheses/brackets, hydrates (· • * .), state labels (s)(l)(g)(aq)
 * - Equation parser and solver (null space of the composition matrix), with a
 *   uniqueness check so ambiguous equations are rejected
 * - Polyatomic-ion "unit" detection for the inventory shortcut
 * - Linear-expression parser for the Variable Substitution coach
 * Works in the browser (window.Chem) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---------- Rational numbers ----------
  const babs = (x) => (x < 0n ? -x : x);
  function bgcd(a, b) { a = babs(a); b = babs(b); while (b) { [a, b] = [b, a % b]; } return a; }
  function blcm(a, b) { return a === 0n || b === 0n ? 0n : babs(a * b) / bgcd(a, b); }

  class Rat {
    constructor(n, d = 1n) {
      n = BigInt(n); d = BigInt(d);
      if (d === 0n) throw new Error('Division by zero');
      if (d < 0n) { n = -n; d = -d; }
      const g = bgcd(n, d) || 1n;
      this.n = n / g; this.d = d / g;
    }
    static of(x) { return x instanceof Rat ? x : new Rat(x); }
    add(o) { o = Rat.of(o); return new Rat(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { o = Rat.of(o); return new Rat(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { o = Rat.of(o); return new Rat(this.n * o.n, this.d * o.d); }
    div(o) { o = Rat.of(o); return new Rat(this.n * o.d, this.d * o.n); }
    neg() { return new Rat(-this.n, this.d); }
    isZero() { return this.n === 0n; }
    isInt() { return this.d === 1n; }
    eq(o) { o = Rat.of(o); return this.n === o.n && this.d === o.d; }
    sign() { return this.n > 0n ? 1 : this.n < 0n ? -1 : 0; }
    toString() { return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`; }
    toNumber() { return Number(this.n) / Number(this.d); }
  }

  // Parse a number typed by a student: "3", "25/2", "12.5", "" (blank -> null)
  function parseNumber(s) {
    if (s == null) return null;
    s = String(s).trim();
    if (s === '') return null;
    let m = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
    if (m) { if (m[2] === '0' || /^0+$/.test(m[2])) return undefined; return new Rat(BigInt(m[1]), BigInt(m[2])); }
    m = s.match(/^(-?)(\d*)\.(\d+)$/);
    if (m) {
      const den = 10n ** BigInt(m[3].length);
      const num = BigInt((m[2] || '0') + m[3]);
      return new Rat(m[1] ? -num : num, den);
    }
    m = s.match(/^-?\d+$/);
    if (m) return new Rat(BigInt(s));
    return undefined; // invalid
  }

  // ---------- Periodic table ----------
  const ELEMENTS = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
    'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os ' +
    'Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr').split(' '));
  const NONMETALS = new Set('H He C N O F Ne P S Cl Ar Se Br Kr I Xe At Rn B Si As Te'.split(' '));

  // ---------- Formula parsing ----------
  const STATE_RE = /\s*\((s|l|g|aq)\)\s*$/i;
  const HYDRATE_SPLIT = /\s*[·•∙*.]\s*/;

  function splitState(text) {
    const m = text.match(STATE_RE);
    return m ? { core: text.slice(0, m.index).trim(), state: m[1].toLowerCase() } : { core: text.trim(), state: '' };
  }

  // Parse one hydrate-free formula into a list of tokens (tree).
  // Returns array of {el, n} or {group:[...], n, text}
  function parseTokens(s) {
    let i = 0;
    function readNum() {
      const m = s.slice(i).match(/^\d+/);
      if (!m) return 1;
      i += m[0].length; return parseInt(m[0], 10);
    }
    function seq(close) {
      const out = [];
      while (i < s.length) {
        const c = s[i];
        if (c === ')' || c === ']') {
          if (!close) throw new Error(`Unexpected "${c}"`);
          if ((close === ')' && c !== ')') || (close === ']' && c !== ']')) throw new Error('Mismatched brackets');
          return out;
        }
        if (c === '(' || c === '[') {
          const start = i; i++;
          const inner = seq(c === '(' ? ')' : ']');
          if (i >= s.length) throw new Error('Missing closing bracket');
          const text = s.slice(start + 1, i);
          i++; // skip close
          const n = readNum();
          if (!inner.length) throw new Error('Empty brackets');
          out.push({ group: inner, n, text });
          continue;
        }
        const m = s.slice(i).match(/^[A-Z][a-z]?/);
        if (!m) throw new Error(`Unexpected character "${c}"`);
        // prefer two-letter symbol only if it is a real element
        let sym = m[0];
        if (sym.length === 2 && !ELEMENTS.has(sym)) sym = sym[0];
        if (!ELEMENTS.has(sym)) throw new Error(`Unknown element "${sym}"`);
        i += sym.length;
        out.push({ el: sym, n: readNum() });
      }
      if (close) throw new Error('Missing closing bracket');
      return out;
    }
    const r = seq(null);
    if (!r.length) throw new Error('Empty formula');
    return r;
  }

  function tokensToCounts(tokens, mult, acc) {
    for (const t of tokens) {
      if (t.el) acc[t.el] = (acc[t.el] || 0) + t.n * mult;
      else tokensToCounts(t.group, mult * t.n, acc);
    }
    return acc;
  }

  // Full species parse
  function parseSpecies(raw) {
    const text = String(raw).trim();
    if (!text) throw new Error('Empty formula');
    if (/[\^]|[+-]$|\d[+-]$/.test(text)) throw new Error('Charges are not supported (no net ionic equations)');
    const { core, state } = splitState(text);
    const parts = core.split(HYDRATE_SPLIT).filter(Boolean);
    const counts = {};
    const pieces = [];
    parts.forEach((p, idx) => {
      let mult = 1, body = p;
      if (idx > 0) {
        const m = p.match(/^(\d+)\s*(.*)$/);
        if (m) { mult = parseInt(m[1], 10); body = m[2]; }
      } else if (/^\d/.test(p)) {
        throw new Error(`"${p}" starts with a number — enter coefficients separately`);
      }
      const tokens = parseTokens(body.replace(/\s+/g, ''));
      tokensToCounts(tokens, mult, counts);
      pieces.push({ mult, body: body.replace(/\s+/g, ''), tokens });
    });
    return { text, core, state, counts, pieces };
  }

  // ---------- Equation parsing ----------
  const ARROW_RE = /\s*(?:-+>|→|⟶|=+>|=|<-+>|⇌)\s*/;

  function parseEquation(str) {
    const s = String(str).replace(/\s+/g, ' ').trim();
    const sides = s.split(ARROW_RE);
    if (sides.length !== 2) throw new Error('Use exactly one arrow (->) between reactants and products');
    const mk = (side) => side.split(/\s+\+\s+|\+/).map((t) => t.trim()).filter(Boolean).map((t) => {
      // strip a leading coefficient like "2 H2O" or "2H2O"
      const m = t.match(/^(\d+(?:\/\d+)?)\s*(?=[A-Z(\[])/);
      const given = m ? m[1] : null;
      const sp = parseSpecies(m ? t.slice(m[0].length) : t);
      sp.givenCoef = given;
      return sp;
    });
    const reactants = mk(sides[0]);
    const products = mk(sides[1]);
    if (!reactants.length || !products.length) throw new Error('Need at least one reactant and one product');
    const species = reactants.concat(products);
    // elements in order of first appearance
    const elements = [];
    for (const sp of species) for (const el of orderedElements(sp)) if (!elements.includes(el)) elements.push(el);
    return { reactants, products, species, nR: reactants.length, elements };
  }

  function orderedElements(sp) {
    const out = [];
    (function walk(tokens) { for (const t of tokens) { if (t.el) { if (!out.includes(t.el)) out.push(t.el); } else walk(t.group); } })(
      sp.pieces.flatMap((p) => p.tokens));
    return out;
  }

  // ---------- Linear algebra ----------
  function nullspace(M) {
    const rows = M.length, cols = M[0].length;
    const A = M.map((r) => r.map((x) => Rat.of(x)));
    const piv = [];
    let r = 0;
    for (let c = 0; c < cols && r < rows; c++) {
      let p = -1;
      for (let i = r; i < rows; i++) if (!A[i][c].isZero()) { p = i; break; }
      if (p < 0) continue;
      [A[r], A[p]] = [A[p], A[r]];
      const pv = A[r][c];
      A[r] = A[r].map((x) => x.div(pv));
      for (let i = 0; i < rows; i++) {
        if (i !== r && !A[i][c].isZero()) {
          const f = A[i][c];
          A[i] = A[i].map((x, j) => x.sub(f.mul(A[r][j])));
        }
      }
      piv.push(c); r++;
    }
    const free = [];
    for (let c = 0; c < cols; c++) if (!piv.includes(c)) free.push(c);
    return free.map((fc) => {
      const v = Array(cols).fill(null).map(() => new Rat(0));
      v[fc] = new Rat(1);
      piv.forEach((pc, i) => { v[pc] = A[i][fc].neg(); });
      return v;
    });
  }

  function toIntegerVector(v) {
    let L = 1n;
    for (const x of v) L = blcm(L, x.d);
    let ints = v.map((x) => x.n * (L / x.d));
    let g = 0n;
    for (const x of ints) g = bgcd(g, x);
    if (g === 0n) g = 1n;
    ints = ints.map((x) => x / g);
    if (ints.some((x) => x < 0n)) ints = ints.map((x) => -x);
    return ints;
  }

  // composition matrix: rows = elements (or units), cols = species; reactants +, products -
  function compositionMatrix(eq, countsOf, keys) {
    return keys.map((k) => eq.species.map((sp, j) => (countsOf(sp)[k] || 0) * (j < eq.nR ? 1 : -1)));
  }

  // Solve. Returns {ok, coefs:[BigInt], reason}
  function solve(eq) {
    const M = compositionMatrix(eq, (sp) => sp.counts, eq.elements);
    const ns = nullspace(M);
    if (ns.length === 0) return { ok: false, reason: 'This equation cannot be balanced — check the formulas.' };
    if (ns.length > 1) return { ok: false, reason: 'This equation has more than one independent way to balance (it is really two or more reactions combined). It is not suitable for this tool.' };
    const ints = toIntegerVector(ns[0]);
    if (ints.some((x) => x <= 0n)) return { ok: false, reason: 'Balancing would require a zero or negative coefficient — a species is on the wrong side or does not belong.' };
    return { ok: true, coefs: ints };
  }

  function analyze(str) {
    const eq = parseEquation(str);
    const sol = solve(eq);
    eq.solution = sol.ok ? sol.coefs : null;
    eq.error = sol.ok ? null : sol.reason;
    if (sol.ok) eq.units = detectUnits(eq);
    return eq;
  }

  // ---------- Polyatomic ion units ----------
  const IONS = ['C2H3O2', 'Cr2O7', 'HCO3', 'HSO4', 'H2PO4', 'HPO4', 'S2O3', 'SO4', 'SO3', 'PO4', 'PO3', 'NO3', 'NO2', 'CO3', 'ClO4', 'ClO3', 'ClO2', 'ClO',
    'BrO3', 'IO3', 'CrO4', 'MnO4', 'OH', 'CN', 'NH4', 'C2O4', 'SiO3', 'AsO4', 'SCN', 'O2'];
  // O2 (peroxide) excluded from tail matching below
  const TAIL_IONS = IONS.filter((x) => x !== 'O2').sort((a, b) => b.length - a.length);

  // Break a species into units (allowed = Set of ion names to treat as units)
  function unitCounts(sp, allowed) {
    const acc = {};
    const add = (k, n) => { acc[k] = (acc[k] || 0) + n; };
    for (const piece of sp.pieces) {
      const tokens = piece.tokens;
      const body = piece.body;
      // Tail-match pattern: cation then ion, no brackets
      const tm = matchTail(body, allowed);
      if (tm) {
        tokensToCountsInto(parseTokens(tm.cation), piece.mult, allowed, add);
        add(tm.ion, piece.mult);
        continue;
      }
      tokensToCountsInto(tokens, piece.mult, allowed, add);
    }
    return acc;
  }
  function tokensToCountsInto(tokens, mult, allowed, add) {
    for (const t of tokens) {
      if (t.el) add(t.el, t.n * mult);
      else if (allowed.has(t.text)) add(t.text, t.n * mult);
      else tokensToCountsInto(t.group, mult * t.n, allowed, add);
    }
  }
  function matchTail(body, allowed) {
    if (/[()[\]]/.test(body)) {
      // allow "(NH4)2SO4"-style: handled by token walk for groups; only tail outside brackets
      const m = body.match(/^(.*[)\]]\d*)([A-Z].*)$/);
      if (m) {
        const tail = m[2];
        if (allowed.has(tail) && TAIL_IONS.includes(tail)) return { cation: m[1], ion: tail };
      }
      return null;
    }
    // cation: NH4 or H or a metal, with optional count
    const cm = body.match(/^(NH4|[A-Z][a-z]?)(\d*)/);
    if (!cm) return null;
    let sym = cm[1];
    if (sym !== 'NH4' && sym.length === 2 && !ELEMENTS.has(sym)) return null;
    const isCation = sym === 'NH4' || sym === 'H' || !NONMETALS.has(sym);
    if (!isCation) return null;
    // H as cation only for acids: remainder must be an oxyanion, not OH
    const rest = body.slice(cm[0].length);
    if (!rest) return null;
    for (const ion of TAIL_IONS) {
      if (rest === ion && allowed.has(ion)) {
        if (sym === 'H' && (ion === 'OH' || ion === 'CN')) return null;
        if (sym === 'NH4' && ion === 'OH') return { cation: 'NH4', ion: 'OH' };
        return { cation: cm[0], ion };
      }
    }
    return null;
  }

  function sameSolution(eq, keys, countsOf) {
    const M = compositionMatrix(eq, countsOf, keys);
    const ns = nullspace(M);
    if (ns.length !== 1) return false;
    const ints = toIntegerVector(ns[0]);
    return ints.every((x, i) => x === eq.solution[i]);
  }

  function keysOf(eq, countsOf) {
    const keys = [];
    for (const sp of eq.species) for (const k of Object.keys(countsOf(sp))) if (!keys.includes(k)) keys.push(k);
    return keys;
  }

  // Find ions that can sensibly be counted as units: present on both sides
  // and counting them as units gives the same balanced answer.
  function detectUnits(eq) {
    const valid = [];
    for (const ion of IONS) {
      const allowed = new Set([ion]);
      const cf = (sp) => unitCounts(sp, allowed);
      let left = false, right = false;
      eq.species.forEach((sp, j) => { if (cf(sp)[ion]) { if (j < eq.nR) left = true; else right = true; } });
      if (!left || !right) continue;
      if (sameSolution(eq, keysOf(eq, cf), cf)) valid.push(ion);
    }
    if (!valid.length) return null;
    let allowed = new Set(valid);
    let cf = (sp) => unitCounts(sp, allowed);
    if (!sameSolution(eq, keysOf(eq, cf), cf)) { allowed = new Set([valid[0]]); cf = (sp) => unitCounts(sp, allowed); }
    // order keys: units first in order of appearance, then elements
    const keys = keysOf(eq, cf);
    return { ions: [...allowed], keys, countsOf: cf };
  }

  // Inventory: coefs = array of Rat (null treated as 1). mode 'atoms' or 'units'
  function inventory(eq, coefs, mode) {
    const useUnits = mode === 'units' && eq.units;
    const keys = useUnits ? eq.units.keys : eq.elements;
    const countsOf = useUnits ? eq.units.countsOf : (sp) => sp.counts;
    return keys.map((k) => {
      let L = new Rat(0), R = new Rat(0);
      eq.species.forEach((sp, j) => {
        const c = coefs[j] == null ? new Rat(1) : coefs[j];
        const n = countsOf(sp)[k] || 0;
        if (j < eq.nR) L = L.add(c.mul(n)); else R = R.add(c.mul(n));
      });
      return { key: k, isUnit: useUnits && eq.units.ions.includes(k), left: L, right: R, ok: L.eq(R) };
    });
  }

  // Compare a student's coefficients (Rat[]) to the solution.
  // Returns {status: 'correct'|'multiple'|'fraction'|'wrong'|'incomplete', factor}
  function checkCoefficients(eq, coefs) {
    if (coefs.some((c) => c === undefined)) return { status: 'invalid' };
    const c = coefs.map((x) => (x == null ? new Rat(1) : x));
    if (c.some((x) => x.sign() <= 0)) return { status: 'nonpositive' };
    const inv = inventory(eq, c, 'atoms');
    const balanced = inv.every((r) => r.ok);
    if (!balanced) return { status: 'wrong', inventory: inv };
    if (c.some((x) => !x.isInt())) return { status: 'fraction', inventory: inv };
    const factor = c[0].n / eq.solution[0];
    if (factor === 1n) return { status: 'correct', inventory: inv };
    return { status: 'multiple', factor, inventory: inv };
  }

  // ---------- Linear expressions for Variable Substitution ----------
  // "2c + d", "8a", "c*2", "2*c", "1c", "(25/2)b". Returns {map:{var:Rat}} or {error}
  function parseLinear(str, vars) {
    const s = String(str || '').replace(/\s+/g, '').replace(/×|·/g, '*');
    if (!s) return { error: 'empty' };
    const terms = s.replace(/-/g, '+-').split('+').filter((t) => t !== '');
    const map = {};
    for (let t of terms) {
      let sign = 1;
      if (t.startsWith('-')) { sign = -1; t = t.slice(1); }
      let m = t.match(/^\(?(\d+(?:\/\d+)?|\d*\.\d+)?\)?\*?([A-Za-z])$/) || null;
      let num, v;
      if (m) { num = m[1]; v = m[2]; }
      else {
        m = t.match(/^([A-Za-z])\*?(\d+(?:\/\d+)?|\d*\.\d+)$/);
        if (m) { v = m[1]; num = m[2]; }
      }
      if (!v) return { error: `Could not read "${t}". Write terms like 8a or 2c + d.` };
      if (vars && !vars.includes(v)) return { error: `"${v}" is not one of your variables (${vars.join(', ')}).` };
      const k = num ? parseNumber(num) : new Rat(1);
      if (!k) return { error: `Could not read the number in "${t}".` };
      map[v] = (map[v] || new Rat(0)).add(k.mul(sign));
    }
    return { map };
  }

  // Exact (not scaled) comparison of a linear form with expected {var:int}
  function linearEquals(map, expected) {
    const keys = new Set([...Object.keys(map), ...Object.keys(expected)]);
    for (const k of keys) {
      const a = map[k] || new Rat(0);
      const b = new Rat(expected[k] || 0);
      if (!a.eq(b)) return false;
    }
    return true;
  }

  function lcmOfDenominators(rats) { let L = 1n; for (const r of rats) L = blcm(L, r.d); return L; }

  // ---------- Display helpers ----------
  function formulaHTML(text) {
    const { core, state } = splitState(text);
    let html = '';
    const parts = core.split(HYDRATE_SPLIT);
    parts.forEach((p, idx) => {
      if (idx > 0) html += '<span class="dot">·</span>';
      let body = p.trim();
      if (idx > 0) {
        const m = body.match(/^(\d+)(.*)$/);
        if (m) { html += m[1]; body = m[2]; }
      }
      html += body.replace(/(\d+)/g, '<sub>$1</sub>');
    });
    if (state) html += `<span class="state">(${state})</span>`;
    return html;
  }
  function unitHTML(k) { return k.replace(/(\d+)/g, '<sub>$1</sub>'); }

  function equationText(eq, coefs) {
    const part = (list, off) => list.map((sp, i) => {
      const c = coefs ? coefs[off + i] : null;
      const cs = c == null ? '' : (c.toString() === '1' ? '' : c.toString() + ' ');
      return cs + sp.text;
    }).join(' + ');
    return `${part(eq.reactants, 0)} → ${part(eq.products, eq.nR)}`;
  }

  const api = { Rat, parseNumber, parseSpecies, parseEquation, solve, analyze, inventory, checkCoefficients,
    parseLinear, linearEquals, lcmOfDenominators, formulaHTML, unitHTML, equationText, nullspace, toIntegerVector, ELEMENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chem = api;
})(typeof window !== 'undefined' ? window : globalThis);
