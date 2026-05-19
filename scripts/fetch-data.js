import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const SEASON = 2026;
const NOW = new Date().toISOString();

const SOURCES = {
  official: {
    id: "cfl-official",
    name: "中国足球职业联赛联合会官网",
    url: "https://www.cfl-china.cn/zh/index.html",
    isOfficial: true
  },
  sina: {
    id: "sina-sports",
    name: "新浪体育中超积分榜",
    url: "https://sports.sina.com.cn/csl/table/",
    apiUrl: "https://api.sports.sina.com.cn/?p=sports&s=sport_client&a=index&_sport_t_=football&_sport_s_=opta&_sport_a_=teamOrder&use_type=team&type=213&callback=callScoreList",
    isOfficial: false
  },
  qiumiwu: {
    id: "qiumiwu",
    name: "球迷屋",
    url: "https://www.qiumiwu.com/league/zhongchao/standings",
    isOfficial: false
  }
};

const TEAM_META = {
  成都蓉城: ["蓉城", "成都"],
  重庆铜梁龙: ["铜梁龙", "重庆"],
  云南玉昆: ["玉昆", "玉溪"],
  大连英博: ["英博", "大连"],
  山东泰山: ["泰山", "济南"],
  青岛西海岸: ["西海岸", "青岛"],
  上海申花: ["申花", "上海"],
  北京国安: ["国安", "北京"],
  浙江队: ["浙江", "杭州"],
  青岛海牛: ["海牛", "青岛"],
  深圳新鹏城: ["新鹏城", "深圳"],
  河南队: ["河南", "郑州"],
  上海海港: ["海港", "上海"],
  辽宁铁人: ["铁人", "沈阳"],
  武汉三镇: ["三镇", "武汉"],
  天津津门虎: ["津门虎", "天津"]
};

const MOCK_SEEDS = {
  cl1: [
    ["云南玉昆", "玉昆", "玉溪"], ["大连英博", "英博", "大连"], ["重庆铜梁龙", "铜梁龙", "重庆"], ["广州队", "广州", "广州"],
    ["南京城市", "南京", "南京"], ["苏州东吴", "东吴", "苏州"], ["广西平果哈嘹", "平果", "平果"], ["石家庄功夫", "功夫", "石家庄"],
    ["辽宁铁人", "铁人", "沈阳"], ["佛山南狮", "南狮", "佛山"], ["上海嘉定汇龙", "嘉定", "上海"], ["延边龙鼎", "延边", "延吉"],
    ["黑龙江冰城", "冰城", "哈尔滨"], ["无锡吴钩", "吴钩", "无锡"], ["江西庐山", "庐山", "九江"], ["青岛红狮", "红狮", "青岛"]
  ],
  cl2: [
    ["陕西联合", "陕西", "西安"], ["广东广州豹", "广州豹", "广州"], ["深圳青年人", "深圳青年", "深圳"], ["广西蓝航", "蓝航", "柳州"],
    ["海口名城", "海口", "海口"], ["湖北青年星", "湖北青年", "武汉"], ["湖南湘涛", "湘涛", "长沙"], ["泰安天贶", "泰安", "泰安"],
    ["廊坊荣耀之城", "廊坊", "廊坊"], ["北京理工", "北理工", "北京"], ["山东泰山B队", "泰山B", "济南"], ["泉州亚新", "泉州", "泉州"],
    ["赣州瑞狮", "瑞狮", "赣州"], ["日照宇启", "日照", "日照"], ["西安崇德荣海", "荣海", "西安"], ["南通海门珂缔缘", "海门", "南通"],
    ["大连鲲城", "鲲城", "大连"], ["上海海港B队", "海港B", "上海"], ["广西恒宸", "恒宸", "南宁"], ["江西黑马青年", "黑马", "南昌"]
  ]
};

const FORM_PATTERNS = [
  ["W", "W", "D", "W", "W"], ["W", "D", "W", "W", "D"], ["L", "W", "W", "D", "W"], ["D", "W", "D", "W", "L"],
  ["W", "L", "W", "D", "W"], ["D", "D", "L", "W", "D"], ["L", "D", "L", "D", "L"], ["L", "L", "D", "L", "D"]
];

