import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const NOW = new Date().toISOString();

async function readJson(fileName, fallback = null) {
  const file = path.join(DATA_DIR, fileName);
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, "utf8"));
}

function byName(rows, field = "team") {
  return new Map((rows || []).map(row => [row[field] || row.name || row.teamCn, row]));
}

function diffStandings(previous, current) {
  const prev = byName(previous?.snapshot?.standings || []);
  return (current.data || []).map(row => {
    const old = prev.get(row.team || row.name);
    return {
      team: row.team || row.name,
      rank: row.rank,
      rankChange: old ? old.rank - row.rank : 0,
      points: row.points,
      pointsChange: old ? row.points - old.points : 0
    };
  }).filter(row => row.rankChange || row.pointsChange).slice(0, 12);
}

function diffAttendance(previous, current) {
  const prev = byName(previous?.snapshot?.attendance || [], "team");
  return (current.teams || []).map(row => {
    const old = prev.get(row.team);
    return {
      team: row.team,
      teamCn: row.teamCn,
      averageAttendance: row.averageAttendance,
      averageAttendanceChange: old ? row.averageAttendance - old.averageAttendance : 0,
      occupancyRate: row.occupancyRate,
      occupancyRateChange: old ? row.occupancyRate - old.occupancyRate : 0
    };
  }).filter(row => row.averageAttendanceChange || row.occupancyRateChange).slice(0, 12);
}

function generateSourceComparison(csl, attendance) {
  return {
    generatedAt: NOW,
    status: "ok",
    comparisons: [
      {
        fieldGroup: "standings",
        league: "csl",
        primarySource: csl.source,
        primarySourceUrl: csl.sourceUrl,
        comparedSources: [],
        conflicts: [],
        note: "当前积分榜只有一个可解析结构化来源；发现第二来源后将逐字段比对排名和积分。"
      },
      {
        fieldGroup: "attendance",
        league: "csl",
        primarySource: attendance.source,
        primarySourceUrl: attendance.sourceUrl,
        comparedSources: [],
        conflicts: [],
        note: "观众人数当前使用 Transfermarkt 单源数据；后续接入 FootyStats 后比对总观众、场均观众和上座率。"
      }
    ]
  };
}

async function main() {
  const previous = await readJson("changelog.json", null);
  const csl = await readJson("csl-standings.json");
  const attendance = await readJson("attendance-csl.json");
  const dataQuality = await readJson("data-quality.json", { issues: [] });
  const standingChanges = diffStandings(previous, csl);
  const attendanceChanges = diffAttendance(previous, attendance);

  const changelog = {
    generatedAt: NOW,
    summary: {
      rankingChanges: standingChanges.length,
      pointsChanges: standingChanges.filter(row => row.pointsChange).length,
      attendanceChanges: attendanceChanges.length,
      anomalyChanges: dataQuality.issues?.length || 0
    },
    rankingChanges: standingChanges,
    pointsChanges: standingChanges.filter(row => row.pointsChange),
    attendanceChanges,
    anomalyChanges: dataQuality.issues || [],
    snapshot: {
      standings: (csl.data || []).map(row => ({ team: row.team || row.name, rank: row.rank, points: row.points })),
      attendance: (attendance.teams || []).map(row => ({ team: row.team, averageAttendance: row.averageAttendance, occupancyRate: row.occupancyRate }))
    }
  };
  await writeFile(path.join(DATA_DIR, "changelog.json"), `${JSON.stringify(changelog, null, 2)}\n`);
  await writeFile(path.join(DATA_DIR, "source-comparison.json"), `${JSON.stringify(generateSourceComparison(csl, attendance), null, 2)}\n`);
  console.log("[write] data/changelog.json");
  console.log("[write] data/source-comparison.json");
}

main().catch(error => {
  console.error(`[fatal] ${error.stack || error.message}`);
  process.exitCode = 1;
});
