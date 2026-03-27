// ════════════════════════════════════════════════════════
// FINITE AUTOMATA — Interactive DFA Builder + Simulator
// ════════════════════════════════════════════════════════

const DFAS = [
  {
    title: "Ends in '1'",
    desc:  "Accepts binary strings that end with the digit 1. The machine remembers only the last character seen.",
    alpha: "Σ = { 0, 1 }",
    start: 'q0',
    states: [ {id:'q0',rx:.22,ry:.5,acc:false}, {id:'q1',rx:.75,ry:.5,acc:true} ],
    trans:  [ {f:'q0',t:'q0',l:'0'},{f:'q0',t:'q1',l:'1'},{f:'q1',t:'q0',l:'0'},{f:'q1',t:'q1',l:'1'} ],
  },
  {
    title: "Even number of 1s",
    desc:  "Accepts binary strings containing an even number of 1s (zero counts as even).",
    alpha: "Σ = { 0, 1 }",
    start: 'q0',
    states: [ {id:'q0',rx:.22,ry:.5,acc:true,lbl:'q0\neven'}, {id:'q1',rx:.75,ry:.5,acc:false,lbl:'q1\nodd'} ],
    trans:  [ {f:'q0',t:'q0',l:'0'},{f:'q0',t:'q1',l:'1'},{f:'q1',t:'q1',l:'0'},{f:'q1',t:'q0',l:'1'} ],
  },
  {
    title: "Contains substring 'ab'",
    desc:  "Accepts strings over {a,b} containing 'ab'. Once 'ab' is seen, stays in the accept state.",
    alpha: "Σ = { a, b }",
    start: 'q0',
    states: [
      {id:'q0',rx:.18,ry:.5,acc:false},
      {id:'q1',rx:.5, ry:.5,acc:false,lbl:'q1\n(saw a)'},
      {id:'q2',rx:.82,ry:.5,acc:true, lbl:'q2\n(ab✓)'},
    ],
    trans: [ {f:'q0',t:'q1',l:'a'},{f:'q0',t:'q0',l:'b'},{f:'q1',t:'q1',l:'a'},{f:'q1',t:'q2',l:'b'},{f:'q2',t:'q2',l:'a'},{f:'q2',t:'q2',l:'b'} ],
  },
  {
    title: "Binary divisible by 3",
    desc:  "Accepts binary strings whose value mod 3 = 0. States represent remainders 0, 1, 2.",
    alpha: "Σ = { 0, 1 }",
    start: 'q0',
    states: [
      {id:'q0',rx:.22,ry:.28,acc:true, lbl:'q0\n(r=0)'},
      {id:'q1',rx:.78,ry:.28,acc:false,lbl:'q1\n(r=1)'},
      {id:'q2',rx:.5, ry:.75,acc:false,lbl:'q2\n(r=2)'},
    ],
    trans: [ {f:'q0',t:'q0',l:'0'},{f:'q0',t:'q1',l:'1'},{f:'q1',t:'q2',l:'0'},{f:'q1',t:'q0',l:'1'},{f:'q2',t:'q1',l:'0'},{f:'q2',t:'q2',l:'1'} ],
  },
];

// ── State ─────────────────────────────────────────────────
let activeDFA = null;
let isCustom  = false;
let isNFA     = false;   // NFA mode: multiple transitions per symbol allowed
let nfaStates = new Set(); // active states set for NFA simulation

let bMode      = 'select';
let bSelId     = null;
let bTransSrc  = null;
let bPendTrans = null;

let dfaIdx   = 0;
let dfaState = null;
let dfaStr   = '';
let dfaStep  = 0;
let dfaTimer = null;

let _stateCounter = 0;
let _dfaSvg, _transG, _stateG;
let _W = 600, _H = 400;
let _prevNfaStates = new Set(); // NFA: states active before last step
const SR = 36;

