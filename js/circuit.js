// ════════════════════════════════════════════════════════
// CIRCUIT BUILDER — D3-powered drag & drop logic gate lab
// ════════════════════════════════════════════════════════

'use strict';

// ── Gate catalogue ───────────────────────────────────────
const CG = {
  AND:  { n:2, fn:(a,b)=>a&b,       color:'#00e5ff' },
  OR:   { n:2, fn:(a,b)=>a|b,       color:'#00ff88' },
  NOT:  { n:1, fn:(a)  =>a^1,       color:'#ff8c42' },
  XOR:  { n:2, fn:(a,b)=>a^b,       color:'#bd93f9' },
  NAND: { n:2, fn:(a,b)=>(a&b)^1,   color:'#ff4757' },
  NOR:  { n:2, fn:(a,b)=>(a|b)^1,   color:'#ffb347' },
};

// ── Gate shapes (local SVG coords, center = 0,0) ─────────
const SH = {
  AND:  { body:'M-40,-26 L-40,26 L0,26 Q42,26 42,0 Q42,-26 0,-26 Z',
          inPins:[[-40,-13],[-40,13]], outPin:[42,0] },
  OR:   { body:'M-40,-26 Q-20,-26 2,-26 Q42,-26 42,0 Q42,26 2,26 Q-20,26 -40,26 Q-26,0 -40,-26 Z',
          inPins:[[-34,-13],[-34,13]], outPin:[42,0] },
  NOT:  { body:'M-40,-26 L-40,26 L34,0 Z',
          extra:{type:'circle',cx:43,cy:0,r:8},
          inPins:[[-40,0]], outPin:[51,0] },
  XOR:  { body:'M-28,-26 Q-8,-26 10,-26 Q52,-26 52,0 Q52,26 10,26 Q-8,26 -28,26 Q-14,0 -28,-26 Z',
          extra:{type:'path',d:'M-44,-26 Q-28,0 -44,26'},
          inPins:[[-28,-13],[-28,13]], outPin:[52,0] },
  NAND: { body:'M-40,-26 L-40,26 L0,26 Q38,26 38,0 Q38,-26 0,-26 Z',
          extra:{type:'circle',cx:46,cy:0,r:8},
          inPins:[[-40,-13],[-40,13]], outPin:[54,0] },
  NOR:  { body:'M-40,-26 Q-20,-26 2,-26 Q38,-26 38,0 Q38,26 2,26 Q-20,26 -40,26 Q-26,0 -40,-26 Z',
          extra:{type:'circle',cx:46,cy:0,r:8},
          inPins:[[-34,-13],[-34,13]], outPin:[54,0] },
  INPUT:  { isIO:true, inPins:[],        outPin:[38,0]  },
  OUTPUT: { isIO:true, inPins:[[-38,0]], outPin:null    },
};

const IO_COLOR = { INPUT:'#00e5ff', OUTPUT:'#00ff88' };

// ── State ────────────────────────────────────────────────
let _nodes   = {};
let _wires   = {};
let _nextId  = 1;
let _sel     = null;
let _wiring  = null;   // { nodeId, worldX, worldY, mouseX, mouseY }
let _xf      = d3.zoomIdentity;
let _dragOff = { x:0, y:0 };
let _didMove = false;  // tracks if node drag had movement (to guard toggle click)

let _svg, _canvas, _wiresG, _nodesG, _previewG, _zoomBeh;

// ── Utilities ────────────────────────────────────────────
function uid()           { return 'n' + (_nextId++); }
function gateColor(type) { return IO_COLOR[type] ?? CG[type]?.color ?? '#00e5ff'; }
function hexRgb(h)       { return h.replace('#','').match(/../g).map(x=>parseInt(x,16)).join(','); }

function outWorld(nd) {
  const p = SH[nd.type].outPin;
  return p ? [nd.x + p[0], nd.y + p[1]] : null;
}
function inWorld(nd, i) {
  const p = SH[nd.type].inPins[i];
  return p ? [nd.x + p[0], nd.y + p[1]] : null;
}
function bez(x1,y1,x2,y2) {
  const dx = Math.max(50, Math.abs(x2-x1)*0.55);
  return `M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}`;
}
function svgPointerCanvas(event) {
  return _xf.invert(d3.pointer(event.sourceEvent ?? event, _svg.node()));
}