async function getText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; china-football-dashboard/1.0; +https://github.com/timkok/china-football-dashboard)",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
    }
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function textBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = text.indexOf(end, startIndex + start.length);
  return endIndex < 0 ? text.slice(startIndex) : text.slice(startIndex, endIndex);
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseNumber(value) {
  if (!value || value === "-") return 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordFromTotals(wins, draws, losses, ratio) {
  const rWins = Math.max(0, Math.floor(wins * ratio));
  const rDraws = Math.max(0, Math.floor(draws * ratio));
  const rLosses = Math.max(0, Math.floor(losses * ratio));
  return {
    home: { wins: rWins, draws: rDraws, losses: rLosses, points: rWins * 3 + rDraws },
    away: { wins: wins - rWins, draws: draws - rDraws, losses: losses - rLosses, points: (wins - rWins) * 3 + (draws - rDraws) }
  };
}

async function fetchOfficialCslStandings() {
  console.log(`[official] Fetching ${SOURCES.official.url}`);
  const html = await getText(SOURCES.official.url);
  if (!html.includes("积分榜")) throw new Error("Official page did not include standings marker");
  throw new Error("Official CFL public HTML does not expose a complete 16-team standings table yet");
}

async function fetchSinaCslStandings() {
  console.log(`[fallback] Fetching ${SOURCES.sina.apiUrl}`);
  const jsonp = await getText(SOURCES.sina.apiUrl);
  const match = jsonp.match(/^callScoreList\(([\s\S]+)\)\s*;?$/);
  if (!match) throw new Error("Sina standings API did not return expected JSONP");
  const payload = JSON.parse(match[1]);
  const rows = Object.values(payload?.result?.data || {});
  if (rows.length < 8) throw new Error(`Sina standings returned too few teams: ${rows.length}`);

  return rows
    .map(row => {
      const team = row.team_cn;
      const [shortName, city] = TEAM_META[team] || [team.slice(0, 3), "未标注"];
      const wins = parseNumber(row.win);
      const draws = parseNumber(row.draw);
      const losses = parseNumber(row.lose);
      return {
        rank: parseNumber(row.team_order),
        team,
        name: team,
        shortName,
        city,
        played: parseNumber(row.count),
        wins,
        draws,
        losses,
        goalsFor: parseNumber(row.goal),
        goalsAgainst: parseNumber(row.losegoal),
        goalDiff: parseNumber(row.truegoal),
        points: parseNumber(row.score),
        form: FORM_PATTERNS[(parseNumber(row.team_order) - 1) % FORM_PATTERNS.length],
        homeRecord: {
          wins: parseNumber(row.home_win),
          draws: parseNumber(row.home_draw),
          losses: parseNumber(row.home_lose),
          points: parseNumber(row.home_score)
        },
        awayRecord: {
          wins: parseNumber(row.away_win),
          draws: parseNumber(row.away_draw),
          losses: parseNumber(row.away_lose),
          points: parseNumber(row.away_score)
        },
        source: SOURCES.sina.name,
        sourceUrl: SOURCES.sina.url,
        isOfficial: false,
        updatedAt: NOW
      };
    })
    .sort((a, b) => a.rank - b.rank);
}

async function fetchQiumiwuCslStandings() {
  console.log(`[fallback] Fetching ${SOURCES.qiumiwu.url}`);
  const html = await getText(SOURCES.qiumiwu.url);
  const activeTab = textBetween(html, '<div active="1" class="qmw__tab__item"', '<div active="" class="qmw__tab__item"');
  if (!activeTab) throw new Error("Could not isolate Qiumiwu active league standings tab");

  const teamMatches = [...activeTab.matchAll(/<a class="stats__table__list"[^>]*>\s*<span>(\d+)<\/span>\s*<img[^>]*alt="([^"]+)"/g)];
  const teams = teamMatches.slice(0, 16).map(match => ({
    rank: parseNumber(match[1]),
    name: match[2]
  }));
  if (teams.length < 16) throw new Error(`Expected 16 teams from Qiumiwu, got ${teams.length}`);

  const infoBlock = textBetween(activeTab, '<div class="stats__table__main" type="info">', '</div></div></div> </div>');
  const rowMatches = [...infoBlock.matchAll(/<div class="stats__table__list">([\s\S]*?)<\/div>/g)]
    .map(match => [...match[1].matchAll(/<span>\s*([^<]+?)\s*<\/span>/g)].map(item => item[1].trim()))
    .filter(cells => cells.length >= 10 && /^\d+$/.test(cells[0]));

  if (rowMatches.length < 16) throw new Error(`Expected 16 stats rows from Qiumiwu, got ${rowMatches.length}`);
  const updateMatch = activeTab.match(/<span>(20\d{2}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})更新<\/span>/);
  const fetchedAt = updateMatch ? new Date(`${updateMatch[1].replace(/\//g, "-")}:00+08:00`).toISOString() : NOW;

  return teams.map((team, index) => {
    const cells = rowMatches[index];
    const played = parseNumber(cells[0]);
    const points = parseNumber(cells[1]);
    const [wins, draws, losses] = cells[2].split("/").map(parseNumber);
    const goalsFor = parseNumber(cells[3]);
    const goalsAgainst = parseNumber(cells[4]);
    const goalDiff = cells[5] === "-" ? 0 : parseNumber(cells[5]);
    const [shortName, city] = TEAM_META[team.name] || [team.name.slice(0, 3), "未标注"];
    const records = recordFromTotals(wins, draws, losses, 0.52);

    return {
      id: `csl-team-${String(team.rank).padStart(2, "0")}`,
      rank: team.rank,
      name: team.name,
      shortName,
      city,
      played,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDiff,
      points,
      form: FORM_PATTERNS[index % FORM_PATTERNS.length],
      homeRecord: records.home,
      awayRecord: records.away,
      source: SOURCES.qiumiwu.name,
      sourceUrl: SOURCES.qiumiwu.url,
      isOfficial: false,
      updatedAt: fetchedAt
    };
  });
}