// ── Init ──────────────────────────────────────────────────
function initDFASvg() {
  _dfaSvg = d3.select('#dfaCanvas');

  // Build SVG defs programmatically — d3.html() doesn't work on SVG elements
  const defs = _dfaSvg.append('defs');

  const mkMarker = (id, color) => {
    defs.append('marker')
      .attr('id', id)
      .attr('viewBox','0 0 10 10')
      .attr('refX', 9).attr('refY', 5)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient','auto-start-reverse')
      .append('path').attr('d','M0,1 L0,9 L9,5 Z').attr('fill', color);
  };
  mkMarker('dfa-ah',     '#2a3d5a');
  mkMarker('dfa-ah-on',  '#00e5ff');
  mkMarker('dfa-ah-nfa', '#bd93f9');

  _dfaSvg.append('rect').attr('class','dfa-bg-rect')
    .attr('x',0).attr('y',0).attr('width','100%').attr('height','100%')
    .attr('fill','#05080f')
    .on('click', onBgClick)
    .on('contextmenu', e => e.preventDefault());

  _dfaSvg.append('g').attr('class','dfa-grid-g');
  _transG = _dfaSvg.append('g').attr('class','dfa-trans-g');
  _stateG = _dfaSvg.append('g').attr('class','dfa-state-g');

  new ResizeObserver(() => drawDFA()).observe(_dfaSvg.node().parentElement);

  document.addEventListener('keydown', e => {
    if (!document.getElementById('tab-dfa').classList.contains('active')) return;
    if (e.key === 'Escape') { bTransSrc=null; cancelLabel(); renderDFA(); }
    if ((e.key==='Delete'||e.key==='Backspace') && bSelId && isCustom) {
      e.preventDefault(); deleteState(bSelId);
    }
  });

  buildBuilderToolbar();
}

// ── Builder toolbar ───────────────────────────────────────
function buildBuilderToolbar() {
  const bar = document.getElementById('dfa-builder-bar');
  if (!bar) return;
  bar.innerHTML = `
    <button class="bmode-btn active" data-m="select"   onclick="setBuilderMode('select',this)">↖ Select</button>
    <button class="bmode-btn"        data-m="addState" onclick="setBuilderMode('addState',this)">◯ Add State</button>
    <button class="bmode-btn"        data-m="addTrans" onclick="setBuilderMode('addTrans',this)">→ Add Transition</button>
    <button class="bmode-btn danger" data-m="del"      onclick="setBuilderMode('del',this)">✕ Delete</button>
    <div class="builder-sep"></div>
    <span class="builder-hint" id="builder-hint">Click a state to select it</span>
    <div class="builder-sep"></div>
    <span class="builder-mode-tag" id="builder-mode-tag">DFA</span>
  `;
}

function setBuilderMode(m, btn) {
  bMode=m; bTransSrc=null; cancelLabel();
  document.querySelectorAll('.bmode-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const hints = {
    select:   'Click state to select · Drag to move · Right-click for options',
    addState: 'Click the canvas to place a new state',
    addTrans: 'Click source state, then destination state',
    del:      'Click a state or transition arrow to delete it',
  };
  const h = document.getElementById('builder-hint');
  if (h) h.textContent = hints[m]||'';
  _dfaSvg && _dfaSvg.select('.dfa-bg-rect').style('cursor', m==='addState'?'crosshair':'default');
  renderDFA();
}

