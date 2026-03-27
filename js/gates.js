// ════════════════════════════════════════════════════════
// GATES DATA — used by circuit builder & info panel
// ════════════════════════════════════════════════════════

const GATES = [
  { id: 'AND',  inputs: 2, fn: (a,b) => a & b,       expr: 'F = A · B',    color: '#00e5ff', desc: 'Output is HIGH only when ALL inputs are HIGH.' },
  { id: 'OR',   inputs: 2, fn: (a,b) => a | b,       expr: 'F = A + B',    color: '#00ff88', desc: 'Output is HIGH when AT LEAST ONE input is HIGH.' },
  { id: 'NOT',  inputs: 1, fn: (a)   => a ^ 1,       expr: "F = A'",       color: '#ff8c42', desc: 'Output is the INVERSE of the input.' },
  { id: 'XOR',  inputs: 2, fn: (a,b) => a ^ b,       expr: 'F = A ⊕ B',   color: '#bd93f9', desc: 'Output is HIGH when inputs are DIFFERENT.' },
  { id: 'NAND', inputs: 2, fn: (a,b) => (a & b) ^ 1, expr: "F = (A·B)'",  color: '#ff4757', desc: 'Output is LOW only when ALL inputs are HIGH.' },
  { id: 'NOR',  inputs: 2, fn: (a,b) => (a | b) ^ 1, expr: "F = (A+B)'",  color: '#ffb347', desc: 'Output is LOW when ANY input is HIGH.' },
];