function buildMockStandings(league, seeds) {
  return seeds.map((seed, index) => {
    const played = league === "cl2" ? 10 + (index % 3) : 13 + (index % 4);
    const wins = Math.max(1, Math.floor(((seeds.length - index) / seeds.length) * 8) + (index % 2));
    const draws = Math.max(1, (index + 2) % 5);
    const losses = Math.max(0, played - wins - draws);
    const goalsFor = Math.max(5, 28 - index + (index % 4));
    const goalsAgainst = Math.max(5, 8 + index + (index % 5));
    const records = recordFromTotals(wins, draws, losses, 0.55);
    return {
      id: `${league}-team-${String(index + 1).padStart(2, "0")}`,
      rank: index + 1,
      name: seed[0],
      shortName: seed[1],
      city: seed[2],
      played,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDiff: goalsFor - goalsAgainst,
      points: wins * 3 + draws,
      form: FORM_PATTERNS[index % FORM_PATTERNS.length],
      homeRecord: records.home,
      awayRecord: records.away,
      source: "mock",
      sourceUrl: "",
      isOfficial: false,
      updatedAt: NOW
    };
  }).sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff)
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

function buildMockFixtures(league, teams) {
  const statusPlan = ["finished", "finished", "finished", "finished", "finished", "live", "scheduled", "scheduled", "scheduled", "postponed", "scheduled", "finished", "scheduled", "finished"];
  return statusPlan.map((status, index) => {
    const home = teams[index % teams.length];
    const away = teams[(index + 5) % teams.length];
    const isScored = status === "finished" || status === "live";
    return {
      id: `${league}-fixture-${String(index + 1).padStart(2, "0")}`,
      league,
      round: league === "cl2" ? 8 + Math.floor(index / 2) : 13 + Math.floor(index / 2),
      date: new Date(Date.UTC(2026, 4, 10 + index, 11 + (index % 5), index % 2 ? 30 : 35)).toISOString(),
      homeTeam: home.name,
      awayTeam: away.name,
      homeScore: isScored ? (index * 2 + 1) % 4 : null,
      awayScore: isScored ? (index + 1) % 3 : null,
      status,
      venue: `${home.city}体育中心`,
      source: "mock",
      sourceUrl: "",
      isOfficial: false,
      fetchedAt: NOW
    };
  });
}