// ── Load DFA ──────────────────────────────────────────────
function loadDFA() {
  dfaIdx = parseInt(document.getElementById('dfa-sel').value);
  const bar = document.getElementById('dfa-builder-bar');

  if (dfaIdx === 4 || dfaIdx === 5) {
    isCustom = true;
    isNFA    = dfaIdx === 5;
    if (bar) bar.style.display = 'flex';
    activeDFA = {
      title: isNFA ? 'Custom NFA' : 'Custom DFA',
      desc:  isNFA ? 'NFA mode — multiple transitions per symbol allowed. Simulator explores ALL paths.' : 'Build your own DFA using the toolbar above.',
      alpha: 'Σ = { define your own }', start:null, states:[], trans:[],
    };
    _stateCounter=0; bSelId=null; bTransSrc=null; bPendTrans=null;
    // Update builder bar label
    const modeTag = document.getElementById('builder-mode-tag');
    if (modeTag) {
      modeTag.textContent = isNFA ? 'NFA' : 'DFA';
      modeTag.classList.toggle('nfa', isNFA);
    }
    const addBtn = document.querySelector('.bmode-btn[data-m="addState"]');
    setBuilderMode('addState', addBtn);
  } else {
    isCustom=false; isNFA=false;
    if (bar) bar.style.display='none';
    bMode='select'; bSelId=null; bTransSrc=null; bPendTrans=null;
    const p = DFAS[dfaIdx];
    activeDFA = {
      title:p.title, desc:p.desc, alpha:p.alpha, start:p.start,
      states:p.states.map(s=>({...s})),
      trans: p.trans.map(t=>({...t})),
    };
  }

  document.getElementById('dfa-dtitle').textContent = activeDFA.title;
  document.getElementById('dfa-dtext').textContent  = activeDFA.desc;
  document.getElementById('dfa-alpha').textContent  = activeDFA.alpha;
  resetDFA();
}

// ── Simulation ────────────────────────────────────────────
function resetDFA() {
  if (dfaTimer) { clearTimeout(dfaTimer); dfaTimer=null; }
  if (isNFA) {
    nfaStates     = activeDFA?.start ? new Set([activeDFA.start]) : new Set();
    _prevNfaStates = new Set();
    dfaState      = null;
  } else {
    dfaState  = activeDFA ? activeDFA.start : null;
    nfaStates = new Set();
  }
  dfaStr  = document.getElementById('dfa-str').value;
  dfaStep = 0;
  document.getElementById('log-entries').innerHTML = '';
  const badge = document.getElementById('dfa-badge');
  badge.className='dfa-badge'; badge.textContent='';
  updateStrViz(); drawDFA();
}

function stepDFA() {
  if (!activeDFA) return;
  if (isNFA) { _stepNFA(); return; }
  if (dfaStep >= dfaStr.length) { showResult(); return; }
  const sym=dfaStr[dfaStep], prev=dfaState;
  const t=activeDFA.trans.find(tr => tr.f===prev && tr.l===sym);
  if (!t) {
    addLog(dfaStep+1,`δ(${prev}, '${sym}') = ∅ — no transition`,'rej');
    dfaState=null; dfaStep=dfaStr.length; showResult(); return;
  }
  dfaState=t.t; dfaStep++;
  addLog(dfaStep,`δ(${prev}, '${sym}')  →  ${dfaState}`,'cur');
  updateStrViz(); drawDFA();
  if (dfaStep >= dfaStr.length) setTimeout(showResult, 350);
}

function _stepNFA() {
  if (dfaStep >= dfaStr.length) { showResult(); return; }
  const sym = dfaStr[dfaStep];
  _prevNfaStates = new Set(nfaStates);
  const prev = _prevNfaStates;
  const next = new Set();
  prev.forEach(st => {
    activeDFA.trans.filter(t=>t.f===st&&t.l===sym).forEach(t=>next.add(t.t));
  });
  dfaStep++;
  if (next.size === 0) {
    nfaStates = next;
    addLog(dfaStep,`δ({${[...prev].join(',')}}, '${sym}') = ∅ — dead end`,'rej');
    dfaStep = dfaStr.length; showResult(); return;
  }
  nfaStates = next;
  addLog(dfaStep,`δ({${[...prev].join(',')}}, '${sym}') → {${[...next].join(',')}}`,'cur');
  updateStrViz(); drawDFA();
  if (dfaStep >= dfaStr.length) setTimeout(showResult, 350);
}

function runDFA() {
  resetDFA();
  const speed=parseInt(document.getElementById('dfa-speed').value);
  let s=0;
  const tick=()=>{ if(s>=dfaStr.length){showResult();return;} stepDFA(); s++; dfaTimer=setTimeout(tick,speed); };
  dfaTimer=setTimeout(tick,120);
}

