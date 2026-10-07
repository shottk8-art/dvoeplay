/* Прогон всех сетевых тестов подряд. */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
const reportDir = process.env.TEST_REPORT_DIR
  ? new URL(process.env.TEST_REPORT_DIR.replace(/\/?$/, '/'), 'file://' + process.cwd() + '/')
  : new URL('../docs/testing/latest/', import.meta.url);
mkdirSync(reportDir, { recursive: true });
const list = ['test-rooms','test-race','test-dvoeplay','test-matreshka','test-magnit','test-dots',
              'test-memo','test-5bukv','test-yaschik','test-viselica','test-dobble','test-vzlomshik','test-names','test-theme','test-hero','test-pair','test-tour','test-keyboard','test-layout','test-app','test-lost','test-soak',
              'test-round-boundaries','test-blob-store','test-game-properties','test-dialog-visibility','test-motion'];
const bad = [];
const results = [];
const requested = process.env.TEST_FILTER ? process.env.TEST_FILTER.split(',') : list;
const unknown = requested.filter(t => !list.includes(t));
if (unknown.length) throw new Error('Unknown tests: ' + unknown.join(', '));
const selected = list.filter(t => requested.includes(t));
for (const t of selected){
  console.log("RUN " + t);
  const started = Date.now();
  const logFile = new URL(t + '.log', reportDir);
  writeFileSync(logFile, '');
  const code = await new Promise(r => {
    const p = spawn('node', ['tools/' + t + '.mjs'], { cwd: new URL('../', import.meta.url), stdio: ['ignore','pipe','pipe'] });
    let out = '';
    const capture = d => { out += d; appendFileSync(logFile, d); };
    p.stdout.on('data', capture);
    p.stderr.on('data', capture);
    p.on('close', c => {
      writeFileSync(new URL(t + '.log', reportDir), out);
      results.push({ test: t, exitCode: c, durationMs: Date.now() - started, log: t + '.log' });
      const tail = out.trim().split('\n').slice(-1)[0];
      const bads = out.split('\n').filter(l => l.includes('ПЛОХО') || l.includes('ОШИБКА В СТРАНИЦЕ'));
      console.log((c === 0 ? '  ✓ ' : '  ✗ ') + tail);
      bads.forEach(l => console.log('      ' + l.trim()));
      r(c);
    });
  });
  if (code !== 0) bad.push(t);
}
/* «все 22 проверки прошли», «все 21 проверка прошла», «все 25 проверок прошли» */
const done = (n) => (n % 10 === 1 && n % 100 !== 11) ? 'проверка прошла'
  : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'проверки прошли' : 'проверок прошли';
console.log(bad.length ? '\nне прошли: ' + bad.join(', ') : '\nвсе ' + selected.length + ' ' + done(selected.length));
writeFileSync(new URL('results.json', reportDir), JSON.stringify({ results, failed: bad }, null, 2) + '\n');
process.exit(bad.length ? 1 : 0);
