import * as cheerio from "cheerio";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const NOW = new Date().toISOString();
const SEASON = 2026;

const SOURCES = [
  {
    id: "tm-com-attendance",
    name: "Transfermarkt",
    url: "https://www.transfermarkt.com/chinese-super-league/besucherzahlen/wettbewerb/CSL",
    type: "team"
  },
  {
    id: "tm-com-development",
    name: "Transfermarkt",
    url: "https://www.transfermarkt.com/chinese-super-league/besucherzahlenentwicklung/wettbewerb/CSL",
    type: "development"
  },
  {
    id: "tm-uk-development",
    name: "Transfermarkt UK",
    url: "https://www.transfermarkt.co.uk/chinese-super-league/besucherzahlenentwicklung/wettbewerb/CSL",
    type: "development"
  },
  {
    id: "tm-jp-attendance",
    name: "Transfermarkt JP",
    url: "https://www.transfermarkt.jp/chinese-super-league/besucherzahlen/wettbewerb/CSL",
    type: "team"
  }
];

const TEAM_CN = {
  "Dalian Yingbo": "大连英博",
  "Beijing Guoan": "北京国安",
  "Shanghai Shenhua": "上海申花",
  "Chengdu Rongcheng": "成都蓉城",
  "Chongqing Tonglianglong": "重庆铜梁龙",
  "Shandong Taishan": "山东泰山",
  "Qingdao Hainiu": "青岛海牛",
  "Zhejiang FC": "浙江队",
  "Tianjin Jinmen Tiger": "天津津门虎",
  "Liaoning Tieren": "辽宁铁人",
  "Shanghai Port": "上海海港",
  "Yunnan Yukun": "云南玉昆",
  "Henan FC": "河南队",
  "Wuhan Three Towns": "武汉三镇",
  "Shenzhen Peng City": "深圳新鹏城",
  "Qingdao West Coast": "青岛西海岸"
};

const STADIUM_CN = {
  "Dalian Suoyuwan Football Stadium": "大连梭鱼湾足球场",
  "Workers Stadium": "北京工人体育场",
  "Shanghai Stadium": "上海体育场",
  "Phoenix Hill Sports Park Football Stadium": "凤凰山体育公园专业足球场",
  "Chongqing Longxing Football Stadium": "重庆龙兴足球场",
  "Ji'nan Olympic Sports Center": "济南奥体中心",
  "Qingdao Youth Football Stadium": "青岛青春足球场",
  "Huanglong Sports Centre Stadium": "黄龙体育中心",
  "TEDA Football Stadium": "泰达足球场",
  "Tiexi New District Sports Center Stadium": "铁西体育场",
  "Pudong Football Stadium": "浦东足球场",
  "Yuxi Plateau Sports Center Stadium": "玉溪高原体育中心",
  "Zhengzhou Hanghai Stadium": "郑州航海体育场",
  "Wuhan Sports Center Stadium": "武汉体育中心",
  "Bao'an Stadium": "宝安体育场",
  "West Coast University City Sports Center Stadium": "西海岸大学城体育中心"
};

function normalizeNumber(value) {
  if (value === null || value === undefined) return 0;
  const raw = String(value).trim();
  if (!raw || raw === "-") return 0;
  const cleaned = raw.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/\./g, ""));
  if (/^\d{1,3}(,\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/,/g, ""));
  const parsed = Number(cleaned.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatError(error) {
  return error && error.message ? error.message : String(error);
}

async function getHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8"
    }
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function parseAttendanceHtml(html, source) {
  const $ = cheerio.load(html);
  const table = $("table.items").first();
  if (!table.length) throw new Error("Transfermarkt attendance table not found");

  const teams = [];
  table.find("> tbody > tr").each((index, row) => {
    const cells = $(row).children("td").map((_, cell) => $(cell).text().replace(/\s+/g, " ").trim()).get();
    const links = $(row).children("td").eq(1).find("a")
      .map((_, link) => $(link).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);
    if (cells.length < 5 || links.length < 2) return;

    const stadium = links[0];
    const team = links[1];
    const capacity = normalizeNumber(cells[2]);
    const totalAttendance = normalizeNumber(cells[3]);
    const averageAttendance = normalizeNumber(cells[4]);
    const occupancyRate = capacity ? averageAttendance / capacity : null;

    teams.push({
      rank: normalizeNumber(cells[0]) || index + 1,
      team,
      teamCn: TEAM_CN[team] || team,
      stadium,
      stadiumCn: STADIUM_CN[stadium] || stadium,
      capacity,
      matches: averageAttendance ? Math.round(totalAttendance / averageAttendance) : 0,
      totalAttendance,
      averageAttendance,
      occupancyRate,
      source: source.name
    });
  });

  validateTeams(teams);
  const totalCells = table.find("> tfoot > tr > td").map((_, cell) => $(cell).text().replace(/\s+/g, " ").trim()).get();
  const totalAttendance = normalizeNumber(totalCells[3] || teams.reduce((sum, team) => sum + team.totalAttendance, 0));
  const averageAttendance = normalizeNumber(totalCells[4] || Math.round(totalAttendance / teams.reduce((sum, team) => sum + team.matches, 0)));
  const matches = teams.reduce((sum, team) => sum + team.matches, 0) || (averageAttendance ? Math.round(totalAttendance / averageAttendance) : 0);
  const highest = [...teams].sort((a, b) => b.averageAttendance - a.averageAttendance)[0];

  return {
    league: "csl",
    leagueName: "中超",
    season: SEASON,
    type: "attendance",
    source: "Transfermarkt",
    sourceUrl: source.url,
    isOfficial: false,
    mode: "third_party",
    fetchedAt: NOW,
    schemaVersion: 1,
    summary: {
      matches,
      totalAttendance,
      averageAttendance,
      highestAverageTeam: highest.team,
      highestAverageAttendance: highest.averageAttendance
    },
    teams,
    matches: [],
    trend: []
  };
}