function showResult() {
  if (!activeDFA) return;
  let ok;
  if (isNFA) {
    ok = [...nfaStates].some(s=>activeDFA.states.find(q=>q.id===s&&q.acc));
    const badge=document.getElementById('dfa-badge');
    badge.className='dfa-badge '+(ok?'acc':'rej');
    badge.textContent=ok?'✓ ACCEPTED':'✗ REJECTED';
    const accepting=[...nfaStates].filter(s=>activeDFA.states.find(q=>q.id===s&&q.acc));
    addLog('—', ok
      ? `Accept state(s) {${accepting.join(',')}} reached → ACCEPTED`
      : `No accept state in {${[...nfaStates].join(',')}} → REJECTED`,
      ok?'acc':'rej');
  } else {
    const st=activeDFA.states.find(s=>s.id===dfaState); ok=st&&st.acc;
    const badge=document.getElementById('dfa-badge');
    badge.className='dfa-badge '+(ok?'acc':'rej');
    badge.textContent=ok?'✓ ACCEPTED':'✗ REJECTED';
    addLog('—', ok?`State ${dfaState} is an accept state → ACCEPTED`:`State ${dfaState||'∅'} is not an accept state → REJECTED`, ok?'acc':'rej');
  }
  drawDFA();
}

// ── Log & Viz ─────────────────────────────────────────────
function addLog(step, msg, cls='') {
  const c=document.getElementById('log-entries');
  const e=document.createElement('div');
  e.className='log-entry '+cls;
  e.innerHTML=`<span class="log-n">${step}</span><span>${msg}</span>`;
  c.appendChild(e); c.scrollTop=c.scrollHeight;
}

function updateStrViz() {
  const viz=document.getElementById('str-viz');
  if (!dfaStr) { viz.innerHTML='<span class="str-viz-empty">Enter input string above</span>'; return; }
  viz.innerHTML='';
  for (let i=0;i<dfaStr.length;i++) {
    const span=document.createElement('span');
    span.className='sc '+(i<dfaStep?'done':i===dfaStep?'cur':'rem');
    span.textContent=dfaStr[i]; viz.appendChild(span);
  }
  if (dfaStep>=dfaStr.length && dfaStr.length>0) {
    const d=document.createElement('span');
    d.style.cssText='font-family:var(--mono);font-size:0.62rem;color:var(--text3);margin-left:0.4rem;align-self:center';
    d.textContent='done'; viz.appendChild(d);
  }
}

// ── Render ────────────────────────────────────────────────
function drawDFA() {
  if (!_dfaSvg||!activeDFA) return;
  const wrap = _dfaSvg.node().parentElement;
  _W = (wrap && wrap.clientWidth)  || 600;
  _H = (wrap && wrap.clientHeight) || 400;
  // Set explicit SVG dimensions so the coordinate space matches
  _dfaSvg.attr('width', _W).attr('height', _H);
  _drawGrid(); renderDFA();
}

function renderDFA() {
  if (!_dfaSvg||!activeDFA) return;
  _renderTransitions(); _renderStates();
}

function _drawGrid() {
  const g=_dfaSvg.select('.dfa-grid-g'); g.selectAll('*').remove();
  for (let x=0;x<=_W;x+=40)
    g.append('line').attr('x1',x).attr('y1',0).attr('x2',x).attr('y2',_H).attr('stroke','rgba(26,40,64,0.22)').attr('stroke-width',1);
  for (let y=0;y<=_H;y+=40)
    g.append('line').attr('x1',0).attr('y1',y).attr('x2',_W).attr('y2',y).attr('stroke','rgba(26,40,64,0.22)').attr('stroke-width',1);
}

// Position from ratio
function sp(s) { return {x:s.rx*_W, y:s.ry*_H}; }

