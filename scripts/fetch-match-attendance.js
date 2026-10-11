import * as cheerio from 'cheerio';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SOURCE = 'https://www.transfermarkt.com';
// Transfermarkt labels saison_id=2025 as calendar season 2026; validate the visible label.
const FIXTURES_URL = `${SOURCE}/chinese-super-league/gesamtspielplan/wettbewerb/CSL/saison_id/2025`;
const OUTPUT = 'data/csl-match-attendance.json';
const META = 'data/match-attendance-meta.json';
const SEASON = 2026;

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}
async function writeJson(path, data) {
  await writeFile(`${path}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
}
async function getHtml(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: {
    'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9'
  }});
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${url}`);
    error.status = response.status;
    throw error;
  }
  return response.text();
}

export function parseFixtures(html) {
  const $ = cheerio.load(html);
  if ($('select[name=saison_id] option:selected').text().trim() !== String(SEASON)) throw new Error('Unexpected season label');
  const matches = [];
  $('table').each((_, table) => {
    let date = null;
    const round = Number($(table).prevAll('.content-box-headline').first().text().match(/\d+/)?.[0]);
    if (!round) return;
    $(table).find('tbody > tr').each((__, row) => {
      const dateLink = $(row).find('a[href*="/datum/"]').attr('href');
      if (dateLink) date = dateLink.match(/datum\/(\d{4}-\d{2}-\d{2})/)?.[1] || date;
      const report = $(row).find('a.ergebnis-link').first();
      const score = report.text().trim().match(/^(\d+):(\d+)$/);
      if (!score) return;
      const clubs = $(row).find('td.hauptlink a[href*="/verein/"]');
      const homeTeam = clubs.first().attr('title');
      const awayTeam = clubs.last().attr('title');
      const id = report.attr('href')?.match(/spielbericht\/(\d+)/)?.[1];
      if (!id || !homeTeam || !awayTeam || !date?.startsWith(`${SEASON}-`)) throw new Error('Invalid match identity/date');
      matches.push({ id, round, date, homeTeam, awayTeam, homeScore: Number(score[1]), awayScore: Number(score[2]), sourceUrl: new URL(report.attr('href'), SOURCE).href });
    });
  });
  if (matches.length < 8 || new Set(matches.map(row => row.id)).size !== matches.length) throw new Error('Invalid fixture coverage or duplicate match IDs');
  return matches.sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round);
}

export function parseReport(html) {
  const $ = cheerio.load(html);
  const info = $('.sb-spieldaten');
  if (!info.length) throw new Error('Match report unavailable');
  const attendanceText = info.text().match(/Attendance:\s*([\d.,]+)(?=\s|$)/i)?.[1];
  const attendance = attendanceText ? Number(attendanceText.replace(/[.,]/g, '')) : null;
  const stadiumLink = info.find('a[href*="/stadion/"]').first();
  const stadium = stadiumLink.text().trim() || null;
  if (attendance !== null && (!Number.isInteger(attendance) || attendance < 0 || attendance > 150000)) throw new Error('Invalid attendance');
  return { attendance, stadium, stadiumSourceUrl: stadiumLink.attr('href') ? new URL(stadiumLink.attr('href'), SOURCE).href : null };
}

export function applyCapacity(report, teams, sourceUrl, fetchedAt) {
  const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const stadium = report.stadium && teams.find(team => key(team.stadium) === key(report.stadium));
  if (!stadium && report.capacitySourceUrl && Number.isFinite(report.capacity)) return report;
  const capacity = stadium && Number.isFinite(stadium.capacity) && stadium.capacity > 0 ? stadium.capacity : null;
  const rate = report.attendance !== null && capacity ? report.attendance / capacity : null;
  return { ...report, stadiumCn: stadium?.stadiumCn || report.stadium, capacity,
    capacityBasis: 'listed_stadium_capacity', capacitySourceUrl: capacity ? sourceUrl : null,
    capacityFetchedAt: capacity ? fetchedAt : null,
    occupancyRate: rate !== null && rate <= 1.2 ? rate : null,
    qualityNote: rate > 1.2 ? 'Attendance/capacity conflict; occupancy withheld' : rate > 1 ? 'Attendance exceeds listed capacity; verify capacity basis' : null
  };
}