function parseTrendHtml(html) {
  const $ = cheerio.load(html);
  const table = $("table.items").first();
  const trend = [];
  table.find("> tbody > tr").each((_, row) => {
    const cells = $(row).children("td").map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim()).get();
    if (cells.length < 4 || !cells[0]) return;
    trend.push({
      season: cells[0],
      matches: normalizeNumber(cells[1]),
      totalAttendance: normalizeNumber(cells[2]),
      averageAttendance: normalizeNumber(cells[3]),
      highestAverageTeam: cells[5] || "",
      highestAverageAttendance: normalizeNumber(cells[6])
    });
  });
  return trend;
}

function validateTeams(teams) {
  if (!Array.isArray(teams) || teams.length < 8) {
    throw new Error(`Attendance data has too few teams: ${teams?.length || 0}`);
  }
  teams.forEach(team => {
    if (typeof team.capacity !== "number" || typeof team.averageAttendance !== "number") {
      throw new Error(`${team.team} has invalid capacity or average attendance`);
    }
    if (team.occupancyRate !== null && (team.occupancyRate < 0 || team.occupancyRate > 1.2)) {
      throw new Error(`${team.team} has out-of-range occupancy rate ${team.occupancyRate}`);
    }
  });
}

async function writeJson(fileName, payload) {
  await writeFile(path.join(DATA_DIR, fileName), `${JSON.stringify(payload, null, 2)}\n`);
}

async function readExistingMeta() {
  const file = path.join(DATA_DIR, "attendance-meta.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const logs = [];
  let attendance = null;
  let usedSource = null;

  for (const source of SOURCES) {
    try {
      const html = await getHtml(source.url);
      attendance = parseAttendanceHtml(html, source);
      usedSource = source;
      logs.push({ level: "info", source: source.id, message: `Fetched ${attendance.teams.length} attendance rows from ${source.url}` });
      break;
    } catch (error) {
      logs.push({ level: "warning", source: source.id, message: formatError(error) });
    }
  }

  if (attendance) {
    try {
      const trendHtml = await getHtml(SOURCES[1].url);
      attendance.trend = parseTrendHtml(trendHtml);
      logs.push({ level: "info", source: SOURCES[1].id, message: `Fetched ${attendance.trend.length} attendance trend rows` });
    } catch (error) {
      logs.push({ level: "warning", source: SOURCES[1].id, message: `Attendance trend unavailable: ${formatError(error)}` });
    }
    await writeJson("attendance-csl.json", attendance);
    await writeJson("attendance-meta.json", {
      updatedAt: NOW,
      status: "ok",
      mode: "third_party",
      source: usedSource.name,
      sourceUrl: usedSource.url,
      isOfficial: false,
      teamsCount: attendance.teams.length,
      logs
    });
    console.log(`[write] data/attendance-csl.json: ${attendance.teams.length} teams from ${usedSource.url}`);
    console.log("[write] data/attendance-meta.json: ok");
    return;
  }

  const previous = readExistingMeta();
  await writeJson("attendance-meta.json", {
    updatedAt: NOW,
    status: "error",
    mode: previous?.mode || "mock",
    source: previous?.source || "none",
    sourceUrl: previous?.sourceUrl || "",
    isOfficial: false,
    preservedPreviousData: existsSync(path.join(DATA_DIR, "attendance-csl.json")),
    logs
  });
  console.error("[error] Transfermarkt attendance fetch failed; preserved previous attendance-csl.json if present");
  process.exitCode = existsSync(path.join(DATA_DIR, "attendance-csl.json")) ? 0 : 1;
}

main().catch(error => {
  console.error(`[fatal] ${error.stack || error.message}`);
  process.exitCode = 1;
});
