import dotenv from 'dotenv';
dotenv.config();
const { runAgent } = await import('./apps/api/src/agent.js');
const msgs = [
  'quiero agendar el pago de mi tarjeta para que no se me pase',
  'recuérdame la fecha límite de mi tarjeta 5 días antes',
];
for (const m of msgs) {
  console.log('\n### ' + m);
  const emit = (e) => {
    if (e.type === 'tool_call') console.log('  >> ', e.name, JSON.stringify(e.args));
    else if (e.type === 'tool_result') console.log('  << ', e.name, e.preview.slice(0, 120));
  };
  try {
    const r = await runAgent({ userMessage: m, emit, streamDelayMs: 0 });
    const comps = r?.surface?.components?.map(c=>c.component) ?? [];
    console.log('  TITULO:', r?.title);
    console.log('  ALERTAS error:', r?.surface?.components?.filter(c=>c.component==='Alert'&&c.level==='error').length ?? 0);
    console.log('  componentes:', comps.join(', '));
  } catch (e) { console.log('  THROW:', e?.message); }
}
process.exit(0);