// Active transition detection
function _prevFrom() {
  if (dfaStep<=0||!activeDFA) return activeDFA?activeDFA.start:null;
  let st=activeDFA.start;
  for (let i=0;i<dfaStep-1;i++) {
    const t=activeDFA.trans.find(r=>r.f===st&&r.l===dfaStr[i]);
    if(t) st=t.t; else return null;
  }
  return st;
}
function _isActiveTrans(f,t) {
  if (dfaStep<=0) return false;
  if (isNFA) return _prevNfaStates.has(f) && nfaStates.has(t);
  return f===_prevFrom() && t===dfaState;
}

// Path helpers
function _selfLoopPath(cx,cy) {
  const a=0.32*Math.PI, sx=cx-SR*Math.sin(a), sy=cy-SR*Math.cos(a), ex=cx+SR*Math.sin(a), ey=cy-SR*Math.cos(a);
  return { d:`M ${sx} ${sy} C ${cx-SR*0.9} ${cy-SR-55} ${cx+SR*0.9} ${cy-SR-55} ${ex} ${ey}`, lx:cx, ly:cy-SR-63 };
}
function _arrowPath(x1,y1,x2,y2,curved,above) {
  const dx=x2-x1,dy=y2-y1,dist=Math.hypot(dx,dy);
  if (dist<1) return {d:'',lx:x1,ly:y1};
  const nx=dx/dist,ny=dy/dist;
  const sx=x1+nx*SR, sy=y1+ny*SR, ex=x2-nx*(SR+2), ey=y2-ny*(SR+2);
  if (curved) {
    const perp=Math.min(95,dist*0.42)*(above?-1:1);
    const cpx=(sx+ex)/2+(-ny*perp), cpy=(sy+ey)/2+(nx*perp);
    return {d:`M ${sx} ${sy} Q ${cpx} ${cpy} ${ex} ${ey}`, lx:0.25*sx+0.5*cpx+0.25*ex, ly:0.25*sy+0.5*cpy+0.25*ey};
  }
  return {d:`M ${sx} ${sy} L ${ex} ${ey}`, lx:(sx+ex)/2-ny*16, ly:(sy+ey)/2+nx*16};
}

