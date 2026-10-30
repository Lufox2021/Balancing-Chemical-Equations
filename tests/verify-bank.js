// Run: node tests/verify-bank.js  — checks every bank problem is uniquely balanceable
const Chem = require('../js/chem.js');
const bank = require('../js/problems.js');
let bad = 0; const seen = new Set(); const perLevel = {};
for (const p of bank) {
  try {
    const eq = Chem.analyze(p.eq);
    const key = Chem.equationText(eq);
    if (seen.has(key)) { console.log('DUPLICATE', p.eq); bad++; }
    seen.add(key);
    if (!eq.solution) { console.log('FAIL', p.eq, '—', eq.error); bad++; continue; }
    perLevel[p.level] = (perLevel[p.level] || 0) + 1;
    const units = eq.units ? ' [units: ' + eq.units.ions.join(',') + ']' : '';
    if (process.argv.includes('-v')) console.log(`L${p.level}  ${eq.solution.join(',').padEnd(28)} ${p.eq}${units}`);
  } catch (e) { console.log('PARSE ERROR', p.eq, e.message); bad++; }
}
console.log('Problems per level:', perLevel, 'total', bank.length, bad ? `— ${bad} PROBLEMS` : '— all OK');
process.exit(bad ? 1 : 0);
