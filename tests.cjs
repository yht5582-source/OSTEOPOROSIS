// node tests.cjs — 測試 index.html 中 /*ENGINE-START*/…/*ENGINE-END*/ 的決策引擎
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const src = html.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const mod = { exports: {} };
new Function('module', src)(mod);
const OP = mod.exports;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) pass++;
  else { fail++; console.log('✗ ' + name); }
}
const ev = p => OP.evaluate(p);
const drug = (r, id) => r.drugs.find(d => d.drug.id === id);

// 風險分級
check('T -3.0 alone → very high', ev({ t: -3.0 }).risk.level === 'veryHigh');
check('T -2.6 no fx → high', ev({ t: -2.6 }).risk.level === 'high');
check('T -2.0 → osteopenia', ev({ t: -2.0 }).risk.level === 'osteopenia');
check('T -1.0 → normal', ev({ t: -1.0 }).risk.level === 'normal');
check('T -2.0 + spine fx → high', ev({ t: -2.0, spineHip: 1 }).risk.level === 'high');
check('fracture in 12m → very high', ev({ t: -2.0, spineHip: 1, recent: '12' }).risk.level === 'veryHigh');
check('osteopenia FRAX 22% → high', ev({ t: -1.8, fraxMof: 22 }).risk.level === 'high');
check('osteopenia FRAX hip 5% → very high', ev({ t: -1.8, fraxHip: 5 }).risk.level === 'veryHigh');
check('osteopenia + wrist fx → high', ev({ t: -1.8, radHum: 1 }).risk.level === 'high');
check('normal BMD + wrist fx → not high', ev({ t: -0.5, radHum: 1 }).risk.level === 'normal');
check('steroid + fx → very high', ev({ t: -2.0, radHum: 1, steroid: true }).risk.level === 'veryHigh');
check('no T → unknown', ev({}).risk.level === 'unknown');

// 5.6.1
check('T -2.5 + spine fx → alendronate NHI', drug(ev({ t: -2.5, spineHip: 1 }), 'alendronate').nhi.ok);
check('T -2.4 + 1 spine fx → no NHI', !drug(ev({ t: -2.4, spineHip: 1 }), 'denosumab').nhi.ok);
check('osteopenia + 2 spine/hip fx → zoledronate NHI', drug(ev({ t: -2.0, spineHip: 2 }), 'zoledronate').nhi.ok);
check('T -1.0 + 2 fx → no NHI (needs T < -1.0)', !drug(ev({ t: -1.0, spineHip: 2 }), 'zoledronate').nhi.ok);
check('T -2.5 no fx → no NHI', ev({ t: -2.5 }).nhiAny.length === 0);
const wrist = ev({ t: -2.7, radHum: 1 });
check('wrist fx → denosumab NHI', drug(wrist, 'denosumab').nhi.ok);
check('wrist fx → alendronate NHI (generic)', drug(wrist, 'alendronate').nhi.ok);
check('wrist fx → zoledronate not NHI', !drug(wrist, 'zoledronate').nhi.ok);
check('wrist fx → raloxifene not NHI', !drug(wrist, 'raloxifene').nhi.ok);
const insulin = ev({ t: -2.6, dmInsulin: true });
check('T -2.6 + insulin DM → denosumab NHI', drug(insulin, 'denosumab').nhi.ok);
check('T -2.6 + insulin DM → zoledronate not NHI', !drug(insulin, 'zoledronate').nhi.ok);
check('T -2.6 + non-insulin DM → no NHI', ev({ t: -2.6, dm: true }).nhiAny.length === 0);
check('steroid factor needs T ≤ -2.5', !drug(ev({ t: -2.0, steroid: true }), 'denosumab').nhi.ok);
check('premenopausal → no NHI', ev({ group: 'premeno', t: -3.0, spineHip: 1 }).nhiAny.length === 0);
const man = ev({ group: 'male50', t: -2.8, spineHip: 1 });
check('male → alendronate NHI', drug(man, 'alendronate').nhi.ok);
check('male → raloxifene na', drug(man, 'raloxifene').tier === 'na');
check('male → romosozumab na', drug(man, 'romosozumab').tier === 'na');
check('CrCl 30 → zoledronate not NHI + contra', !drug(ev({ t: -2.8, spineHip: 1, crcl: 30 }), 'zoledronate').nhi.ok && drug(ev({ t: -2.8, spineHip: 1, crcl: 30 }), 'zoledronate').tier === 'contra');
check('CrCl 32 → risedronate still OK', drug(ev({ t: -2.8, spineHip: 1, crcl: 32 }), 'risedronate').nhi.ok);