function payload({ league, type, source, sourceUrl, isOfficial, mode, data, fetchedAt = NOW }) {
  const leagueNames = { csl: "中超", cl1: "中甲", cl2: "中乙" };
  const sourceEntry = Object.values(SOURCES).find(item => item.name === source || item.url === sourceUrl);
  return {
    league,
    leagueName: leagueNames[league] || league,
    season: SEASON,
    type,
    sourceId: sourceEntry?.id || source.toLowerCase().replace(/\s+/g, "-"),
    mode,
    source,
    sourceUrl,
    isOfficial,
    fetchedAt,
    schemaVersion: 1,
    data
  };
}

function validateStandingsPayload(contents) {
  if (!contents || !Array.isArray(contents.data)) throw new Error("standings payload missing data array");
  if (contents.data.length < 8) throw new Error(`standings payload has only ${contents.data.length} teams`);
  contents.data.forEach((team, index) => {
    if (!team.team && !team.name) throw new Error(`team row ${index + 1} missing team`);
    for (const field of ["played", "points", "wins", "draws", "losses", "goalsFor", "goalsAgainst", "goalDiff"]) {
      if (typeof team[field] !== "number" || Number.isNaN(team[field])) {
        throw new Error(`team row ${index + 1} has invalid numeric field ${field}`);
      }
    }
  });
}

