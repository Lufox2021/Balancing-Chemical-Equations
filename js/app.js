/* Balancing Chemical Equations — user interface
 * Coaching (A: Variable Substitution, B: Sequential Inventory), Testing, Instructor.
 */
(function () {
  'use strict';
  const C = window.Chem;
  const Rat = C.Rat;

  // ======================================================================
  // Utilities
  // ======================================================================
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) {
      if (k == null || k === false) continue;
      e.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
    return e;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const btn = (label, onclick, cls = '') => el('button', { class: 'btn ' + cls, onclick }, label);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const toRat = (x) => (x == null ? null : x instanceof Rat ? x : new Rat(x));
  const coefStr = (x) => { if (x == null) return ''; const s = toRat(x).toString(); return s === '1' ? '' : s; };
  const unitLabel = (k) => C.unitHTML(k);

  function onEnter(input, fn) { input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } }); }

  function setFeedback(node, kind, html) {
    node.className = 'feedback' + (kind ? ' ' + kind : '');
    node.innerHTML = html || '';
  }

  // Equation with a "slot" before each species (input, variable label, coefficient text)
  function equationEl(eq, slot, cls = '') {
    const wrap = el('div', { class: 'equation ' + cls });
    eq.species.forEach((sp, i) => {
      if (i > 0) wrap.append(el('span', { class: i === eq.nR ? 'arrow' : 'op' }, i === eq.nR ? '→' : '+'));
      const term = el('span', { class: 'term' });
      const s = slot ? slot(i) : null;
      if (s) term.append(s);
      term.append(el('span', { class: 'formula', html: C.formulaHTML(sp.text) }));
      wrap.append(term);
    });
    return wrap;
  }

  // Equation as an HTML string with coefficients
  function eqHTML(eq, coefs) {
    return eq.species.map((sp, i) => {
      const sep = i === 0 ? '' : i === eq.nR ? ' &nbsp;<span class="arrowc">→</span>&nbsp; ' : ' + ';
      const c = coefs ? coefStr(coefs[i]) : '';
      return sep + (c ? `<span class="coef-text">${c}</span> ` : '') + C.formulaHTML(sp.text);
    }).join('');
  }

  function linearHTML(map, vars) {
    const parts = [];
    for (const v of vars) {
      const k = map[v];
      if (!k || (k.isZero && k.isZero())) continue;
      const ks = k.toString();
      parts.push(`${ks === '1' ? '' : ks}<span class="var-label">${v}</span>`);
    }
    return parts.join(' + ') || '0';
  }

  // ======================================================================
  // Problem bank
  // ======================================================================
  const LEVELS = [
    null,
    { name: 'Simple', desc: 'Synthesis, decomposition, single replacement' },
    { name: 'Combustion', desc: 'Hydrocarbons and short multi-step balances' },
    { name: 'Polyatomic ions', desc: 'Double replacement, acids & bases, hydrates' },
    { name: 'Advanced', desc: 'O-containing organics, multi-element' },
    { name: 'Challenge', desc: 'Redox and many-species “monsters”' },
  ];
  const keyOf = (s) => s.replace(/\s+/g, '').toLowerCase();
  const analysisCache = new Map();
  function analyzeCached(text) {
    if (!analysisCache.has(text)) {
      let a;
      try { a = C.analyze(text); } catch (e) { a = { error: e.message }; }
      analysisCache.set(text, a);
    }
    return analysisCache.get(text);
  }

  let BANK = [];
  function loadBank() {
    const seen = new Set();
    BANK = [];
    for (const p of window.PROBLEM_BANK || []) {
      const k = keyOf(p.eq); if (seen.has(k)) continue; seen.add(k);
      BANK.push({ eq: p.eq, level: p.level, src: p.src || '', custom: false });
    }
    for (const p of store.get('bce.custom', [])) {
      const k = keyOf(p.eq); if (seen.has(k)) continue; seen.add(k);
      BANK.push({ eq: p.eq, level: p.level, src: p.src || 'Instructor', custom: true });
    }
  }
  function problemsAt(level) { return BANK.filter((p) => p.level === level && analyzeCached(p.eq).solution); }

  const recent = {};
  function randomProblem(level, avoidEq) {
    const list = problemsAt(level);
    if (!list.length) return null;
    recent[level] = recent[level] || [];
    let pool = list.filter((p) => !recent[level].includes(p.eq) && p.eq !== avoidEq);
    if (!pool.length) { recent[level] = []; pool = list.filter((p) => p.eq !== avoidEq); if (!pool.length) pool = list; }
    const p = pool[Math.floor(Math.random() * pool.length)];
    recent[level].push(p.eq);
    return p;
  }

  // ======================================================================
  // Shared pieces
  // ======================================================================
  function card(step, title, instructions) {
    const fb = el('div', { class: 'feedback' });
    const body = el('div');
    const root = el('div', { class: 'card locked' },
      el('div', { class: 'card-head' }, step ? el('span', { class: 'step-no' }, step) : null, el('h3', {}, title)),
      instructions ? el('p', { class: 'instructions', html: instructions }) : null,
      body, fb);
    return {
      root, body, fb,
      unlock() { root.classList.remove('locked'); },
      done() { root.classList.add('done'); },
      lock() { root.classList.add('locked'); },
    };
  }

  // Problem picker: level select + new problem + own equation
  function problemPicker(onPick, defaultLevel = 2) {
    const sel = el('select', {}, [1, 2, 3, 4, 5].map((l) => el('option', { value: l, selected: l === defaultLevel }, `Level ${l} — ${LEVELS[l].name}`)));
    const own = el('input', { type: 'text', placeholder: 'or type your own, e.g.  C3H8 + O2 -> CO2 + H2O' });
    const msg = el('div', { class: 'feedback' });
    let current = null;
    function pickBank() {
      const p = randomProblem(+sel.value, current && current.eq);
      if (!p) { setFeedback(msg, 'bad', 'No problems at this level yet.'); return; }
      setFeedback(msg, '', '');
      current = p; onPick(analyzeCached(p.eq), p);
    }
    function useOwn() {
      const t = own.value.trim();
      if (!t) return;
      const a = (() => { try { return C.analyze(t); } catch (e) { return { error: e.message }; } })();
      if (!a.solution) { setFeedback(msg, 'bad', esc(a.error || 'Could not read that equation.')); return; }
      setFeedback(msg, '', '');
      current = { eq: t, level: null, src: 'Your equation' };
      onPick(a, current);
    }
    onEnter(own, useOwn);
    const root = el('div', { class: 'card' },
      el('div', { class: 'picker' },
        el('label', {}, 'Practice problem:'), sel, btn('New problem', pickBank, 'primary'),
        el('div', { class: 'own' }, own, btn('Use mine', useOwn))),
      msg);
    root.classList.remove('locked');
    return { root, pickBank };
  }

  function invTable(rows, opts = {}) {
    const t = el('table', { class: 'inv' },
      el('tr', {}, el('th', {}, opts.keyHead || 'Atom'), el('th', {}, 'Reactants'), el('th', {}, 'Products'), el('th', {}, '')));
    for (const r of rows) {
      t.append(el('tr', { class: r.ok ? 'ok' : 'bad' },
        el('td', { class: 'el', html: unitLabel(r.key) + (r.isUnit ? '<span class="unit-tag">unit</span>' : '') }),
        el('td', { class: 'num' }, r.left.toString()),
        el('td', { class: 'num' }, r.right.toString()),
        el('td', { class: 'status' }, r.ok ? '✓' : '✗')));
    }
    return t;
  }

  // Worked example stepper
  function exampleStepper(title, subtitle, steps) {
    let i = 0;
    const body = el('div', { class: 'ex-body' });
    const prog = el('span', { class: 'ex-progress' });
    const prev = btn('← Back', () => go(i - 1), 'small');
    const next = btn('Next →', () => go(i + 1), 'small primary');
    function go(n) {
      i = Math.max(0, Math.min(steps.length - 1, n));
      body.innerHTML = '';
      body.append(el('div', { class: 'label' }, steps[i].title));
      const content = steps[i].render();
      body.append(content);
      prog.textContent = `Step ${i + 1} of ${steps.length}`;
      prev.disabled = i === 0; next.disabled = i === steps.length - 1;
    }
    const d = el('details', { class: 'example' },
      el('summary', {}, title, el('small', {}, subtitle)),
      el('div', { class: 'ex-step' }, body, el('div', { class: 'ex-nav' }, prev, next, prog)));
    go(0);
    return d;
  }

  // ======================================================================
  // COACHING A — Variable Substitution
  // ======================================================================
  function buildVSExample() {
    const eq = C.analyze('C8H18 + O2 -> CO2 + H2O');
    const vars = ['a', 'b', 'c', 'd'];
    const lab = (i) => el('span', { class: 'coef-text var-label' }, vars[i]);
    const side = (rows, head) => el('div', {}, el('div', { class: 'colhead' }, head), ...rows.map((r) => el('div', { html: r })));
    const v = (x) => `<span class="var-label">${x}</span>`;
    return exampleStepper('Worked example: isooctane (gasoline) combustion', 'Open to step through the method before you practice', [
      { title: 'Define the variables', render: () => el('div', {},
        el('p', {}, 'Put an unknown coefficient (a letter) in front of every reactant and product.'),
        equationEl(eq, lab)) },
      { title: 'Step 1 — Create an atom inventory', render: () => el('div', {},
        el('p', {}, 'For each element, count atoms on each side. Multiply the subscript by the species’ letter.'),
        el('div', { class: 'ex-cols' },
          side([`C: 8${v('a')}`, `H: 18${v('a')}`, `O: 2${v('b')}`], 'Reactants'),
          side([`C: ${v('c')}`, `H: 2${v('d')}`, `O: 2${v('c')} + ${v('d')}`], 'Products'))) },
      { title: 'Step 2 — Apply the Law of Conservation of Mass', render: () => el('div', {},
        el('p', {}, 'Atoms are neither created nor destroyed, so each element’s reactant count equals its product count.'),
        el('div', { class: 'math', html: `C: &nbsp;8${v('a')} = ${v('c')}<br>H: &nbsp;18${v('a')} = 2${v('d')}<br>O: &nbsp;2${v('b')} = 2${v('c')} + ${v('d')}` })) },
      { title: 'Step 3 — Solve for the coefficients', render: () => el('div', {},
        el('p', {}, 'Choose one variable and set it equal to 1 (the most complex molecule is usually the best choice). Then substitute.'),
        el('div', { class: 'math', html: `Let ${v('a')} = 1<br>C: &nbsp;${v('c')} = 8(1) = 8<br>H: &nbsp;18(1) = 2${v('d')} &nbsp;⇒&nbsp; ${v('d')} = 9<br>O: &nbsp;2${v('b')} = 2(8) + 9 = 25 &nbsp;⇒&nbsp; ${v('b')} = 25/2` })) },
      { title: 'Step 4 — Clear the fraction', render: () => el('div', {},
        el('div', { class: 'math', html: eqHTML(eq, [1, new Rat(25, 2), 8, 9]) }),
        el('p', {}, 'Multiply every coefficient by 2 to eliminate the fraction:'),
        el('div', { class: 'math', html: eqHTML(eq, [2, 25, 16, 18]) })) },
      { title: 'Step 5 — Check with an atom inventory', render: () => el('div', {},
        el('p', {}, 'Count every atom with the final coefficients before you submit.'),
        invTable(C.inventory(eq, [2, 25, 16, 18].map((x) => new Rat(x)), 'atoms')),
        el('p', { class: 'hl' }, 'It’s balanced!')) },
    ]);
  }

  function initVS(container) {
    container.append(buildVSExample());
    const work = el('div');
    const picker = problemPicker((eq) => runVS(work, eq), 2);
    container.append(picker.root, work);
    picker.pickBank();
  }

  function runVS(work, eq) {
    work.innerHTML = '';
    const n = eq.species.length;
    const sol = eq.solution.map((x) => new Rat(x));
    const state = { vars: null, k: null, values: null, final: null };

    const s1 = card('Step 1', 'Define the variables',
      'Type a different letter in each box to stand for that species’ unknown coefficient.');
    const s2 = card('Step 2', 'Atom inventory and conservation of mass',
      'For each element, write how many atoms are on each side using your variables (for example <span class="inline-eq">8<i>a</i></span> or <span class="inline-eq">2<i>c</i> + <i>d</i></span>). The two sides must be equal.');
    const s3 = card('Step 3', 'Solve for the unknowns',
      'Choose one variable to set equal to 1, then substitute into your equations to find the others. Fractions are fine here (type them like <b>25/2</b>).');
    const s4 = card('Step 4', 'Clear fractions', '');
    const s5 = card('Step 5', 'Check with an atom inventory, then submit',
      'Count the atoms on each side using your final coefficients.');
    work.append(s1.root, s2.root, s3.root, s4.root, s5.root);

    // ---------- Step 1 ----------
    s1.unlock();
    const varInputs = [];
    s1.body.append(equationEl(eq, () => { const inp = el('input', { type: 'text', class: 'var-in', maxlength: 1, autocomplete: 'off' }); varInputs.push(inp); onEnter(inp, check1); return inp; }));
    const b1 = btn('Check variables', check1, 'primary');
    s1.body.append(el('div', { class: 'row' }, b1));
    varInputs[0].focus();
    function check1() {
      const vals = varInputs.map((i) => i.value.trim().toLowerCase());
      let ok = true;
      varInputs.forEach((inp, i) => {
        const good = /^[a-z]$/.test(vals[i]) && vals.indexOf(vals[i]) === i && vals.lastIndexOf(vals[i]) === i;
        inp.classList.toggle('err', !good); inp.classList.toggle('ok', good);
        if (!good) ok = false;
      });
      if (!ok) {
        const blanks = vals.some((v) => !v);
        setFeedback(s1.fb, 'bad', blanks ? 'Give every species its own letter.' :
          vals.some((v) => v && !/^[a-z]$/.test(v)) ? 'Use single letters only (a–z).' : 'Each species needs a <b>different</b> letter.');
        return;
      }
      state.vars = vals;
      varInputs.forEach((i) => { i.value = i.value.toLowerCase(); i.disabled = true; });
      b1.disabled = true;
      setFeedback(s1.fb, 'good', `Good. Your unknowns are ${vals.map((v) => `<i>${v}</i>`).join(', ')}.`);
      s1.done();
      buildStep2();
    }

    // ---------- Step 2 ----------
    function expectedSide(e, left) {
      const m = {};
      eq.species.forEach((sp, j) => {
        if ((j < eq.nR) !== left) return;
        const c = sp.counts[e]; if (c) m[state.vars[j]] = (m[state.vars[j]] || 0) + c;
      });
      return m;
    }
    function buildStep2() {
      s2.unlock();
      const vars = state.vars;
      s2.body.append(equationEl(eq, (i) => el('span', { class: 'var-label' }, vars[i]), 'small'));
      const table = el('table', { class: 'inv' },
        el('tr', {}, el('th', {}, 'Element'), el('th', {}, 'Reactant side'), el('th', {}, ''), el('th', {}, 'Product side'), el('th', {}, '')));
      const rows = eq.elements.map((e) => {
        const L = el('input', { type: 'text', autocomplete: 'off' });
        const R = el('input', { type: 'text', autocomplete: 'off' });
        const st = el('td', { class: 'status' });
        onEnter(L, check2); onEnter(R, check2);
        table.append(el('tr', {}, el('td', { class: 'el' }, e), el('td', {}, L), el('td', {}, '='), el('td', {}, R), st));
        return { e, L, R, st, misses: 0, expL: expectedSide(e, true), expR: expectedSide(e, false) };
      });
      const b2 = btn('Check inventory', check2, 'primary');
      const sysBox = el('div');
      s2.body.append(table, el('div', { class: 'row', style: 'margin-top:12px' }, b2), sysBox);
      rows[0].L.focus();

      function check2() {
        const msgs = [];
        let allOk = true;
        for (const r of rows) {
          let rowOk = true;
          for (const [inp, exp, left] of [[r.L, r.expL, true], [r.R, r.expR, false]]) {
            const p = C.parseLinear(inp.value, vars);
            let good = false;
            if (p.error === 'empty') { rowOk = false; inp.classList.remove('ok'); inp.classList.add('err'); continue; }
            if (p.error) { msgs.push(`<b>${r.e}</b>: ${esc(p.error)}`); }
            else good = C.linearEquals(p.map, exp);
            inp.classList.toggle('ok', good); inp.classList.toggle('err', !good);
            if (!good) {
              rowOk = false;
              if (!p.error) {
                r.misses++;
                const sideName = left ? 'reactant' : 'product';
                const where = eq.species.map((sp, j) => ({ sp, j })).filter(({ sp, j }) => (j < eq.nR) === left && sp.counts[r.e]);
                if (r.misses >= 2) {
                  msgs.push(`<b>${r.e}</b>, ${sideName} side: ${r.e} appears in ` +
                    where.map(({ sp, j }) => `<span class="inline-eq">${C.formulaHTML(sp.text)}</span> (${sp.counts[r.e]} per formula, letter <i>${vars[j]}</i>)`).join(' and ') + '.');
                } else {
                  msgs.push(`<b>${r.e}</b>, ${sideName} side: which ${sideName}s contain ${r.e}, and how many ${r.e} atoms are in each formula? Multiply each count by that species’ letter.`);
                }
              }
            }
          }
          r.st.textContent = rowOk ? '✓' : '';
          r.st.parentElement.className = rowOk ? 'ok' : '';
          if (!rowOk) allOk = false;
        }
        if (!allOk) {
          setFeedback(s2.fb, 'bad', msgs.length ? msgs.join('<br>') : 'Fill in both sides for every element.');
          return;
        }
        rows.forEach((r) => { r.L.disabled = true; r.R.disabled = true; });
        b2.disabled = true;
        state.rows = rows.map((r) => ({ e: r.e, L: r.expL, R: r.expR }));
        setFeedback(s2.fb, 'good', 'Inventory is correct. Setting the two sides equal gives your system of equations:');
        s2.fb.append(systemEl());
        s2.done();
        buildStep3();
      }
    }

    function systemEl() {
      const g = el('div', { class: 'eq-system' });
      for (const r of state.rows) {
        g.append(el('span', { class: 'el' }, r.e + ':'), el('span', { html: linearHTML(toRatMap(r.L), state.vars) }),
          el('span', { class: 'eqs' }, '='), el('span', { html: linearHTML(toRatMap(r.R), state.vars) }));
      }
      return g;
    }
    function toRatMap(m) { const o = {}; for (const k in m) o[k] = new Rat(m[k]); return o; }

    // ---------- Step 3 ----------
    function buildStep3() {
      s3.unlock();
      const vars = state.vars;
      const left = el('div');
      const ref = el('div', { class: 'side-ref' }, el('h3', {}, 'Your equations'), systemEl());
      s3.body.append(el('div', { class: 'two-col' }, left, ref));
      const choiceRow = el('div', { class: 'choice-row' });
      left.append(el('div', {}, 'Set this variable equal to 1:'), choiceRow);
      const grid = el('div');
      left.append(grid);
      const hintBox = el('div');
      let inputs = [];
      vars.forEach((v, idx) => {
        const b = el('button', { class: 'choice', onclick: () => choose(idx) }, v);
        choiceRow.append(b);
      });
      function choose(idx) {
        state.k = idx;
        [...choiceRow.children].forEach((b, i) => b.classList.toggle('sel', i === idx));
        grid.innerHTML = ''; hintBox.innerHTML = ''; setFeedback(s3.fb, '', '');
        const vg = el('div', { class: 'var-grid' });
        inputs = vars.map((v, i) => {
          if (i === idx) { vg.append(el('label', {}, el('i', { class: 'var-label' }, v), ' = 1')); return null; }
          const inp = el('input', { type: 'text', autocomplete: 'off' });
          onEnter(inp, check3);
          vg.append(el('label', {}, el('i', { class: 'var-label' }, v), ' =', inp));
          return inp;
        });
        grid.append(vg, el('div', { class: 'row' }, btn('Check values', check3, 'primary'), btn('Hint', hint3)), hintBox);
        const first = inputs.find(Boolean); if (first) first.focus();
      }
      const target = (i) => sol[i].div(sol[state.k]);

      function check3() {
        let allOk = true, parsedAll = true;
        const vals = vars.map((v, i) => {
          if (i === state.k) return new Rat(1);
          const p = C.parseNumber(inputs[i].value);
          if (p == null || p === undefined) { parsedAll = false; inputs[i].classList.add('err'); inputs[i].classList.remove('ok'); allOk = false; return null; }
          const good = p.eq(target(i));
          inputs[i].classList.toggle('ok', good); inputs[i].classList.toggle('err', !good);
          if (!good) allOk = false;
          return p;
        });
        if (allOk) {
          state.values = vals;
          inputs.forEach((i) => i && (i.disabled = true));
          [...choiceRow.children].forEach((b) => (b.disabled = true));
          setFeedback(s3.fb, 'good', 'All values are correct: ' + vars.map((v, i) => `<i>${v}</i> = ${vals[i]}`).join(', ') + '.');
          hintBox.innerHTML = '';
          s3.done();
          buildStep4();
          return;
        }
        if (!parsedAll) { setFeedback(s3.fb, 'bad', 'Enter a number for every variable (whole numbers, fractions like 25/2, or decimals).'); return; }
        // Show which equations fail with the student's values
        const lines = state.rows.map((r) => {
          const side = (m) => Object.keys(m).reduce((acc, v) => acc.add(vals[vars.indexOf(v)].mul(m[v])), new Rat(0));
          const L = side(r.L), R = side(r.R);
          return { r, L, R, ok: L.eq(R) };
        });
        const bad = lines.filter((x) => !x.ok);
        setFeedback(s3.fb, 'bad',
          'Not all values are right yet. Substituting your values into each equation:<br>' +
          lines.map((x) => `<span class="${x.ok ? '' : ''}">${x.ok ? '✓' : '✗'} <b>${x.r.e}</b>: ${x.L} ${x.ok ? '=' : '≠'} ${x.R}</span>`).join('<br>') +
          (bad.length ? '<br>Recheck the variables in the ✗ equations.' : '<br>Every equation balances — but a value of 0 or a different scaling isn’t allowed; check that each value is consistent with ' + `<i>${vars[state.k]}</i> = 1.`));
      }

      function hint3() {
        const known = new Set([state.k]);
        inputs.forEach((inp, i) => { if (inp) { const p = C.parseNumber(inp.value); if (p && p.eq(target(i))) known.add(i); } });
        const unknownIn = (r) => vars.map((v, i) => i).filter((i) => !known.has(i) && ((r.L[vars[i]] || 0) || (r.R[vars[i]] || 0)));
        const one = state.rows.find((r) => unknownIn(r).length === 1);
        let html;
        if (known.size === vars.length) html = 'You already have every value — check them against the equations.';
        else if (one) {
          const u = vars[unknownIn(one)[0]];
          html = `Look at the <b>${one.e}</b> equation: ${linearHTML(toRatMap(one.L), vars)} = ${linearHTML(toRatMap(one.R), vars)}. ` +
            `With the values you already know, it has only one unknown left: <i class="var-label">${u}</i>. Substitute and solve for <i>${u}</i>.`;
        } else {
          const two = state.rows.find((r) => unknownIn(r).length === 2);
          html = 'No single equation has just one unknown. Take an equation with two unknowns' +
            (two ? ` (for example <b>${two.e}</b>: ${linearHTML(toRatMap(two.L), vars)} = ${linearHTML(toRatMap(two.R), vars)})` : '') +
            ', solve it for one variable in terms of the other, and substitute that expression into another equation containing the same variable.';
        }
        hintBox.innerHTML = '';
        hintBox.append(el('div', { class: 'hint-box', html }));
      }
    }

    // ---------- Step 4 ----------
    function buildStep4() {
      s4.unlock();
      const vals = state.values;
      const hasFrac = vals.some((v) => !v.isInt());
      s4.body.append(el('div', { class: 'eqline', html: eqHTML(eq, vals) }));
      if (!hasFrac) {
        state.final = vals.slice();
        setFeedback(s4.fb, 'good', 'No fractions — your coefficients are already whole numbers.');
        s4.done();
        buildStep5();
        return;
      }
      s4.body.prepend(el('p', { class: 'instructions' }, 'Coefficients must be whole numbers. Multiply every coefficient by the same number (the least common denominator) and enter the results.'));
      const ins = [];
      s4.body.append(equationEl(eq, () => { const i = el('input', { type: 'text', class: 'coef-in', autocomplete: 'off' }); ins.push(i); onEnter(i, check4); return i; }));
      const b4 = btn('Check', check4, 'primary');
      s4.body.append(el('div', { class: 'row' }, b4));
      ins[0].focus();
      function check4() {
        const vs = ins.map((i) => C.parseNumber(i.value));
        if (vs.some((v) => v === undefined)) { setFeedback(s4.fb, 'bad', 'Enter whole numbers (a blank box counts as 1).'); return; }
        const res = C.checkCoefficients(eq, vs);
        ins.forEach((i) => i.classList.remove('ok', 'err'));
        if (res.status === 'correct' || res.status === 'multiple') {
          state.final = vs.map((v) => v || new Rat(1));
          ins.forEach((i) => { i.classList.add('ok'); i.disabled = true; });
          b4.disabled = true;
          setFeedback(s4.fb, res.status === 'correct' ? 'good' : 'note',
            res.status === 'correct' ? 'Fractions cleared.' :
              `Fractions cleared. Note: every coefficient can still be divided by ${res.factor} — the smallest whole numbers are preferred.`);
          s4.done();
          buildStep5();
        } else if (res.status === 'fraction') {
          setFeedback(s4.fb, 'bad', 'There is still a fraction. Multiply by a larger number.');
        } else if (res.status === 'nonpositive') {
          setFeedback(s4.fb, 'bad', 'Coefficients must be positive.');
        } else {
          ins.forEach((i) => i.classList.add('err'));
          const L = C.lcmOfDenominators(vals);
          setFeedback(s4.fb, 'bad', `Those don’t keep the same ratio as your values. Multiply <b>every</b> value by the same number — the denominators’ least common multiple is ${L}.`);
        }
      }
    }

    // ---------- Step 5 ----------
    function buildStep5() {
      s5.unlock();
      const fin = state.final;
      s5.body.append(el('div', { class: 'eqline', html: eqHTML(eq, fin) }));
      const truth = C.inventory(eq, fin, 'atoms');
      const table = el('table', { class: 'inv' }, el('tr', {}, el('th', {}, 'Element'), el('th', {}, 'Reactant atoms'), el('th', {}, 'Product atoms'), el('th', {}, '')));
      const rows = truth.map((r) => {
        const L = el('input', { type: 'text', class: 'short', autocomplete: 'off' });
        const R = el('input', { type: 'text', class: 'short', autocomplete: 'off' });
        const st = el('td', { class: 'status' });
        onEnter(L, check5); onEnter(R, check5);
        table.append(el('tr', {}, el('td', { class: 'el' }, r.key), el('td', {}, L), el('td', {}, R), st));
        return { r, L, R, st };
      });
      const bc = btn('Check inventory', check5, 'primary');
      const bs = btn('Submit answer', submit, 'primary'); bs.disabled = true;
      s5.body.append(table, el('div', { class: 'row', style: 'margin-top:12px' }, bc, bs));
      rows[0].L.focus();
      function check5() {
        let ok = true;
        for (const x of rows) {
          let rowOk = true;
          for (const [inp, val] of [[x.L, x.r.left], [x.R, x.r.right]]) {
            const p = C.parseNumber(inp.value);
            const good = p != null && p !== undefined && p.eq(val);
            inp.classList.toggle('ok', good); inp.classList.toggle('err', !good);
            if (!good) rowOk = false;
          }
          x.st.textContent = rowOk ? '✓' : '✗';
          x.st.parentElement.className = rowOk ? 'ok' : 'bad';
          if (!rowOk) ok = false;
        }
        if (ok) {
          setFeedback(s5.fb, 'good', 'Every element has the same number of atoms on both sides. You can submit your answer.');
          bs.disabled = false; bc.disabled = true;
          rows.forEach((x) => { x.L.disabled = true; x.R.disabled = true; });
          bs.focus();
        } else {
          setFeedback(s5.fb, 'bad', 'Some counts are off. For each element: multiply its subscript by the coefficient, then add across the species on that side.');
        }
      }
      function submit() {
        bs.disabled = true;
        s5.done();
        setFeedback(s5.fb, 'good', `<div class="big-win">Balanced!</div><div class="eqline">${eqHTML(eq, fin)}</div>Choose <b>New problem</b> above to try another.`);
        s5.fb.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  // ======================================================================
  // COACHING B — Sequential Inventory
  // ======================================================================
  function buildSIExample() {
    const eq = C.analyze('C8H18 + O2 -> CO2 + H2O');
    const R = (a) => a.map((x) => (x == null ? null : x instanceof Rat ? x : new Rat(x)));
    const stage = (coefs, text, highlight) => () => {
      const inv = C.inventory(eq, R(coefs), 'atoms');
      const balanced = inv.every((r) => r.ok);
      return el('div', {},
        el('p', {}, text),
        el('div', { class: 'math', html: eq.species.map((sp, i) => {
          const sep = i === 0 ? '' : i === eq.nR ? ' &nbsp;<span class="arrowc">→</span>&nbsp; ' : ' + ';
          const c = coefStr(R(coefs)[i]);
          return sep + (c ? `<span class="${highlight === i ? 'hl' : 'coef-text'}">${c}</span> ` : '') + C.formulaHTML(sp.text);
        }).join('') }),
        invTable(inv),
        balanced ? el('p', { class: 'hl' }, 'BALANCED!') : null);
    };
    return exampleStepper('Worked example: isooctane (gasoline) combustion', 'Open to step through the method before you practice', [
      { title: 'Inventory 1 — start with the bare equation', render: stage([null, null, null, null], 'Count every atom on each side with all coefficients equal to 1.') },
      { title: 'Inventory 2 — balance carbon', render: stage([null, null, 8, null], 'Carbon appears in only one species on each side. 8 C on the left, so put 8 in front of CO₂. Take a new inventory.', 2) },
      { title: 'Inventory 3 — balance hydrogen', render: stage([null, null, 8, 9], '18 H on the left; each H₂O has 2 H, so put 9 in front of H₂O. Take a new inventory.', 3) },
      { title: 'Inventory 4 — balance oxygen last', render: stage([null, new Rat(25, 2), 8, 9], 'Oxygen is in O₂ alone, so save it for last. The products have 25 O; O₂ has 2 O each, so put 25/2 in front of O₂.', 1) },
      { title: 'Remove the fraction', render: stage([2, 25, 16, 18], 'Coefficients must be whole numbers. Multiply every coefficient by 2.') },
    ]);
  }

  function initSI(container) {
    container.append(buildSIExample());
    const work = el('div');
    const picker = problemPicker((eq) => runSI(work, eq), 2);
    container.append(picker.root, work);
    picker.pickBank();
  }

  function runSI(work, eq) {
    work.innerHTML = '';
    let mode = 'atoms';
    const ins = [];
    const left = el('div', { class: 'card' });
    const histList = el('div', { class: 'history' });
    const right = el('div', { class: 'card' }, el('h3', {}, 'Inventory history'), el('p', { class: 'instructions', style: 'font-size:.85rem' }, 'A new inventory is recorded each time you change a coefficient.'), histList);
    work.append(el('div', { class: 'si-layout' }, left, right));

    left.append(el('div', { class: 'card-head' }, el('h3', {}, 'Balance by sequential inventory')),
      el('p', { class: 'instructions', html: 'Change one coefficient at a time and watch the inventory. A blank box counts as 1. Fractions such as <b>25/2</b> are allowed while you work.' }));
    left.append(equationEl(eq, () => { const i = el('input', { type: 'text', class: 'coef-in', autocomplete: 'off' }); ins.push(i); return i; }));

    const tableBox = el('div');
    const fb = el('div', { class: 'feedback' });
    let toggleRow = null;
    if (eq.units) {
      const cb = el('input', { type: 'checkbox' });
      cb.addEventListener('change', () => { mode = cb.checked ? 'units' : 'atoms'; update(); });
      toggleRow = el('label', { class: 'toggle' }, cb,
        el('span', { html: 'Shortcut: count ' + eq.units.ions.map((x) => `<b class="inline-eq">${unitLabel(x)}</b>`).join(', ') + ' as single units (they stay intact on both sides)' }));
    }
    left.append(el('div', { class: 'row', style: 'margin:4px 0 10px' }, toggleRow, el('span', { class: 'spacer' }), btn('Reset', reset, 'small ghost')), tableBox, fb);

    let lastSnapshot = null, histCount = 0;
    ins.forEach((i) => {
      i.addEventListener('input', update);
      i.addEventListener('change', record);
      onEnter(i, () => { record(); });
    });

    function readCoefs() {
      const vs = ins.map((i) => C.parseNumber(i.value));
      ins.forEach((i, k) => {
        const bad = vs[k] === undefined || (vs[k] && vs[k].sign() <= 0);
        i.classList.toggle('err', bad);
      });
      if (vs.some((v) => v === undefined || (v && v.sign() <= 0))) return null;
      return vs;
    }
    function update() {
      const vs = readCoefs();
      if (!vs) { setFeedback(fb, 'bad', 'Coefficients must be positive numbers (e.g. 3 or 25/2).'); return; }
      const inv = C.inventory(eq, vs, mode);
      tableBox.innerHTML = '';
      tableBox.append(invTable(inv, { keyHead: mode === 'units' ? 'Atom / unit' : 'Atom' }));
      const atomInv = C.inventory(eq, vs, 'atoms');
      const balanced = atomInv.every((r) => r.ok);
      if (!balanced) {
        const off = inv.filter((r) => !r.ok).map((r) => unitLabel(r.key));
        setFeedback(fb, 'info', `Not balanced yet — ${off.join(', ')} ${off.length === 1 ? 'does' : 'do'} not match.`);
        return;
      }
      const res = C.checkCoefficients(eq, vs);
      if (res.status === 'fraction') {
        const L = C.lcmOfDenominators(vs.map((v) => v || new Rat(1)));
        setFeedback(fb, 'note', `Every atom balances — but there is a fraction. <b>Clear the fraction:</b> multiply every coefficient by ${L}.`);
      } else if (res.status === 'multiple') {
        setFeedback(fb, 'good', `<div class="big-win">Balanced!</div>Note: every coefficient can be divided by ${res.factor}. The smallest whole numbers are preferred.`);
      } else if (res.status === 'correct') {
        setFeedback(fb, 'good', `<div class="big-win">BALANCED!</div><div class="eqline">${eqHTML(eq, vs)}</div>Choose <b>New problem</b> above to try another.`);
      }
    }
    function record() {
      const vs = readCoefs();
      if (!vs) return;
      const snap = vs.map((v) => (v ? v.toString() : '1')).join(',');
      if (snap === lastSnapshot) return;
      lastSnapshot = snap;
      histCount++;
      const inv = C.inventory(eq, vs, mode);
      const item = el('div', { class: 'hist-item' },
        el('div', { class: 'hist-title' }, `Inventory ${histCount}`),
        el('div', { class: 'hist-eq', html: eqHTML(eq, vs) }),
        el('div', { class: 'hist-inv', html: inv.map((r) => `<span class="${r.ok ? 'ok' : 'bad'}">${unitLabel(r.key)}: ${r.left} | ${r.right}</span>`).join('') }));
      histList.prepend(item);
    }
    function reset() {
      ins.forEach((i) => { i.value = ''; i.classList.remove('err'); });
      histList.innerHTML = ''; histCount = 0; lastSnapshot = null;
      update(); record();
      ins[0].focus();
    }
    update(); record();
  }

  // ======================================================================
  // TESTING
  // ======================================================================
  function initTest(container) {
    const stats = store.get('bce.stats', {});
    let level = store.get('bce.level', 1);
    const levelGrid = el('div', { class: 'level-grid' });
    const area = el('div');
    container.append(
      el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('h3', {}, 'Choose a difficulty level')),
        el('p', { class: 'instructions' }, 'Use either method. Enter the coefficients that balance the equation, using the smallest whole numbers. A coefficient of 1 can be typed or left blank.'),
        levelGrid),
      area);
    container.querySelector('.card').classList.remove('locked');

    function renderLevels() {
      levelGrid.innerHTML = '';
      for (let l = 1; l <= 5; l++) {
        const s = stats[l] || {};
        levelGrid.append(el('button', { class: 'level' + (l === level ? ' active' : ''), onclick: () => { level = l; store.set('bce.level', l); renderLevels(); next(); } },
          el('div', { class: 'row' }, el('span', { class: 'lv-num' }, l), el('span', { class: 'spacer' }), el('span', { class: 'dots' }, '●'.repeat(l) + '○'.repeat(5 - l))),
          el('div', { class: 'lv-name' }, LEVELS[l].name),
          el('div', { class: 'lv-desc' }, LEVELS[l].desc),
          el('div', { class: 'lv-stats' }, s.solved ? `${s.solved} solved · ${s.first || 0} first try` : '')));
      }
    }
    function bump(l, k) { stats[l] = stats[l] || {}; stats[l][k] = (stats[l][k] || 0) + 1; store.set('bce.stats', stats); }

    let current = null;
    function next() {
      const p = randomProblem(level, current && current.eq);
      current = p;
      area.innerHTML = '';
      if (!p) { area.append(el('div', { class: 'card' }, 'No problems at this level yet.')); return; }
      runTest(p);
    }

    function runTest(p) {
      const eq = analyzeCached(p.eq);
      let attempts = 0, wrong = 0, hintStage = 0, finished = false, lastVals = null;
      const ins = [];
      const fb = el('div', { class: 'feedback' });
      const hintArea = el('div');
      const meta = el('div', { class: 'test-meta' });
      const checkB = btn('Check', check, 'primary');
      const hintB = btn('Hint', hint);
      const nextB = btn('Skip →', () => next(), 'ghost');
      const c = el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('span', { class: 'step-no' }, `Level ${level} — ${LEVELS[level].name}`), el('span', { class: 'spacer' }), meta),
        equationEl(eq, () => { const i = el('input', { type: 'text', class: 'coef-in', autocomplete: 'off' }); ins.push(i); onEnter(i, check); return i; }),
        el('div', { class: 'row' }, checkB, hintB, el('span', { class: 'spacer' }), nextB),
        fb, hintArea);
      area.append(c);
      ins[0].focus();
      refreshMeta();

      function refreshMeta() {
        meta.textContent = `Attempts: ${attempts}`;
        const labels = ['Hint: inventory of your attempt', 'Hint: reveal one coefficient', 'Show the answer'];
        if (hintStage >= 3 || finished) { hintB.disabled = true; hintB.textContent = 'Hint'; return; }
        if (wrong < 2) { hintB.disabled = true; hintB.textContent = `Hint (unlocks after ${2 - wrong} more ${2 - wrong === 1 ? 'try' : 'tries'})`; }
        else { hintB.disabled = false; hintB.textContent = labels[hintStage]; }
      }

      function check() {
        if (finished) return;
        const vs = ins.map((i) => C.parseNumber(i.value));
        if (vs.some((v) => v === undefined)) { setFeedback(fb, 'bad', 'Enter whole numbers only (blank = 1).'); return; }
        attempts++;
        lastVals = vs;
        const res = C.checkCoefficients(eq, vs);
        ins.forEach((i) => i.classList.remove('ok', 'err'));
        if (res.status === 'correct' || res.status === 'multiple') {
          finished = true;
          ins.forEach((i) => { i.classList.add('ok'); i.disabled = true; });
          bump(level, 'solved'); if (attempts === 1 && hintStage === 0) bump(level, 'first');
          renderLevels();
          const note = res.status === 'multiple'
            ? `<br><b>Note:</b> your coefficients are all divisible by ${res.factor}. The lowest whole-number form is <span class="inline-eq">${eqHTML(eq, eq.solution)}</span>. Counted as correct.` : '';
          setFeedback(fb, res.status === 'correct' ? 'good' : 'note', `<span class="big-win">Correct!</span> ${attempts === 1 ? 'First try.' : `Solved in ${attempts} attempts.`}${note}`);
          checkB.disabled = true; nextB.textContent = 'Next problem →'; nextB.className = 'btn primary'; nextB.focus();
        } else {
          wrong++;
          if (res.status === 'fraction') setFeedback(fb, 'note', 'Every atom balances, but coefficients must be <b>whole numbers</b>. Clear the fraction by multiplying every coefficient by the denominator.');
          else if (res.status === 'nonpositive') setFeedback(fb, 'bad', 'Coefficients must be positive whole numbers.');
          else setFeedback(fb, 'bad', 'Not balanced yet. Try again — take an atom inventory of your answer.');
        }
        refreshMeta();
      }

      function hint() {
        if (wrong < 2 || finished) return;
        if (hintStage === 0) {
          const vs = (lastVals || ins.map(() => null)).map((v) => v || new Rat(1));
          hintArea.append(el('div', { class: 'hint-box' },
            el('div', { html: `<b>Atom inventory of your last attempt</b> (${eqHTML(eq, vs)}):` }),
            invTable(C.inventory(eq, vs, 'atoms'))));
        } else if (hintStage === 1) {
          // reveal coefficient of the species with the most atoms
          let best = 0, bestN = -1;
          eq.species.forEach((sp, i) => { const n = Object.values(sp.counts).reduce((a, b) => a + b, 0); if (n > bestN) { bestN = n; best = i; } });
          ins[best].value = eq.solution[best].toString();
          ins[best].disabled = true; ins[best].classList.add('ok');
          hintArea.append(el('div', { class: 'hint-box', html: `The coefficient of <span class="inline-eq">${C.formulaHTML(eq.species[best].text)}</span> is <b>${eq.solution[best]}</b>. Build the rest from there.` }));
        } else if (hintStage === 2) {
          finished = true;
          bump(level, 'revealed');
          ins.forEach((inp, i) => { inp.value = eq.solution[i].toString(); inp.disabled = true; inp.classList.remove('err'); });
          setFeedback(fb, 'info', `Answer: <span class="inline-eq">${eqHTML(eq, eq.solution)}</span>`);
          checkB.disabled = true; nextB.textContent = 'Next problem →'; nextB.className = 'btn primary';
        }
        hintStage++;
        refreshMeta();
      }
    }

    renderLevels();
    next();
  }

  // ======================================================================
  // INSTRUCTOR
  // ======================================================================
  function initInstructor(container) {
    const custom = () => store.get('bce.custom', []);
    const saveCustom = (list) => { store.set('bce.custom', list); loadBank(); renderCustom(); renderBank(); };

    function validate(text, level) {
      let a;
      try { a = C.analyze(text); } catch (e) { return { error: e.message }; }
      if (!a.solution) return { error: a.error };
      if (!(level >= 1 && level <= 5)) return { error: 'Level must be 1–5.' };
      if (BANK.some((p) => keyOf(p.eq) === keyOf(text))) return { error: 'That equation is already in the bank.', a };
      return { a };
    }

    // ---- Add one problem
    const eqIn = el('input', { type: 'text', placeholder: 'Unbalanced equation, e.g.  Fe + H2O -> Fe3O4 + H2' });
    const lvIn = el('select', {}, [1, 2, 3, 4, 5].map((l) => el('option', { value: l }, `Level ${l} — ${LEVELS[l].name}`)));
    const srcIn = el('input', { type: 'text', placeholder: 'Source (optional)', style: 'max-width:220px' });
    const preview = el('div');
    const addFb = el('div', { class: 'feedback' });
    const addB = btn('Add to bank', add, 'primary'); addB.disabled = true;
    function doPreview() {
      preview.innerHTML = '';
      addB.disabled = true;
      const t = eqIn.value.trim();
      if (!t) { setFeedback(addFb, '', ''); return; }
      const v = validate(t, +lvIn.value);
      if (v.a && v.a.solution) preview.append(el('div', { class: 'eqline', html: eqHTML(v.a, v.a.solution) }));
      if (v.error) { setFeedback(addFb, 'bad', esc(v.error)); return; }
      const u = v.a.units ? ` Polyatomic shortcut available for: ${v.a.units.ions.map(unitLabel).join(', ')}.` : '';
      setFeedback(addFb, 'good', `Balances uniquely. Coefficients: ${v.a.solution.join(', ')}.${u}`);
      addB.disabled = false;
    }
    function add() {
      const t = eqIn.value.trim();
      const v = validate(t, +lvIn.value);
      if (v.error) { setFeedback(addFb, 'bad', esc(v.error)); return; }
      const list = custom(); list.push({ eq: t, level: +lvIn.value, src: srcIn.value.trim() || 'Instructor' });
      saveCustom(list);
      setFeedback(addFb, 'good', 'Added. It is now available in Coaching and Testing on this computer.');
      eqIn.value = ''; preview.innerHTML = ''; addB.disabled = true;
    }
    eqIn.addEventListener('input', doPreview); lvIn.addEventListener('change', doPreview);
    onEnter(eqIn, () => { if (!addB.disabled) add(); });

    // ---- Upload
    const file = el('input', { type: 'file', accept: '.csv,.tsv,.txt' });
    const log = el('div', { class: 'upload-log' });
    file.addEventListener('change', () => {
      const f = file.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => importText(String(reader.result));
      reader.readAsText(f);
    });
    function splitRow(line) {
      const delim = line.includes('\t') ? '\t' : ',';
      const out = []; let cur = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === delim && !q) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    }
    function importText(text) {
      log.innerHTML = '';
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const list = custom(); let added = 0;
      lines.forEach((line, n) => {
        const [eqT, lvT, srcT] = splitRow(line);
        if (n === 0 && /equation/i.test(eqT || '')) return; // header
        const lv = parseInt(lvT, 10);
        const v = validate(eqT || '', lv);
        if (!v.error && list.some((p) => keyOf(p.eq) === keyOf(eqT))) v.error = 'Duplicate in this file.';
        if (v.error) { log.append(el('div', { class: 'bad' }, `Row ${n + 1}: ${eqT || '(blank)'} — ${v.error}`)); return; }
        list.push({ eq: eqT, level: lv, src: srcT || 'Instructor upload' }); added++;
        log.append(el('div', { class: 'ok' }, `Row ${n + 1}: ${eqT} — added (level ${lv}; ${v.a.solution.join(', ')})`));
      });
      saveCustom(list);
      log.prepend(el('div', {}, el('b', {}, `${added} problem${added === 1 ? '' : 's'} added.`)));
      file.value = '';
    }

    // ---- Custom list + export
    const customBox = el('div');
    function renderCustom() {
      customBox.innerHTML = '';
      const list = custom();
      if (!list.length) { customBox.append(el('p', { class: 'instructions' }, 'No problems added yet.')); return; }
      const t = el('table', { class: 'bank' }, el('tr', {}, el('th', {}, 'Level'), el('th', {}, 'Equation'), el('th', {}, 'Source'), el('th', {}, '')));
      list.forEach((p, i) => {
        t.append(el('tr', {}, el('td', {}, p.level), el('td', { class: 'eqcell', html: C.formulaHTML ? eqHTML(analyzeCached(p.eq), null) : esc(p.eq) }), el('td', {}, p.src),
          el('td', {}, btn('Remove', () => { const l = custom(); l.splice(i, 1); saveCustom(l); }, 'small'))));
      });
      customBox.append(el('div', { class: 'bank-wrap', style: 'max-height:260px' }, t));
    }
    function download(name, text, type) {
      const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
      document.body.append(a); a.click(); a.remove();
    }
    function exportProblemsJs() {
      const builtIn = (window.PROBLEM_BANK || []).map((p) => ({ eq: p.eq, level: p.level, src: p.src }));
      const seen = new Set(builtIn.map((p) => keyOf(p.eq)));
      const merged = builtIn.concat(custom().filter((p) => !seen.has(keyOf(p.eq))).map((p) => ({ eq: p.eq, level: p.level, src: p.src })));
      merged.sort((a, b) => a.level - b.level);
      const body = merged.map((p) => `    { eq: ${JSON.stringify(p.eq)}, level: ${p.level}, src: ${JSON.stringify(p.src || '')} },`).join('\n');
      const text = `/* Built-in problem bank (exported from the Instructor page ${new Date().toISOString().slice(0, 10)}).
 * Each entry: { eq: "unbalanced equation", level: 1-5, src: "source tag" }
 * Coefficients are NOT stored — the tool computes them.
 */
(function (root) {
  const PROBLEM_BANK = [
${body}
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = PROBLEM_BANK;
  else root.PROBLEM_BANK = PROBLEM_BANK;
})(typeof window !== 'undefined' ? window : globalThis);
`;
      download('problems.js', text, 'text/javascript');
    }
    function exportCsv() {
      const rows = [['equation', 'level', 'source']].concat(BANK.map((p) => [p.eq, p.level, p.src]));
      download('balancing-problems.csv', rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
    }

    // ---- Full bank
    const filt = el('select', {}, el('option', { value: 0 }, 'All levels'), [1, 2, 3, 4, 5].map((l) => el('option', { value: l }, `Level ${l}`)));
    const bankBox = el('div');
    filt.addEventListener('change', renderBank);
    function renderBank() {
      bankBox.innerHTML = '';
      const lv = +filt.value;
      const list = BANK.filter((p) => !lv || p.level === lv);
      const t = el('table', { class: 'bank' }, el('tr', {}, el('th', {}, 'Lvl'), el('th', {}, 'Balanced equation'), el('th', {}, 'Source')));
      for (const p of list) {
        const a = analyzeCached(p.eq);
        t.append(el('tr', {}, el('td', {}, p.level),
          el('td', { class: 'eqcell', html: a.solution ? eqHTML(a, a.solution) : esc(p.eq + ' — ' + a.error) }),
          el('td', {}, el('span', { class: 'pill' + (p.custom ? ' custom' : '') }, p.custom ? 'Added: ' + p.src : p.src))));
      }
      bankBox.append(el('p', { class: 'instructions' }, `${list.length} problem${list.length === 1 ? '' : 's'}`), el('div', { class: 'bank-wrap' }, t));
    }

    const mk = (title, ...kids) => { const c = el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h3', {}, title)), ...kids); return c; };
    container.append(
      el('div', { class: 'grid2' },
        mk('Add a problem',
          el('p', { class: 'instructions' }, 'Type only the unbalanced equation. The tool computes the answer and rejects equations that cannot be balanced or that balance more than one way. Parentheses, hydrates (CuSO4·5H2O or CuSO4*5H2O) and states like (aq) are fine.'),
          el('div', { class: 'form-row' }, eqIn),
          el('div', { class: 'form-row' }, lvIn, srcIn, addB),
          preview, addFb),
        mk('Upload a spreadsheet',
          el('p', { class: 'instructions', html: 'One problem per row: <code>equation, level, source</code> (source optional; a header row is fine). From Excel, use <i>File → Save As → CSV</i> or <i>Text (Tab delimited)</i>.' }),
          el('div', { class: 'form-row' }, file), log)),
      mk('Problems you have added',
        el('p', { class: 'instructions', html: 'Added problems are saved <b>in this browser only</b>. To give them to every student, click <b>Download problems.js</b> and upload that file to the repository’s <code>js</code> folder, replacing the existing <code>problems.js</code>.' }),
        el('div', { class: 'row', style: 'margin-bottom:10px' }, btn('Download problems.js', exportProblemsJs, 'primary'), btn('Download full bank as CSV', exportCsv)),
        customBox),
      mk('Full problem bank (with answers)', el('div', { class: 'row', style: 'margin-bottom:8px' }, filt), bankBox));
    container.querySelectorAll('.card').forEach((c) => c.classList.remove('locked'));
    renderCustom(); renderBank();
  }

  // ======================================================================
  // Boot
  // ======================================================================
  loadBank();
  const isInstructor = /[?&#]instructor\b/.test(location.search + location.hash);
  if (isInstructor) document.getElementById('instructorTab').classList.remove('hidden');

  const inited = {};
  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + name));
    if (!inited[name]) {
      inited[name] = true;
      if (name === 'test') initTest(document.getElementById('tab-test'));
      if (name === 'instructor') initInstructor(document.getElementById('tab-instructor'));
    }
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  function showMethod(m) {
    document.querySelectorAll('.method').forEach((b) => b.classList.toggle('active', b.dataset.method === m));
    document.getElementById('coach-vs').classList.toggle('hidden', m !== 'vs');
    document.getElementById('coach-si').classList.toggle('hidden', m !== 'si');
    if (!inited[m]) { inited[m] = true; (m === 'vs' ? initVS : initSI)(document.getElementById('coach-' + m)); }
  }
  document.querySelectorAll('.method').forEach((b) => b.addEventListener('click', () => showMethod(b.dataset.method)));

  showMethod('vs');
  if (isInstructor) showTab('instructor');
})();