// ── Mutations ────────────────────────────────────────────
function addNode(type, x, y) {
  const id = uid();
  _nodes[id] = { id, type, x, y,
    value:     0,
    inputVals: new Array(SH[type].inPins.length).fill(0),
    outputVal: 0 };
  return id;
}

function deleteNode(id) {
  for (const wid of Object.keys(_wires)) {
    const w = _wires[wid];
    if (w.fromNode === id || w.toNode === id) delete _wires[wid];
  }
  delete _nodes[id];
  if (_sel === id) _sel = null;
}

function connectWire(from, to, toPin) {
  for (const wid of Object.keys(_wires)) {
    const w = _wires[wid];
    if (w.toNode === to && w.toPin === toPin) delete _wires[wid];
  }
  const id = uid();
  _wires[id] = { id, fromNode:from, toNode:to, toPin };
}

// ── Signal propagation (Kahn's BFS) ─────────────────────
function propagate() {
  for (const nd of Object.values(_nodes)) {
    nd.inputVals = new Array(SH[nd.type].inPins.length).fill(0);
    nd.outputVal = nd.type === 'INPUT' ? nd.value : 0;
  }
  const outWires = {}, inDeg = {};
  for (const id of Object.keys(_nodes)) { outWires[id] = []; inDeg[id] = 0; }
  for (const w of Object.values(_wires)) {
    if (!_nodes[w.fromNode] || !_nodes[w.toNode]) continue;
    outWires[w.fromNode].push(w);
    inDeg[w.toNode]++;
  }
  const queue = Object.keys(_nodes).filter(id => _nodes[id].type === 'INPUT' || inDeg[id] === 0);
  const done  = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (done.has(id)) continue;
    done.add(id);
    const nd = _nodes[id];
    if      (nd.type === 'INPUT')  nd.outputVal = nd.value;
    else if (nd.type === 'OUTPUT') nd.outputVal = nd.inputVals[0];
    else {
      const g = CG[nd.type];
      nd.outputVal = g.n === 1 ? g.fn(nd.inputVals[0]) : g.fn(nd.inputVals[0], nd.inputVals[1]);
    }
    for (const w of outWires[id]) {
      const to = _nodes[w.toNode];
      if (!to) continue;
      to.inputVals[w.toPin] = nd.outputVal;
      inDeg[w.toNode]--;
      if (inDeg[w.toNode] <= 0 && !done.has(w.toNode)) queue.push(w.toNode);
    }
  }
  for (const nd of Object.values(_nodes)) {
    if (!done.has(nd.id) && CG[nd.type]) {
      const g = CG[nd.type];
      nd.outputVal = g.n === 1 ? g.fn(nd.inputVals[0]) : g.fn(nd.inputVals[0], nd.inputVals[1]);
    }
  }
}

// ── SVG setup ────────────────────────────────────────────
function setupSVG() {
  _svg = d3.select('#circuit-svg');

  _svg.append('defs').html(`
    <pattern id="cgrid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40,0 L0,0 0,40" fill="none" stroke="rgba(0,229,255,0.045)" stroke-width="0.8"/>
    </pattern>
    <filter id="glow2" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow1" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  `);

  _zoomBeh = d3.zoom()
    .scaleExtent([0.1, 8])
    .on('zoom', e => {
      _xf = e.transform;
      _canvas.attr('transform', e.transform);
      if (_wiring) renderPreview();
    });

  _svg.call(_zoomBeh).on('dblclick.zoom', null);

  // Mousemove: update rubber-band wire when wiring is active
  _svg.on('mousemove.rb', e => {
    if (!_wiring) return;
    const [x,y] = svgPointerCanvas(e);
    _wiring.mouseX = x; _wiring.mouseY = y;
    renderPreview();
    // Highlight any in-port under cursor
    const el = document.elementFromPoint(e.clientX, e.clientY);
    _nodesG.selectAll('.in-zone').classed('in-zone-hover', false);
    if (el && el.dataset.port === 'in') el.classList.add('in-zone-hover');
  });

  _canvas   = _svg.append('g').attr('class','circ-canvas');
  _wiresG   = _canvas.append('g');
  _nodesG   = _canvas.append('g');
  _previewG = _canvas.append('g').style('pointer-events','none');

  _canvas.insert('rect',':first-child')
    .attr('class','canvas-bg')
    .attr('x',-8000).attr('y',-8000)
    .attr('width',16000).attr('height',16000)
    .attr('fill','url(#cgrid)')
    .on('click', () => { _wiring ? cancelWiring() : select(null); });
}