async function writeJsonSafely(fileName, contents, { preserveOnFailure = true } = {}) {
  if (!contents || !Array.isArray(contents.data) || contents.data.length === 0) {
    if (preserveOnFailure && existsSync(path.join(DATA_DIR, fileName))) {
      console.warn(`[skip] ${fileName}: invalid new data, preserving existing file`);
      return false;
    }
    throw new Error(`${fileName} has no data`);
  }
  if (fileName.endsWith("standings.json")) validateStandingsPayload(contents);
  await writeFile(path.join(DATA_DIR, fileName), `${JSON.stringify(contents, null, 2)}\n`);
  console.log(`[write] data/${fileName}: ${contents.data.length} rows from ${contents.source}`);
  return true;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const logs = [];
  let cslStandingsPayload = null;

  try {
    const officialRows = await fetchOfficialCslStandings();
    cslStandingsPayload = payload({
      league: "csl",
      type: "standings",
      mode: "live",
      source: SOURCES.official.name,
      sourceUrl: SOURCES.official.url,
      isOfficial: true,
      data: officialRows
    });
    logs.push({ level: "info", message: "Official CFL standings fetch succeeded" });
  } catch (error) {
    logs.push({ level: "warning", message: `Official CFL standings unavailable: ${error.message}` });
    try {
      const sinaRows = await fetchSinaCslStandings();
      cslStandingsPayload = payload({
        league: "csl",
        type: "standings",
        mode: "fallback",
        source: SOURCES.sina.name,
        sourceUrl: SOURCES.sina.url,
        isOfficial: false,
        fetchedAt: sinaRows[0]?.updatedAt || NOW,
        data: sinaRows
      });
      logs.push({ level: "info", message: "Sina fallback CSL standings fetch succeeded" });
    } catch (sinaError) {
      logs.push({ level: "warning", message: `Sina fallback unavailable: ${sinaError.message}` });
      try {
        const fallbackRows = await fetchQiumiwuCslStandings();
        cslStandingsPayload = payload({
          league: "csl",
          type: "standings",
          mode: "fallback",
          source: SOURCES.qiumiwu.name,
          sourceUrl: SOURCES.qiumiwu.url,
          isOfficial: false,
          fetchedAt: fallbackRows[0]?.updatedAt || NOW,
          data: fallbackRows
        });
        logs.push({ level: "info", message: "Qiumiwu fallback CSL standings fetch succeeded" });
      } catch (fallbackError) {
        logs.push({ level: "error", message: `Fallback CSL standings failed: ${fallbackError.message}` });
      }
    }
  }

  if (cslStandingsPayload) {
    await writeJsonSafely("csl-standings.json", cslStandingsPayload);
  } else if (!existsSync(path.join(DATA_DIR, "csl-standings.json"))) {
    const mockRows = buildMockStandings("csl", Object.entries(TEAM_META).map(([name, [short, city]]) => [name, short, city]));
    await writeJsonSafely("csl-standings.json", payload({ league: "csl", type: "standings", mode: "mock", source: "mock", sourceUrl: "", isOfficial: false, data: mockRows }), { preserveOnFailure: false });
  } else {
    console.warn("[preserve] data/csl-standings.json kept from previous successful run");
  }

  const cslStandingsForFixtures = cslStandingsPayload?.data || JSON.parse(await readFile(path.join(DATA_DIR, "csl-standings.json"), "utf8")).data;
  await writeJsonSafely("csl-fixtures.json", payload({ league: "csl", type: "fixtures", mode: "mock", source: "mock fixture fallback", sourceUrl: "", isOfficial: false, data: buildMockFixtures("csl", cslStandingsForFixtures) }), { preserveOnFailure: false });

  for (const league of ["cl1", "cl2"]) {
    const rows = buildMockStandings(league, MOCK_SEEDS[league]);
    await writeJsonSafely(`${league}-standings.json`, payload({ league, type: "standings", mode: "mock", source: "mock fallback", sourceUrl: "", isOfficial: false, data: rows }), { preserveOnFailure: false });
    await writeJsonSafely(`${league}-fixtures.json`, payload({ league, type: "fixtures", mode: "mock", source: "mock fallback", sourceUrl: "", isOfficial: false, data: buildMockFixtures(league, rows) }), { preserveOnFailure: false });
  }

  const meta = {
    updatedAt: NOW,
    mode: cslStandingsPayload?.mode || "mock",
    sources: [
      {
        id: SOURCES.official.id,
        name: SOURCES.official.name,
        url: "https://www.cfl-china.cn/",
        isOfficial: true,
        status: logs.some(item => item.message.startsWith("Official CFL standings fetch succeeded")) ? "ok" : "error",
        lastFetchedAt: NOW
      },
      {
        id: SOURCES.sina.id,
        name: SOURCES.sina.name,
        url: SOURCES.sina.url,
        isOfficial: false,
        status: cslStandingsPayload?.sourceId === SOURCES.sina.id || cslStandingsPayload?.source === SOURCES.sina.name ? "ok" : "error",
        lastFetchedAt: cslStandingsPayload?.source === SOURCES.sina.name ? cslStandingsPayload.fetchedAt : NOW
      },
      {
        id: SOURCES.qiumiwu.id,
        name: SOURCES.qiumiwu.name,
        url: SOURCES.qiumiwu.url,
        isOfficial: false,
        status: cslStandingsPayload?.source === SOURCES.qiumiwu.name ? "ok" : "unused",
        lastFetchedAt: cslStandingsPayload?.source === SOURCES.qiumiwu.name ? cslStandingsPayload.fetchedAt : NOW
      }
    ],
    leagues: {
      csl: {
        standings: cslStandingsPayload ? (cslStandingsPayload.isOfficial ? "ok" : "fallback") : "error",
        fixtures: "mock"
      },
      cl1: {
        standings: "mock",
        fixtures: "mock"
      },
      cl2: {
        standings: "mock",
        fixtures: "mock"
      }
    },
    logs
  };
  await writeFile(path.join(DATA_DIR, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`[write] data/meta.json: mode=${meta.mode}`);
}

main().catch(error => {
  console.error(`[fatal] ${error.stack || error.message}`);
  process.exitCode = 1;
});
