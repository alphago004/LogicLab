// ════════════════════════════════════════════════════════
// BOOLEAN ALGEBRA — Parser, evaluator, UI
// ════════════════════════════════════════════════════════

const BOOL_EXAMPLES = [
  'A AND B',
  'A OR B',
  'NOT A',
  '(A AND B) OR C',
  'A XOR B',
  'NOT (A AND B)',
  '(A OR B) AND (B OR C)',
  'A AND (B OR C) AND NOT D',
];

// ── Parser ───────────────────────────────────────────────
// Recursive-descent parser: OR > XOR > AND > NOT > primary
// Supports: AND, OR, NOT, XOR, &, |, !, ^, &&, ||

class BooleanParser {
  constructor(src) {
    const normalized = src.toUpperCase()
      .replace(/&&/g,    ' AND ')
      .replace(/\|\|/g,  ' OR ')
      .replace(/!/g,     ' NOT ')
      .replace(/&(?!&)/g,' AND ')
      .replace(/\|(?!\|)/g,' OR ')
      .replace(/\^/g,    ' XOR ');

    this.tokens = this._lex(normalized);
    this.pos    = 0;
  }

  _lex(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      if (/\s/.test(src[i])) { i++; continue; }
      if (src[i] === '(' || src[i] === ')') { tokens.push(src[i++]); continue; }
      if (/[A-Z]/.test(src[i])) {
        let word = '';
        while (i < src.length && /[A-Z0-9]/.test(src[i])) word += src[i++];
        tokens.push(word);
        continue;
      }
      throw new Error('Unknown character: ' + src[i]);
    }
    return tokens;
  }

  _peek() { return this.tokens[this.pos]; }
  _eat()  { return this.tokens[this.pos++]; }

  parse() {
    const expr = this._or();
    if (this.pos < this.tokens.length) throw new Error('Unexpected token: ' + this._peek());
    return expr;
  }

  _or() {
    let left = this._xor();
    while (this._peek() === 'OR') {
      this._eat();
      const right = this._xor();
      const l = left;
      left = env => l(env) | right(env);
    }
    return left;
  }

  _xor() {
    let left = this._and();
    while (this._peek() === 'XOR') {
      this._eat();
      const right = this._and();
      const l = left;
      left = env => l(env) ^ right(env);
    }
    return left;
  }

  _and() {
    let left = this._not();
    while (this._peek() === 'AND') {
      this._eat();
      const right = this._not();
      const l = left;
      left = env => l(env) & right(env);
    }
    return left;
  }

  _not() {
    if (this._peek() === 'NOT') {
      this._eat();
      const operand = this._not();
      return env => operand(env) ^ 1;
    }
    return this._primary();
  }

  _primary() {
    if (this._peek() === '(') {
      this._eat();
      const expr = this._or();
      if (this._peek() !== ')') throw new Error('Expected )');
      this._eat();
      return expr;
    }
    const token = this._peek();
    if (token && /^[A-Z]$/.test(token)) {
      this._eat();
      return env => env[token] || 0;
    }
    throw new Error('Expected variable or (, got: ' + (token || 'end'));
  }
}

// ── Evaluation ───────────────────────────────────────────

function evalBool() {
  const src      = document.getElementById('bool-in').value.trim();
  const errEl    = document.getElementById('bool-err');
  const inputEl  = document.getElementById('bool-in');

  errEl.style.display = 'none';
  inputEl.classList.remove('err');

  if (!src) { clearBoolResult(); return; }

  try {
    const fn   = new BooleanParser(src).parse();
    const vars = [...new Set((src.toUpperCase().match(/\b[A-Z]\b/g) || []))].sort();

    if (!vars.length)    throw new Error('No single-letter variables found (A–Z).');
    if (vars.length > 5) throw new Error('Max 5 variables supported.');

    const rowCount = 1 << vars.length;
    const truths   = [];

    // Build table HTML
    let html = '<table class="btbl"><thead><tr>';
    vars.forEach(v => { html += `<th>${v}</th>`; });
    html += `<th class="rcol">${src.length > 22 ? 'F' : src}</th></tr></thead><tbody>`;

    for (let i = 0; i < rowCount; i++) {
      const env = {};
      vars.forEach((v, j) => { env[v] = (i >> (vars.length - 1 - j)) & 1; });
      const result = fn(env) ? 1 : 0;

      if (result) truths.push(vars.map(v => `${v}=${env[v]}`).join(', '));

      html += '<tr>';
      vars.forEach(v => { html += `<td class="v${env[v]}">${env[v]}</td>`; });
      html += `<td class="r${result}">${result}</td></tr>`;
    }
    html += '</tbody></table>';

    // Render table
    document.getElementById('bool-tbl-wrap').innerHTML  = html;
    document.getElementById('bool-tbl-title').textContent = `Truth Table — ${rowCount} rows`;

    // Render analysis panel
    document.getElementById('bi-vars').innerHTML = vars.map(v => `<span class="c">${v}</span>`).join('  ');
    document.getElementById('bi-rows').innerHTML = `<span class="g">${rowCount}</span>`;

    let truthHTML;
    if (!truths.length) {
      truthHTML = '<span style="color:var(--red)">Never (contradiction)</span>';
    } else if (truths.length === rowCount) {
      truthHTML = '<span style="color:var(--green)">Always (tautology)</span>';
    } else {
      truthHTML = truths.slice(0, 6).map(t => `<span class="c" style="display:block">${t}</span>`).join('');
      if (truths.length > 6) truthHTML += `<span style="color:var(--text3)">+${truths.length - 6} more</span>`;
    }
    document.getElementById('bi-truths').innerHTML = truthHTML;

  } catch (e) {
    errEl.textContent   = '⚠ ' + e.message;
    errEl.style.display = 'block';
    inputEl.classList.add('err');
  }
}

function clearBool() {
  document.getElementById('bool-in').value        = '';
  document.getElementById('bool-err').style.display = 'none';
  document.getElementById('bool-in').classList.remove('err');
  clearBoolResult();
}

function clearBoolResult() {
  document.getElementById('bool-tbl-wrap').innerHTML      = '';
  document.getElementById('bool-tbl-title').textContent   = 'Truth Table';
  ['bi-vars', 'bi-rows', 'bi-truths'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
}

// ── Init ─────────────────────────────────────────────────

function initBoolPills() {
  const wrap = document.getElementById('bool-pills');
  BOOL_EXAMPLES.forEach(ex => {
    const pill     = document.createElement('span');
    pill.className = 'epill';
    pill.textContent = ex;
    pill.onclick   = () => {
      document.getElementById('bool-in').value = ex;
      evalBool();
    };
    wrap.appendChild(pill);
  });
}

function initBoolKeyboard() {
  document.getElementById('bool-in').addEventListener('keydown', e => {
    if (e.key === 'Enter') evalBool();
  });
}