// 5.6.2 teriparatide
check('teriparatide needs intolerance or failure', !drug(ev({ t: -3.2, spineHip: 2 }), 'teriparatide').nhi.ok);
check('teriparatide NHI with failure', drug(ev({ t: -3.2, spineHip: 2, fxOnTx: true }), 'teriparatide').nhi.ok);
check('teriparatide: 1 fracture not enough', !drug(ev({ t: -3.5, spineHip: 1, intolerant: true }), 'teriparatide').nhi.ok);
check('teriparatide: T -2.9 not enough', !drug(ev({ t: -2.9, spineHip: 2, fxOnTx: true }), 'teriparatide').nhi.ok);
check('teriparatide: male eligible', drug(ev({ group: 'male50', t: -3.2, spineHip: 2, fxOnTx: true }), 'teriparatide').nhi.ok);
check('teriparatide: prior romo blocks', !drug(ev({ t: -3.2, spineHip: 2, fxOnTx: true, priorAnabolic: 'romo' }), 'teriparatide').nhi.ok);

// 5.6.3 romosozumab (115/8/1)
check('romo: 2 fx with recent new → NHI', drug(ev({ t: -3.0, spineHip: 1, radHum: 1, recent: '24' }), 'romosozumab').nhi.ok);
check('romo: 2 fx no recent → no', !drug(ev({ t: -3.0, spineHip: 2 }), 'romosozumab').nhi.ok);
check('romo: 1 fx recent + failure → NHI', drug(ev({ t: -3.1, radHum: 1, recent: '12', fxOnTx: true }), 'romosozumab').nhi.ok);
check('romo: 1 fx recent alone → no', !drug(ev({ t: -3.1, radHum: 1, recent: '12' }), 'romosozumab').nhi.ok);
check('romo: T -2.8 → no', !drug(ev({ t: -2.8, spineHip: 2, recent: '12' }), 'romosozumab').nhi.ok);
check('romo: prior teriparatide blocks', !drug(ev({ t: -3.0, spineHip: 2, recent: '12', priorAnabolic: 'teri' }), 'romosozumab').nhi.ok);

// 排序與禁忌
const vh = ev({ t: -3.2, spineHip: 2, recent: '12' });
check('very high → romo first', drug(vh, 'romosozumab').tier === 'first' && vh.drugs[0].tier === 'first');
check('very high → teriparatide first', drug(vh, 'teriparatide').tier === 'first');
const vhCv = ev({ t: -3.2, spineHip: 2, recent: '12', cv: true });
check('CV → romo contra', drug(vhCv, 'romosozumab').tier === 'contra');
check('CV → teriparatide still first', drug(vhCv, 'teriparatide').tier === 'first');
const vhNoAna = ev({ t: -3.2, spineHip: 2, recent: '12', cv: true, teriContra: true });
check('no anabolic → denosumab first', drug(vhNoAna, 'denosumab').tier === 'first');
check('hypocalcemia → denosumab contra', drug(ev({ t: -2.8, spineHip: 1, hypoCa: true }), 'denosumab').tier === 'contra');
check('hypocalcemia → teriparatide not contra', drug(ev({ t: -3.2, spineHip: 2, hypoCa: true }), 'teriparatide').tier !== 'contra');
check('esophagus → alendronate contra', drug(ev({ t: -2.8, spineHip: 1, esoph: true }), 'alendronate').tier === 'contra');
check('VTE → raloxifene contra', drug(ev({ t: -2.8, spineHip: 1, vte: true }), 'raloxifene').tier === 'contra');
const ckd = ev({ t: -2.8, spineHip: 1, crcl: 20 });
check('CKD → denosumab first with caution', drug(ckd, 'denosumab').tier === 'first' && drug(ckd, 'denosumab').cautions.length > 0);
check('CKD → alendronate contra', drug(ckd, 'alendronate').tier === 'contra');
const dmab = ev({ t: -2.0, priorDmab: 'stopped' });
check('stopped denosumab → zoledronate first even if not high risk', drug(dmab, 'zoledronate').tier === 'first');
check('stopped denosumab → warning', dmab.warnings.some(w => w.tone === 'rose'));
check('denosumab → teriparatide not first', drug(ev({ t: -3.5, spineHip: 2, recent: '12', priorDmab: 'on' }), 'teriparatide').tier !== 'first');
check('osteopenia → notNow', drug(ev({ t: -1.8 }), 'alendronate').tier === 'notNow');
check('NHI drugs sorted before self-pay within tier', (() => {
  const r = ev({ t: -2.7, radHum: 1 });
  const alt = r.drugs.filter(d => d.tier === 'first');
  return alt.findIndex(d => !d.nhi.ok) === -1 || alt.findIndex(d => !d.nhi.ok) > alt.findIndex(d => d.nhi.ok);
})());
check('very high not NHI anabolic → blue note', ev({ t: -3.2 }).warnings.some(w => w.tone === 'blue'));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