// ── Render pipeline ──────────────────────────────────────
function renderAll() {
  propagate();
  renderWires();
  renderNodes();
  renderPreview();
  updatePanel();
}

// Wires
function renderWires() {
  const data = Object.values(_wires).filter(w => _nodes[w.fromNode] && _nodes[w.toNode]);
  const join = _wiresG.selectAll('.wire').data(data, d => d.id);
  join.exit().remove();

  const enter = join.enter().append('path')
    .attr('class','wire')
    .attr('fill','none')
    .attr('stroke-width',2.5)
    .attr('stroke-linecap','round')
    .style('cursor','pointer')
    .on('click', (e,d) => {
      if (!e.shiftKey) return;
      e.stopPropagation();
      delete _wires[d.id]; renderAll();
    })
    .on('contextmenu', (e,d) => {
      e.preventDefault(); e.stopPropagation();
      delete _wires[d.id]; renderAll();
    });

  join.merge(enter).each(function(d) {
    const fn = _nodes[d.fromNode], tn = _nodes[d.toNode];
    if (!fn || !tn) return;
    const [x1,y1] = outWorld(fn);
    const [x2,y2] = inWorld(tn, d.toPin);
    const on = fn.outputVal === 1, clr = gateColor(fn.type);
    d3.select(this)
      .attr('d', bez(x1,y1,x2,y2))
      .attr('stroke', on ? clr : '#1e2d45')
      .attr('opacity', on ? 1 : 0.45)
      .attr('filter', on ? 'url(#glow1)' : null);
  });
}

// Preview rubber-band wire (pointer-events disabled on whole group)
function renderPreview() {
  _previewG.selectAll('*').remove();
  if (!_wiring || _wiring.mouseX == null) return;
  const {worldX,worldY,mouseX,mouseY} = _wiring;
  _previewG.append('path')
    .attr('d', bez(worldX,worldY,mouseX,mouseY))
    .attr('fill','none')
    .attr('stroke','#00e5ff')
    .attr('stroke-width',2.5)
    .attr('stroke-dasharray','7,4')
    .attr('opacity',0.7);
  _previewG.append('circle')
    .attr('cx',worldX).attr('cy',worldY).attr('r',5)
    .attr('fill','#00e5ff').attr('opacity',0.6);
}

// Nodes
function renderNodes() {
  const data = Object.values(_nodes);
  const join = _nodesG.selectAll('.nd').data(data, d => d.id);
  join.exit().remove();

  const enter = join.enter().append('g')
    .attr('class','nd')
    .call(
      d3.drag()
        // Don't start node drag when clicking a port — _didMove guards accidental toggles
        .filter(e => !e.target.dataset.port)
        .on('start', function(e,d) {
          _didMove = false;
          d3.select(this).raise();
          select(d.id);
          const [mx,my] = svgPointerCanvas(e);
          _dragOff.x = mx - d.x;
          _dragOff.y = my - d.y;
        })
        .on('drag', function(e,d) {
          _didMove = true;
          const [mx,my] = svgPointerCanvas(e);
          d.x = mx - _dragOff.x;
          d.y = my - _dragOff.y;
          d3.select(this).attr('transform',`translate(${d.x},${d.y})`);
          renderWires();
        })
        .on('end', function(e, d) {
          if (!_didMove && d.type === 'INPUT') {
            const tgt = e.sourceEvent && e.sourceEvent.target;
            if (tgt && tgt.dataset && tgt.dataset.iotoggle) {
              d.value ^= 1;
            }
          }
          renderAll();
        })
    )
    .on('contextmenu', (e,d) => {
      e.preventDefault(); e.stopPropagation();
      deleteNode(d.id); renderAll();
    });

  const all = join.merge(enter);
  all.attr('transform', d => `translate(${d.x},${d.y})`);
  all.each(function(d) { paintNode(d3.select(this), d); });
}

// ── Node painting ────────────────────────────────────────
function paintNode(g, nd) {
  g.selectAll('*').remove();
  SH[nd.type].isIO ? paintIO(g, nd) : paintGate(g, nd);
}

