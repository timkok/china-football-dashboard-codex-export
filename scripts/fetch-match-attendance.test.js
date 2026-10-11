import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFixtures, parseReport, applyCapacity } from './fetch-match-attendance.js';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('single-match crowd is parsed, never a team average', () => {
  const parsed = parseReport('<div class="sb-spieldaten"><a href="/stadion/stadion/verein/1">Stadium</a> Attendance: 41.219 </div>');
  assert.equal(parsed.attendance, 41219);
  const row = applyCapacity(parsed, [{ stadium:'Stadium', capacity:60000, averageAttendance:30000 }], 'https://example.com', '2026-10-11');
  assert.equal(row.occupancyRate, 41219/60000);
});
test('unreported attendance stays null and reported zero stays zero', () => {
  assert.equal(parseReport('<div class="sb-spieldaten">Attendance: -</div>').attendance, null);
  assert.equal(parseReport('<div class="sb-spieldaten">Attendance: 0 </div>').attendance, 0);
});
test('capacity must match actual reported stadium, not just home team', () => {
  const row = applyCapacity({stadium:'Alternate ground',attendance:10000}, [{stadium:'Home ground',capacity:50000}], '', '');
  assert.equal(row.capacity, null);
  assert.equal(row.occupancyRate, null);
});
test('implausible occupancy withheld', () => {
  assert.equal(applyCapacity({stadium:'Ground',attendance:70000},[{stadium:'Ground',capacity:10000}], '', '').occupancyRate,null);
});
test('verification or empty HTML is not a report', () => assert.throws(()=>parseReport('<h1>Verification required</h1>')));
test('network failure preserves previous successful file byte-for-byte', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'football-match-test-'));
  try {
    await mkdir(join(cwd,'data'));
    const original = JSON.stringify({fetchedAt:'2026-10-01T00:00:00Z',matches:[{id:'preserved',attendance:20000}]});
    const path = join(cwd,'data/csl-match-attendance.json');
    await writeFile(path,original);
    const loader = 'data:text/javascript,' + encodeURIComponent('globalThis.fetch = async () => { throw new Error("simulated network failure"); };');
    const run = spawnSync(process.execPath, ['--import', loader, fileURLToPath(new URL('./fetch-match-attendance.js',import.meta.url))], {cwd,encoding:'utf8'});
    assert.equal(run.status,1);
    assert.equal(await readFile(path,'utf8'),original);
    assert.equal(JSON.parse(await readFile(join(cwd,'data/match-attendance-meta.json'),'utf8')).status,'error');
  } finally { await rm(cwd,{recursive:true,force:true}); }
});
test('fixtures validate season, unique IDs and shared dates', () => {
  const rows = Array.from({length:8}, (_,i)=>`<tr>${i === 0 ? '<td><a href="/datum/2026-10-01">date</a></td>' : ''}<td class="hauptlink"><a title="Home ${i}" href="/verein/${i}">H</a></td><td><a class="ergebnis-link" href="/spielbericht/${i}">2:1</a></td><td class="hauptlink"><a title="Away ${i}" href="/verein/${i+10}">A</a></td></tr>`).join('');
  const html = `<select name="saison_id"><option selected>2026</option></select><div class="content-box-headline">27.Matchday</div><table><tbody>${rows}</tbody></table>`;
  assert.equal(parseFixtures(html).length,8);
  assert.equal(parseFixtures(html)[7].date,'2026-10-01');
  assert.throws(()=>parseFixtures(html.replace('<option selected>2026','<option selected>2025')));
});