// ── Transitions ───────────────────────────────────────────
function _renderTransitions() {
  if (!activeDFA) return;

  // Group by (f,t) pair and detect bidirectional
  const groups={};
  activeDFA.trans.forEach(tr=>{
    const k=`${tr.f}||${tr.t}`;
    if (!groups[k]) groups[k]={f:tr.f,t:tr.t,labels:[],trs:[]};
    groups[k].labels.push(tr.l); groups[k].trs.push(tr);
  });
  const hasBoth=(f,t)=>groups[`${f}||${t}`]&&groups[`${t}||${f}`];

  const gData=Object.values(groups).map(g=>{
    const from=activeDFA.states.find(s=>s.id===g.f);
    const to  =activeDFA.states.find(s=>s.id===g.t);
    if (!from||!to) return null;
    const fp=sp(from),tp=sp(to);
    const active=_isActiveTrans(g.f,g.t);
    const pi=g.f===g.t ? _selfLoopPath(fp.x,fp.y)
                       : _arrowPath(fp.x,fp.y,tp.x,tp.y,hasBoth(g.f,g.t),g.f<g.t);
    return {...g,active,pi};
  }).filter(Boolean);

  const delMode=isCustom&&bMode==='del';

  const _arrowColor = d => d.active ? (isNFA ? '#bd93f9' : '#00e5ff') : '#243352';
  const _markerSfx  = d => d.active ? (isNFA ? '-nfa' : '-on') : '';

  // Paths
  _transG.selectAll('path.dfa-arrow')
    .data(gData, d=>`${d.f}||${d.t}`)
    .join('path').attr('class','dfa-arrow')
    .attr('d',d=>d.pi.d)
    .attr('fill','none')
    .attr('stroke',_arrowColor)
    .attr('stroke-width',d=>d.active?2.5:1.5)
    .attr('marker-end',d=>`url(#dfa-ah${_markerSfx(d)})`)
    .style('cursor',delMode?'pointer':'default')
    .on('click',(e,d)=>{ if(!delMode) return; e.stopPropagation(); _deleteTrans(d); });

  // Labels
  const lblGs=_transG.selectAll('g.dfa-tlbl')
    .data(gData.filter(d=>d.pi.d), d=>`lbl:${d.f}||${d.t}`)
    .join('g').attr('class','dfa-tlbl')
    .style('cursor',delMode?'pointer':'default')
    .on('click',(e,d)=>{ if(!delMode) return; e.stopPropagation(); _deleteTrans(d); });

  lblGs.selectAll('rect').data(d=>[d]).join('rect')
    .attr('x',d=>d.pi.lx - (d.labels.join(',').length*3.8+6))
    .attr('y',d=>d.pi.ly-9)
    .attr('width',d=>d.labels.join(',').length*7.6+12)
    .attr('height',16).attr('fill','#05080f').attr('rx',2);

  lblGs.selectAll('text').data(d=>[d]).join('text')
    .attr('x',d=>d.pi.lx).attr('y',d=>d.pi.ly+1)
    .attr('text-anchor','middle').attr('dominant-baseline','middle')
    .attr('font-family','JetBrains Mono,monospace').attr('font-size','12')
    .attr('fill',_arrowColor)
    .attr('pointer-events','none')
    .text(d=>d.labels.join(','));

  // Pending source ring
  _transG.selectAll('.dfa-tsrc').remove();
  if (bTransSrc) {
    const s=activeDFA.states.find(s=>s.id===bTransSrc);
    if (s) { const p=sp(s);
      _transG.append('circle').attr('class','dfa-tsrc')
        .attr('cx',p.x).attr('cy',p.y).attr('r',SR+6)
        .attr('fill','none').attr('stroke','#f7b955')
        .attr('stroke-width',2).attr('stroke-dasharray','5,3')
        .attr('pointer-events','none');
    }
  }

  // Start arrow
  _transG.selectAll('.dfa-sarr').remove();
  if (activeDFA.start) {
    const s=activeDFA.states.find(s=>s.id===activeDFA.start);
    if (s) { const p=sp(s);
      _transG.append('line').attr('class','dfa-sarr')
        .attr('x1',p.x-SR-52).attr('y1',p.y).attr('x2',p.x-SR-2).attr('y2',p.y)
        .attr('stroke','#3f5070').attr('stroke-width',2)
        .attr('marker-end','url(#dfa-ah)').attr('pointer-events','none');
    }
  }
}

function _deleteTrans(grp) {
  grp.trs.forEach(tr=>{
    activeDFA.trans=activeDFA.trans.filter(t=>!(t.f===tr.f&&t.t===tr.t&&t.l===tr.l));
  });
  renderDFA();
}