// Helper: build the drag behavior for an output port
function outPortDrag(nodeId) {
  return d3.drag()
    .on('start', function(e) {
      e.sourceEvent.stopPropagation(); // don't bubble to node group drag
      startWiring(nodeId);
    })
    .on('drag', function(e) {
      if (!_wiring) return;
      const [x,y] = svgPointerCanvas(e);
      _wiring.mouseX = x; _wiring.mouseY = y;
      renderPreview();
    })
    .on('end', function(e) {
      if (!_wiring) return;
      // Find what element is under the cursor on release
      const el = document.elementFromPoint(e.sourceEvent.clientX, e.sourceEvent.clientY);
      if (el && el.dataset.port === 'in') {
        connectWire(_wiring.nodeId, el.dataset.nodeid, +el.dataset.pinidx);
        cancelWiring();
        renderAll();
      }
      // If released elsewhere, leave wiring active so user can click an in-port
    });
}

// Helper: attach in-port hover + click to a hit-zone circle
function addInPortZone(g, cx, cy, nodeId, pinIdx, visualCircle, clr) {
  g.append('circle')
    .attr('class','in-zone')
    .attr('cx',cx).attr('cy',cy)
    .attr('r',16)                   // large invisible hit zone
    .attr('fill','transparent')
    .attr('data-port','in')
    .attr('data-nodeid', nodeId)
    .attr('data-pinidx', pinIdx)
    .style('cursor','crosshair')
    .on('mouseenter', function() {
      visualCircle.attr('r',10).attr('stroke-width',2.5)
        .attr('stroke', clr).attr('fill',`rgba(${hexRgb(clr)},0.25)`);
    })
    .on('mouseleave', function() {
      visualCircle.attr('r',7).attr('stroke-width',2);
    })
    .on('click', e => { e.stopPropagation(); onInPin(nodeId, pinIdx); });
}

function paintGate(g, nd) {
  const sh  = SH[nd.type];
  const clr = gateColor(nd.type);
  const rgb = hexRgb(clr);
  const on  = nd.outputVal === 1;
  const sel = _sel === nd.id;

  // Selection ring
  if (sel) {
    g.append('rect')
      .attr('x',-60).attr('y',-38).attr('width',128).attr('height',76)
      .attr('rx',7).attr('fill','none')
      .attr('stroke',clr).attr('stroke-width',1.2)
      .attr('stroke-dasharray','4,3').attr('opacity',0.5);
  }

  // Input wire stubs
  sh.inPins.forEach((pin,i) => {
    g.append('line')
      .attr('x1',pin[0]-24).attr('y1',pin[1])
      .attr('x2',pin[0]).attr('y2',pin[1])
      .attr('stroke', nd.inputVals[i] ? clr : '#1e2d45')
      .attr('stroke-width',2.5).attr('stroke-linecap','round');
  });

  // Output wire stub
  if (sh.outPin) {
    g.append('line')
      .attr('x1',sh.outPin[0]).attr('y1',sh.outPin[1])
      .attr('x2',sh.outPin[0]+24).attr('y2',sh.outPin[1])
      .attr('stroke', on ? clr : '#1e2d45')
      .attr('stroke-width',2.5).attr('stroke-linecap','round');
  }

  // Gate body
  g.append('path')
    .attr('d',sh.body)
    .attr('fill','rgba(5,8,15,0.9)')
    .attr('stroke',clr)
    .attr('stroke-width', sel ? 2.5 : 2)
    .attr('stroke-linejoin','round')
    .attr('filter', on ? 'url(#glow1)' : null);

  // Extra shape
  if (sh.extra) {
    if (sh.extra.type === 'circle') {
      g.append('circle')
        .attr('cx',sh.extra.cx).attr('cy',sh.extra.cy).attr('r',sh.extra.r)
        .attr('fill','rgba(5,8,15,0.9)')
        .attr('stroke',clr).attr('stroke-width',2);
    } else {
      g.append('path')
        .attr('d',sh.extra.d)
        .attr('fill','none').attr('stroke',clr).attr('stroke-width',2);
    }
  }

  // Gate label
  g.append('text')
    .attr('x',0).attr('y',44).attr('text-anchor','middle')
    .attr('font-family','JetBrains Mono,monospace')
    .attr('font-size',9).attr('font-weight',700)
    .attr('fill',clr).attr('opacity',0.4)
    .text(nd.type).style('pointer-events','none');

  // ── Input ports ─────────────────────────────────────
  sh.inPins.forEach((pin,i) => {
    const v = nd.inputVals[i];
    // Visual circle (pointer-events off — hit zone handles interaction)
    const vc = g.append('circle')
      .attr('cx',pin[0]).attr('cy',pin[1]).attr('r',7)
      .attr('fill', v ? `rgba(${rgb},0.25)` : 'rgba(14,22,38,0.95)')
      .attr('stroke', v ? clr : '#2a3d5a').attr('stroke-width',2)
      .style('pointer-events','none');

    // Pin letter label
    g.append('text')
      .attr('x',pin[0]-20).attr('y',pin[1]+4).attr('text-anchor','middle')
      .attr('font-family','JetBrains Mono,monospace').attr('font-size',9)
      .attr('fill','#3f5070').style('pointer-events','none')
      .text(['A','B','C'][i]);

    // Large transparent hit zone
    addInPortZone(g, pin[0], pin[1], nd.id, i, vc, clr);
  });

  // ── Output port ──────────────────────────────────────
  if (sh.outPin) {
    const [ox,oy] = sh.outPin;
    // Visual circle
    const vc = g.append('circle')
      .attr('cx',ox).attr('cy',oy).attr('r',7)
      .attr('fill', on ? `rgba(${rgb},0.25)` : 'rgba(14,22,38,0.95)')
      .attr('stroke', on ? clr : '#2a3d5a').attr('stroke-width',2)
      .attr('filter', on ? 'url(#glow2)' : null)
      .style('pointer-events','none');

    // F label
    g.append('text')
      .attr('x',ox+20).attr('y',oy+4).attr('text-anchor','middle')
      .attr('font-family','JetBrains Mono,monospace').attr('font-size',9)
      .attr('fill','#3f5070').style('pointer-events','none').text('F');

    // Large hit zone — drag to start wiring
    g.append('circle')
      .attr('cx',ox).attr('cy',oy).attr('r',16)
      .attr('fill','transparent')
      .attr('data-port','out')
      .style('cursor','crosshair')
      .on('mouseenter', () => {
        vc.attr('r',10).attr('stroke-width',2.5).attr('stroke',clr)
          .attr('fill',`rgba(${rgb},0.3)`);
      })
      .on('mouseleave', () => { vc.attr('r',7).attr('stroke-width',2); })
      .call(outPortDrag(nd.id));
  }
}

