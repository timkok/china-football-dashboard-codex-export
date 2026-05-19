import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const NOW = new Date().toISOString();
const EXPECTED_ROUNDS = 30;

async function readJson(fileName) {
  return JSON.parse(await readFile(path.join(DATA_DIR, fileName), "utf8"));
}

function validateStandings(payload) {
  const issues = [];
  if (!Array.isArray(payload.data) || payload.data.length < 8) issues.push("standings has fewer than 8 teams");
  (payload.data || []).forEach((row, index) => {
    for (const field of ["played", "points", "wins", "draws", "losses", "goalsFor", "goalsAgainst", "goalDiff"]) {
      if (typeof row[field] !== "number") issues.push(`row ${index + 1} invalid ${field}`);
    }
  });
  return issues;
}

function scheduleCompleteness(fixturesPayload) {
  const fixtures = fixturesPayload.data || [];
  const rounds = [...new Set(fixtures.map(match => Number(match.round)).filter(Number.isFinite))].sort((a, b) => a - b);
  const missingRounds = Array.from({ length: EXPECTED_ROUNDS }, (_, index) => index + 1).filter(round => !rounds.includes(round));
  const seen = new Set();
  const anomalies = [];
  fixtures.forEach(match => {
    if (!match.date) anomalies.push({ type: "missing_time", match: match.id || `${match.homeTeam}-${match.awayTeam}` });
    if (match.status === "finished" && (match.homeScore === null || match.awayScore === null)) anomalies.push({ type: "finished_without_score", match: match.id || `${match.homeTeam}-${match.awayTeam}` });
    const key = `${match.round}|${match.homeTeam}|${match.awayTeam}|${match.date}`;
    if (seen.has(key)) anomalies.push({ type: "duplicate_match", match: key });
    seen.add(key);
  });
  return {
    expectedRounds: EXPECTED_ROUNDS,
    fetchedRounds: rounds,
    fetchedRoundsCount: rounds.length,
    missingRounds,
    anomalyCount: anomalies.length,
    anomalies
  };
}

async function main() {
  const leagues = {};
  const issues = [];
  for (const league of ["csl", "cl1", "cl2"]) {
    const standings = await readJson(`${league}-standings.json`);
    const fixtures = await readJson(`${league}-fixtures.json`);
    const standingsIssues = validateStandings(standings);
    if (standingsIssues.length) issues.push({ league, type: "standings", issues: standingsIssues });
    leagues[league] = {
      standings: standingsIssues.length ? "warning" : standings.mode || "ok",
      fixtures: fixtures.mode || "mock",
      scheduleCompleteness: scheduleCompleteness(fixtures)
    };
  }
  const attendance = await readJson("attendance-csl.json");
  if (!Array.isArray(attendance.teams) || attendance.teams.length < 8) issues.push({ league: "csl", type: "attendance", issues: ["attendance has fewer than 8 teams"] });

  const payload = {
    generatedAt: NOW,
    status: issues.length ? "warning" : "ok",
    expectedRounds: EXPECTED_ROUNDS,
    leagues,
    issues
  };
  await writeFile(path.join(DATA_DIR, "data-quality.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[write] data/data-quality.json: ${payload.status}`);
}

main().catch(error => {
  console.error(`[fatal] ${error.stack || error.message}`);
  process.exitCode = 1;
});