// ── States ────────────────────────────────────────────────
function _renderStates() {
  if (!activeDFA) return;

  const joined=_stateG.selectAll('g.dfa-st')
    .data(activeDFA.states, d=>d.id)
    .join(
      en=>en.append('g').attr('class','dfa-st'),
      up=>up,
      ex=>ex.remove()
    );

  joined.attr('transform',d=>{const p=sp(d);return `translate(${p.x},${p.y})`;});

  joined.call(d3.drag()
    .filter(()=>!isCustom||bMode==='select')
    .on('drag',function(e,d){
      const r=_dfaSvg.node().getBoundingClientRect();
      d.rx=Math.max(.06,Math.min(.94,(e.sourceEvent.clientX-r.left)/_W));
      d.ry=Math.max(.06,Math.min(.94,(e.sourceEvent.clientY-r.top )/_H));
      d3.select(this).attr('transform',`translate(${d.rx*_W},${d.ry*_H})`);
      _renderTransitions();
    })
    .on('end',()=>renderDFA())
  );

  joined
    .on('click',(e,d)=>{e.stopPropagation(); onStateClick(e,d);})
    .on('contextmenu',(e,d)=>{e.preventDefault();e.stopPropagation();if(isCustom)showCtxMenu(e,d);});

  joined.style('cursor',()=>
    isCustom&&bMode==='del'?'pointer':
    bMode==='select'||!isCustom?'grab':'pointer'
  );

  // Rebuild children each render
  joined.selectAll('*').remove();

  // 1. Glow ring
  joined.filter(d => isNFA ? nfaStates.has(d.id) : d.id===dfaState)
    .append('circle').attr('r',SR+14)
    .attr('fill', isNFA ? 'rgba(189,147,249,0.15)' : 'rgba(0,229,255,0.15)')
    .attr('pointer-events','none');

  // 2. Main circle
  joined.append('circle').attr('r',SR)
    .attr('fill',d=>{
      if (isNFA && nfaStates.has(d.id)) return 'rgba(189,147,249,0.09)';
      if (d.id===dfaState) return 'rgba(0,229,255,0.09)';
      if (d.id===bSelId)   return 'rgba(247,185,85,0.08)';
      return 'rgba(10,15,26,0.9)';
    })
    .attr('stroke',d=>{
      if (isNFA && nfaStates.has(d.id)) return '#bd93f9';
      if (d.id===dfaState) return '#00e5ff';
      if (d.id===bSelId)   return '#f7b955';
      if (d.acc)           return '#00ff88';
      return '#243352';
    })
    .attr('stroke-width',d=>(isNFA?nfaStates.has(d.id):d.id===dfaState)?2.8:1.6);

  // 3. Accept ring (on top of main fill)
  joined.filter(d=>d.acc)
    .append('circle').attr('r',SR-6)
    .attr('fill','none')
    .attr('stroke',d=>{
      if (isNFA && nfaStates.has(d.id)) return '#bd93f9';
      if (d.id===dfaState) return '#00e5ff';
      return '#00ff88';
    })
    .attr('stroke-width',1.5).attr('pointer-events','none');

  // 4. Label
  joined.each(function(d){
    const g=d3.select(this);
    const isNfaActive=isNFA&&nfaStates.has(d.id);
    const isCur=d.id===dfaState, isSel=d.id===bSelId;
    const col=isNfaActive?'#bd93f9':isCur?'#00e5ff':isSel?'#f7b955':'#8a9ab8';
    const sub=isNfaActive?'rgba(189,147,249,0.7)':isCur?'rgba(0,229,255,0.7)':isSel?'rgba(247,185,85,0.5)':'#3f5070';
    const parts=(d.lbl||d.id).split('\n');
    if (parts.length===1) {
      g.append('text').attr('text-anchor','middle').attr('dominant-baseline','middle')
        .attr('font-family','JetBrains Mono,monospace').attr('font-size','13').attr('font-weight','500')
        .attr('fill',col).attr('pointer-events','none').text(parts[0]);
    } else {
      g.append('text').attr('text-anchor','middle').attr('dominant-baseline','middle').attr('dy','-7')
        .attr('font-family','JetBrains Mono,monospace').attr('font-size','13').attr('font-weight','500')
        .attr('fill',col).attr('pointer-events','none').text(parts[0]);
      g.append('text').attr('text-anchor','middle').attr('dominant-baseline','middle').attr('dy','9')
        .attr('font-family','JetBrains Mono,monospace').attr('font-size','10').attr('font-weight','300')
        .attr('fill',sub).attr('pointer-events','none').text(parts[1]);
    }
  });
}

// ── Event handlers ────────────────────────────────────────
function onBgClick(e) {
  if (isCustom && bMode==='addState') {
    const r=_dfaSvg.node().getBoundingClientRect();
    const rx=(e.clientX-r.left)/_W, ry=(e.clientY-r.top)/_H;
    const id='q'+_stateCounter++;
    activeDFA.states.push({id,rx,ry,acc:false,lbl:id});
    if (!activeDFA.start) activeDFA.start=id;
    renderDFA(); return;
  }
  bTransSrc=null; bSelId=null; renderDFA();
}