function paintIO(g, nd) {
  const sh   = SH[nd.type];
  const clr  = gateColor(nd.type);
  const rgb  = hexRgb(clr);
  const isIn = nd.type === 'INPUT';
  const val  = isIn ? nd.value : (nd.inputVals[0] ?? 0);
  const on   = val === 1;
  const sel  = _sel === nd.id;
  const W=74, H=38;

  if (sel) {
    g.append('rect')
      .attr('x',-W/2-7).attr('y',-H/2-7)
      .attr('width',W+14).attr('height',H+14)
      .attr('rx',14).attr('fill','none')
      .attr('stroke',clr).attr('stroke-width',1.2)
      .attr('stroke-dasharray','4,3').attr('opacity',0.45);
  }

  // Wire stubs
  if (sh.outPin) {
    g.append('line')
      .attr('x1',sh.outPin[0]).attr('y1',0)
      .attr('x2',sh.outPin[0]+24).attr('y2',0)
      .attr('stroke', on ? clr : '#1e2d45').attr('stroke-width',2.5);
  }
  if (sh.inPins.length) {
    const [px] = sh.inPins[0];
    g.append('line')
      .attr('x1',px-24).attr('y1',0).attr('x2',px).attr('y2',0)
      .attr('stroke', on ? clr : '#1e2d45').attr('stroke-width',2.5);
  }

  // Body rect — data-iotoggle prevents node drag from firing on click
  g.append('rect')
    .attr('x',-W/2).attr('y',-H/2)
    .attr('width',W).attr('height',H)
    .attr('rx',10)
    .attr('fill', on ? `rgba(${rgb},0.12)` : 'rgba(5,8,15,0.9)')
    .attr('stroke', sel ? clr : (on ? clr : '#2a3d5a'))
    .attr('stroke-width', sel ? 2.5 : 2)
    .attr('filter', on ? 'url(#glow1)' : null)
    .attr('data-iotoggle', isIn ? '1' : null)
    .style('cursor', isIn ? 'pointer' : 'default')
    .on('click', e => e.stopPropagation()); // toggle handled in drag end; just block canvas deselect

  // Type label
  g.append('text')
    .attr('x',0).attr('y',-7).attr('text-anchor','middle')
    .attr('font-family','JetBrains Mono,monospace')
    .attr('font-size',7.5).attr('font-weight',700)
    .attr('fill','#3f5070').attr('letter-spacing','0.1em')
    .text(nd.type).style('pointer-events','none');

  // Value
  g.append('text')
    .attr('x',0).attr('y',12).attr('text-anchor','middle')
    .attr('font-family','JetBrains Mono,monospace')
    .attr('font-size',18).attr('font-weight',700)
    .attr('fill', on ? clr : '#3f5070')
    .attr('filter', on ? 'url(#glow1)' : null)
    .text(val).style('pointer-events','none');

  if (isIn) {
    g.append('text')
      .attr('x',0).attr('y',H/2+14).attr('text-anchor','middle')
      .attr('font-family','JetBrains Mono,monospace')
      .attr('font-size',6.5).attr('fill','#3f5070')
      .text('click to toggle').style('pointer-events','none');
  }

  // ── Output port (INPUT node has one) ─────────────────
  if (sh.outPin) {
    const [ox,oy] = sh.outPin;
    const vc = g.append('circle')
      .attr('cx',ox).attr('cy',oy).attr('r',7)
      .attr('fill', on ? `rgba(${rgb},0.25)` : 'rgba(14,22,38,0.95)')
      .attr('stroke', on ? clr : '#2a3d5a').attr('stroke-width',2)
      .attr('filter', on ? 'url(#glow2)' : null)
      .style('pointer-events','none');

    g.append('circle')
      .attr('cx',ox).attr('cy',oy).attr('r',16)
      .attr('fill','transparent')
      .attr('data-port','out')
      .style('cursor','crosshair')
      .on('mouseenter', () => {
        vc.attr('r',10).attr('stroke-width',2.5).attr('stroke',clr)
          .attr('fill',`rgba(${rgb},0.3)`);
      })
      .on('mouseleave', () => { vc.attr('r',7).attr('stroke-width',2); })
      .call(outPortDrag(nd.id));
  }

  // ── Input port (OUTPUT node has one) ─────────────────
  if (sh.inPins.length) {
    const [px,py] = sh.inPins[0];
    const vc = g.append('circle')
      .attr('cx',px).attr('cy',py).attr('r',7)
      .attr('fill', on ? `rgba(${rgb},0.25)` : 'rgba(14,22,38,0.95)')
      .attr('stroke', on ? clr : '#2a3d5a').attr('stroke-width',2)
      .style('pointer-events','none');

    addInPortZone(g, px, py, nd.id, 0, vc, clr);
  }
}

