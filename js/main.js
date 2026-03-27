// ════════════════════════════════════════════════════════
// MAIN — Tab switching + app initialization
// ════════════════════════════════════════════════════════

function switchTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'dfa') setTimeout(drawDFA, 60);
}

window.addEventListener('load', () => {
  initCircuit();
  initBoolPills();
  initBoolKeyboard();
  initDFASvg();
  loadDFA();

  document.getElementById('dfa-str').addEventListener('input', () => {
    dfaStr = document.getElementById('dfa-str').value;
    resetDFA();
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('tab-dfa').classList.contains('active')) drawDFA();
  });
});
