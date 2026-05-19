import * as cheerio from "cheerio";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const NOW = new Date().toISOString();
const SOURCE_URL = "https://www.transfermarkt.com/chinese-super-league/besucherzahlenentwicklung/wettbewerb/CSL";

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

function seasonEndYear(season) {
  const match = String(season).match(/(\d{2})\/(\d{2})/);
  if (!match) return Number(season) || 0;
  return 2000 + Number(match[2]);
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

function parseHistory(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $("table.items").first().find("> tbody > tr").each((_, row) => {
    const cells = $(row).children("td").map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim()).get();
    if (cells.length < 4 || !cells[0]) return;
    rows.push({
      season: cells[0],
      seasonEndYear: seasonEndYear(cells[0]),
      matches: normalizeNumber(cells[1]),
      totalAttendance: normalizeNumber(cells[2]),
      averageAttendance: normalizeNumber(cells[3]),
      highestAverageTeam: cells[5] || "",
      highestAverageAttendance: normalizeNumber(cells[6])
    });
  });

  const filtered = rows
    .filter(row => row.seasonEndYear >= 2024 && row.seasonEndYear <= 2026)
    .sort((a, b) => a.seasonEndYear - b.seasonEndYear)
    .map((row, index, array) => {
      const previous = array[index - 1];
      const yoyGrowth = previous && previous.averageAttendance
        ? (row.averageAttendance - previous.averageAttendance) / previous.averageAttendance
        : null;
      return { ...row, yoyGrowth };
    });

  if (filtered.length < 2) throw new Error(`Too few recent attendance history rows: ${filtered.length}`);
  return filtered;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const html = await getHtml(SOURCE_URL);
  const data = parseHistory(html);
  const payload = {
    league: "csl",
    leagueName: "中超",
    season: 2026,
    type: "attendance_history",
    source: "Transfermarkt",
    sourceUrl: SOURCE_URL,
    isOfficial: false,
    mode: "third_party",
    fetchedAt: NOW,
    schemaVersion: 1,
    data
  };
  await writeFile(path.join(DATA_DIR, "attendance-history-csl.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[write] data/attendance-history-csl.json: ${data.length} rows`);
}

main().catch(error => {
  console.error(`[fatal] ${error.stack || error.message}`);
  process.exitCode = 1;
});