async function main() {
  await mkdir('data', { recursive: true });
  const previous = await readJson(OUTPUT, null);
  const attendance = await readJson('data/csl-attendance.json', { teams: [] });
  const teams = attendance.mode === 'mock' ? [] : attendance.teams;
  const now = new Date().toISOString();
  const logs = [];
  let matches;
  try { matches = parseFixtures(await getHtml(FIXTURES_URL)); }
  catch (error) {
    await writeJson(META, { status: 'error', attemptedAt: now, lastSuccessAt: previous?.fetchedAt || null, error: error.message });
    throw error;
  }
  const oldRows = new Map((previous?.matches || []).map(row => [row.id, row]));
  const limit = Number(process.env.MATCH_FETCH_LIMIT || 240);
  let requested = 0;
  let fetched = 0;
  let blocked = false;
  const output = [];
  for (const match of matches) {
    const old = oldRows.get(match.id);
    let row = old || { ...match, attendance: null, capacity: null, occupancyRate: null, stadium: null, fetchedAt: null };
    // Completed reports are rechecked weekly. Prior success survives any refresh failure.
    const needsFetch = !old?.fetchedAt || old.attendance === null || Date.now() - Date.parse(old.fetchedAt) > 7 * 86400000;
    if (needsFetch && requested < limit && !blocked) {
      requested++;
      try {
        const report = parseReport(await getHtml(match.sourceUrl));
        row = { ...match, ...report, fetchedAt: new Date().toISOString() };
        if (report.attendance === null && old?.attendance !== null && old?.attendance !== undefined) row = old;
        else fetched++;
      } catch (error) {
        logs.push({ id: match.id, error: error.message });
        if (error.status === 403 || error.status === 429) blocked = true;
      }
      if (requested % 20 === 0) console.log(`[match] ${requested}/${matches.length} requested; ${fetched} successful`);
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    const home = teams.find(team => team.team === match.homeTeam);
    const away = teams.find(team => team.team === match.awayTeam);
    output.push({ ...row, ...applyCapacity(row, teams, attendance.sourceUrl, attendance.fetchedAt),
      homeTeamCn: home?.teamCn || match.homeTeam, awayTeamCn: away?.teamCn || match.awayTeam,
      source: 'Transfermarkt', isOfficial: false, mode: 'third_party'
    });
  }
  // Never replace a previous successful dataset with an all-failed scrape.
  if (output.some(row => row.attendance !== null)) {
    const sourceIds = new Set(output.map(row => row.id));
    for (const row of previous?.matches || []) if (!sourceIds.has(row.id)) output.push(row);
    await writeJson(OUTPUT, { league: 'csl', season: SEASON, type: 'match_attendance', schemaVersion: 1,
      source: 'Transfermarkt', sourceUrl: FIXTURES_URL, isOfficial: false, mode: 'third_party',
      fetchedAt: fetched ? new Date().toISOString() : previous?.fetchedAt || null,
      fixturesFetchedAt: now, coverage: { sourceMatches: matches.length, withAttendance: output.filter(row => row.attendance !== null).length,
        withOccupancy: output.filter(row => row.occupancyRate !== null).length }, matches: output });
  }
  await writeJson(META, { status: logs.length || blocked ? 'partial' : fetched || requested === 0 ? 'ok' : 'error', attemptedAt: now,
    requested, fetched, errors: logs, lastSuccessAt: fetched ? new Date().toISOString() : previous?.fetchedAt || null });
  console.log(`[match] ${output.filter(row => row.occupancyRate !== null).length}/${matches.length} matches with occupancy; ${logs.length} errors`);
  if (!output.some(row => row.attendance !== null)) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error); process.exitCode = 1; });