function onStateClick(e,d) {
  if (isCustom && bMode==='del') {
    deleteState(d.id);
  } else if (isCustom && bMode==='addTrans') {
    if (!bTransSrc) {
      bTransSrc=d.id; renderDFA();
    } else {
      bPendTrans={f:bTransSrc,t:d.id}; bTransSrc=null;
      const r=_dfaSvg.node().getBoundingClientRect();
      showLabelInput(e.clientX-r.left, e.clientY-r.top);
    }
  } else {
    bSelId=(bSelId===d.id)?null:d.id; renderDFA();
  }
}

function deleteState(id) {
  activeDFA.states=activeDFA.states.filter(s=>s.id!==id);
  activeDFA.trans =activeDFA.trans.filter(t=>t.f!==id&&t.t!==id);
  if (activeDFA.start===id) activeDFA.start=activeDFA.states[0]?.id||null;
  if (bSelId===id) bSelId=null;
  if (dfaState===id) dfaState=null;
  renderDFA();
}

// ── Context menu ──────────────────────────────────────────
function showCtxMenu(e,d) {
  document.getElementById('dfa-ctx-menu')?.remove();
  const wrap=document.querySelector('.dfa-canvas-wrap');
  const wr=wrap.getBoundingClientRect();
  const menu=document.createElement('div');
  menu.id='dfa-ctx-menu'; menu.className='dfa-ctx-menu';
  menu.style.left=(e.clientX-wr.left)+'px';
  menu.style.top =(e.clientY-wr.top )+'px';

  const mk=(label,action,danger=false)=>{
    const btn=document.createElement('button');
    btn.className='ctx-item'+(danger?' danger':'');
    btn.textContent=label;
    btn.onclick=()=>{menu.remove();action();};
    menu.appendChild(btn);
  };
  mk(d.acc?'◯ Remove accept mark':'⊙ Mark as accept state', ()=>{d.acc=!d.acc;renderDFA();});
  mk(d.id===activeDFA.start?'◉ Is start state':'◉ Set as start state', ()=>{activeDFA.start=d.id;renderDFA();});
  mk('✕ Delete state', ()=>deleteState(d.id), true);
  wrap.appendChild(menu);
  setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),0);
}

// ── Label popup ───────────────────────────────────────────
function showLabelInput(x,y) {
  const pop=document.getElementById('dfa-label-pop');
  if (!pop) return;
  pop.style.left=(x+8)+'px'; pop.style.top=Math.max(8,y-24)+'px'; pop.style.display='flex';
  const inp=document.getElementById('dlp-in');
  inp.value=''; inp.focus();
  inp.onkeydown=e=>{ if(e.key==='Enter') confirmLabel(); if(e.key==='Escape') cancelLabel(); };
}

function confirmLabel() {
  const pop=document.getElementById('dfa-label-pop');
  const val=document.getElementById('dlp-in').value.trim();
  if (!val||!bPendTrans) { cancelLabel(); return; }
  const labels=val.split(',').map(s=>s.trim()).filter(Boolean);

  if (!isNFA) {
    // DFA: detect conflicts — same source + same symbol → different target
    labels.forEach(l=>{
      const conflict=activeDFA.trans.find(t=>t.f===bPendTrans.f&&t.l===l&&t.t!==bPendTrans.t);
      if (conflict) {
        activeDFA.trans=activeDFA.trans.filter(t=>!(t.f===bPendTrans.f&&t.l===l));
        addLog('⚠', `DFA conflict on '${l}' from ${bPendTrans.f}: replaced ${bPendTrans.f}→${conflict.t} with ${bPendTrans.f}→${bPendTrans.t}`, 'warn');
      }
    });
  }

  labels.forEach(l=>{
    if (!activeDFA.trans.find(t=>t.f===bPendTrans.f&&t.t===bPendTrans.t&&t.l===l))
      activeDFA.trans.push({f:bPendTrans.f,t:bPendTrans.t,l});
  });
  bPendTrans=null; pop.style.display='none'; renderDFA();
}

function cancelLabel() {
  const pop=document.getElementById('dfa-label-pop');
  if (pop) pop.style.display='none';
  bPendTrans=null; bTransSrc=null;
}