// ── Port / wiring logic ──────────────────────────────────
function startWiring(nodeId) {
  const nd = _nodes[nodeId];
  if (!nd) return;
  const wp = outWorld(nd);
  if (!wp) return;
  _wiring = { nodeId, worldX:wp[0], worldY:wp[1], mouseX:wp[0], mouseY:wp[1] };
  _svg.classed('wiring', true);
  document.getElementById('wiring-badge').style.display = 'flex';
}

function onInPin(nodeId, pinIdx) {
  if (!_wiring) return;
  if (_wiring.nodeId === nodeId) { cancelWiring(); return; }
  connectWire(_wiring.nodeId, nodeId, pinIdx);
  cancelWiring();
  renderAll();
}

function cancelWiring() {
  _wiring = null;
  _svg.classed('wiring', false);
  document.getElementById('wiring-badge').style.display = 'none';
  _previewG.selectAll('*').remove();
}

// ── Selection ────────────────────────────────────────────
function select(id) {
  _sel = id;
  renderAll();
}

// ── Palette ──────────────────────────────────────────────
function buildPalette() {
  const pal = document.getElementById('circuit-palette');

  function section(label) {
    const s = document.createElement('div');
    s.className = 'pal-sec';
    const l = document.createElement('div');
    l.className = 'pal-lbl';
    l.textContent = label;
    s.appendChild(l);
    return s;
  }
  function palItem(type, color) {
    const el = document.createElement('div');
    el.className = 'pal-item';
    el.draggable = true;
    el.style.setProperty('--ic', color);
    el.innerHTML = `<span class="pal-dot" style="background:${color}"></span>${type}`;
    el.addEventListener('dragstart', e => e.dataTransfer.setData('gateType', type));
    return el;
  }
  function btn(label, danger, handler) {
    const b = document.createElement('button');
    b.className = 'pal-btn' + (danger ? ' danger' : '');
    b.textContent = label;
    b.onclick = handler;
    return b;
  }

  const ioSec = section('I / O');
  ['INPUT','OUTPUT'].forEach(t => ioSec.appendChild(palItem(t, gateColor(t))));
  pal.appendChild(ioSec);

  const gateSec = section('Gates');
  Object.entries(CG).forEach(([t,d]) => gateSec.appendChild(palItem(t, d.color)));
  pal.appendChild(gateSec);

  const actSec = section('Actions');
  actSec.appendChild(btn('Fit View (F)', false, fitView));
  actSec.appendChild(btn('Clear All', false, () => {
    if (!Object.keys(_nodes).length) return;
    _nodes = {}; _wires = {}; _sel = null; cancelWiring(); renderAll();
  }));
  actSec.appendChild(btn('Delete Selected', true, () => {
    if (_sel) { deleteNode(_sel); renderAll(); }
  }));
  pal.appendChild(actSec);

  const tipSec = section('How to wire');
  [
    '1. <b style="color:#00e5ff">Drag</b> from the circle on the right side of any node',
    '2. <b style="color:#00e5ff">Release</b> on the circle on the left side of a gate',
    '─────────────',
    'Or: click right circle → click left circle',
    '─────────────',
    'Right-click to delete node or wire',
    '<kbd>Del</kbd> removes selected · <kbd>F</kbd> fits view',
    'Scroll = zoom · drag bg = pan',
  ].forEach(t => {
    const d = document.createElement('div');
    d.className = 'pal-tip';
    d.innerHTML = t;
    tipSec.appendChild(d);
  });
  pal.appendChild(tipSec);
}

// ── Drop from palette ────────────────────────────────────
function setupDrop() {
  const el = document.getElementById('circuit-svg');
  el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  el.addEventListener('drop', e => {
    e.preventDefault();
    const type = e.dataTransfer.getData('gateType');
    if (!type) return;
    const rect = el.getBoundingClientRect();
    const [cx,cy] = _xf.invert([e.clientX - rect.left, e.clientY - rect.top]);
    addNode(type, cx, cy);
    renderAll();
  });
}

// ── Keyboard ────────────────────────────────────────────
function setupKeys() {
  document.addEventListener('keydown', e => {
    if (!document.getElementById('tab-gates').classList.contains('active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape')                          cancelWiring();
    if (e.key === 'f' || e.key === 'F')              fitView();
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (_sel) { deleteNode(_sel); renderAll(); }
    }
  });
}

// ── View helpers ─────────────────────────────────────────
function fitView() {
  const ns = Object.values(_nodes);
  const el = document.getElementById('circuit-svg');
  const W = el.clientWidth, H = el.clientHeight;
  if (!ns.length) {
    _svg.call(_zoomBeh.transform, d3.zoomIdentity.translate(W/2, H/2));
    return;
  }
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  ns.forEach(n => {
    x0 = Math.min(x0, n.x-80);  y0 = Math.min(y0, n.y-55);
    x1 = Math.max(x1, n.x+100); y1 = Math.max(y1, n.y+65);
  });
  const pad=80, k=Math.min((W-pad)/(x1-x0),(H-pad)/(y1-y0),2);
  _svg.transition().duration(400).call(_zoomBeh.transform,
    d3.zoomIdentity.translate(W/2-(x0+x1)/2*k, H/2-(y0+y1)/2*k).scale(k));
}

function resetZoom() {
  const el = document.getElementById('circuit-svg');
  _svg.transition().duration(300).call(_zoomBeh.transform,
    d3.zoomIdentity.translate(el.clientWidth/2, el.clientHeight/2));
}

// ── Info panel ───────────────────────────────────────────
function updatePanel() {
  const infoEl  = document.getElementById('circuit-info');
  const truthEl = document.getElementById('circuit-truth');
  const ttTitle = document.querySelector('.ci-tt-title');
  if (!infoEl) return;

  const nd = _sel ? _nodes[_sel] : null;
  if (!nd) {
    infoEl.innerHTML = `
      <div class="ci-row"><span class="ci-lbl">Nodes</span><span class="ci-val">${Object.keys(_nodes).length}</span></div>
      <div class="ci-row"><span class="ci-lbl">Wires</span><span class="ci-val">${Object.keys(_wires).length}</span></div>
      <div class="ci-empty">Select a gate to inspect it</div>`;
    truthEl.innerHTML = '';
    if (ttTitle) ttTitle.style.display = 'none';
    return;
  }

  const clr = gateColor(nd.type);
  if (ttTitle) ttTitle.style.display = '';

  if (nd.type === 'INPUT') {
    infoEl.innerHTML = `
      <div class="ci-type" style="color:${clr}">INPUT Node</div>
      <div class="ci-row"><span class="ci-lbl">Value</span>
        <span class="ci-val" style="color:${nd.value?clr:'#3f5070'}">${nd.value}</span></div>
      <div class="ci-hint">Click node body to toggle 0 / 1</div>`;
    truthEl.innerHTML = '';
    if (ttTitle) ttTitle.style.display = 'none';
    return;
  }
  if (nd.type === 'OUTPUT') {
    const v = nd.inputVals[0] ?? 0;
    infoEl.innerHTML = `
      <div class="ci-type" style="color:${clr}">OUTPUT Node</div>
      <div class="ci-row"><span class="ci-lbl">Value</span>
        <span class="ci-val" style="color:${v?clr:'#3f5070'}">${v}</span></div>`;
    truthEl.innerHTML = '';
    if (ttTitle) ttTitle.style.display = 'none';
    return;
  }

  const gd  = CG[nd.type];
  const gat = GATES.find(g => g.id === nd.type);
  infoEl.innerHTML = `
    <div class="ci-type" style="color:${clr}">${nd.type} Gate</div>
    <div class="ci-expr">${gat?.expr ?? ''}</div>
    <div class="ci-row"><span class="ci-lbl">A</span>
      <span class="ci-val" style="color:${nd.inputVals[0]?clr:'#3f5070'}">${nd.inputVals[0]}</span></div>
    ${gd.n>1?`<div class="ci-row"><span class="ci-lbl">B</span>
      <span class="ci-val" style="color:${nd.inputVals[1]?clr:'#3f5070'}">${nd.inputVals[1]}</span></div>`:''}
    <div class="ci-row"><span class="ci-lbl">Output</span>
      <span class="ci-val" style="color:${nd.outputVal?clr:'#3f5070'}">${nd.outputVal}</span></div>
    <div class="ci-desc">${gat?.desc ?? ''}</div>`;

  let h = `<table class="truth-tbl">`;
  h += gd.n===2
    ? '<thead><tr><th>A</th><th>B</th><th>F</th></tr></thead><tbody>'
    : '<thead><tr><th>A</th><th>F</th></tr></thead><tbody>';
  if (gd.n===2) {
    for (let a=0;a<=1;a++) for (let b=0;b<=1;b++) {
      const f=gd.fn(a,b), hi=(nd.inputVals[0]===a&&nd.inputVals[1]===b)?' class="hi"':'';
      h+=`<tr${hi}><td class="v${a}">${a}</td><td class="v${b}">${b}</td><td class="v${f}">${f}</td></tr>`;
    }
  } else {
    for (let a=0;a<=1;a++) {
      const f=gd.fn(a), hi=nd.inputVals[0]===a?' class="hi"':'';
      h+=`<tr${hi}><td class="v${a}">${a}</td><td class="v${f}">${f}</td></tr>`;
    }
  }
  truthEl.innerHTML = h + '</tbody></table>';
}

// ── Starter circuit ──────────────────────────────────────
function addStarter() {
  const a = addNode('INPUT',  -200, -55);
  const b = addNode('INPUT',  -200,  55);
  const g = addNode('AND',       0,   0);
  const o = addNode('OUTPUT',  200,   0);
  connectWire(a, g, 0);
  connectWire(b, g, 1);
  connectWire(g, o, 0);
}

// ── Init ─────────────────────────────────────────────────
function initCircuit() {
  buildPalette();
  setupSVG();
  setupDrop();
  setupKeys();
  addStarter();
  renderAll();
  setTimeout(() => {
    const el = document.getElementById('circuit-svg');
    _svg.call(_zoomBeh.transform,
      d3.zoomIdentity.translate(el.clientWidth/2, el.clientHeight/2).scale(1));
  }, 60);
}
