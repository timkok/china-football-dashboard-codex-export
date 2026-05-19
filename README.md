# china-football-dashboard

在线访问地址：[https://timkok.github.io/china-football-dashboard/](https://timkok.github.io/china-football-dashboard/)

中国足球职业联赛监测 Dashboard 是一个 **JSON-first / 真实数据优先 + mock fallback** 的 GitHub Pages 静态 dashboard。浏览器端只读取本仓库的 `data/*.json`，不直接抓取中足联、Transfermarkt、Sina 或其他第三方网页。

## 当前状态

- 中超积分榜：优先尝试中国足球职业联赛联合会官网；当前官方页面不稳定暴露完整结构化表格时，使用新浪体育中超积分榜作为 fallback。
- 中超观众人数：使用 Transfermarkt 公开观众数据，生成球队主场观众、上座率、联赛热度指数和历史场均观众趋势。
- 中超赛程：当前仍为 mock fixture fallback。
- 中甲 / 中乙：当前仍为 mock fallback，页面明确标注“示例”，不代表真实排名或赛果。
- 所有模块显示 `source`、`sourceUrl`、`isOfficial`、`mode`，其中 `mode` 支持 `official` / `fallback` / `third_party` / `mock` / `stale`。
- 非官方和第三方数据会显示“非官方，仅供参考”；如与官方公告不一致，以中足联 / 中国足协官方公告为准。

## 数据文件

GitHub Actions 生成并提交以下静态 JSON：

```text
data/meta.json
data/csl-standings.json
data/csl-fixtures.json
data/cl1-standings.json
data/cl1-fixtures.json
data/cl2-standings.json
data/cl2-fixtures.json
data/attendance-csl.json
data/attendance-meta.json
data/attendance-history-csl.json
data/data-quality.json
data/changelog.json
data/source-comparison.json
```

每个数据文件都会尽量包含来源信息：

```json
{
  "source": "新浪体育中超积分榜",
  "sourceUrl": "https://sports.sina.com.cn/csl/table/",
  "isOfficial": false,
  "mode": "fallback",
  "fetchedAt": "2026-05-18T22:10:19.247Z"
}
```

积分榜模型预留扣分字段：

```json
{
  "deductions": 0,
  "deductionReason": "",
  "pointsBeforeDeductions": 24,
  "pointsOfficial": 24
}
```

扣分数据必须以官方公告为准；当前脚本无法稳定抓取官方扣分公告时保持空值或 0。

## 数据源优先级

1. 中国足球职业联赛联合会官网：https://www.cfl-china.cn/
   - `official`
   - 优先用于中超、中甲、中乙赛程、积分榜和官方公告。
2. 新浪体育中超积分榜：https://sports.sina.com.cn/csl/table/
   - `fallback`
   - 当前用于中超积分榜 fallback。
3. Transfermarkt Chinese Super League Attendance：
   - https://www.transfermarkt.com/chinese-super-league/besucherzahlen/wettbewerb/CSL
   - https://www.transfermarkt.com/chinese-super-league/besucherzahlenentwicklung/wettbewerb/CSL
   - `third_party`
   - 用于中超观众人数、上座率和历史场均观众趋势。
4. 懂球帝 / 球迷屋 / Soccerway / Sofascore / Flashscore / FootyStats
   - `fallback` 或 `third_party`
   - 仅作为校验或备用来源，不使用需要登录、付费或绕过反爬的数据源。

## 新增产品化能力

- 数据源可信度标签：每个模块展示来源、URL、官方标记和数据模式。
- 联赛热度指数：基于场均观众、平均上座率、同比变化和高需求主场占比计算，属于规则模型。
- 最热主场 Top 5：按上座率和场均观众排序。
- 观众趋势同比：读取 `data/attendance-history-csl.json`，展示 2024、2025、2026 场均观众和同比增长。
- 观众人数 vs 积分散点图：当中超积分榜 JSON 与观众 JSON 可匹配时展示，否则隐藏该图表并保留表格。
- 赛程完整度监控：以 30 轮为基线，展示已抓取轮次、缺失轮次和异常比赛数。
- 数据质量告警：识别 stale data、赛程异常、数据缺失和多源冲突。
- 积分异常解释：积分榜显示扣分徽标和官方积分字段。
- 升降级 / 亚冠 / 争冠规则预测：基于积分、剩余轮次、近 5 场、净胜球计算，页面明确标注“规则模型预测，非官方”。
- 主客场拆分：球队详情和图表展示主客场胜平负，并联动主场观众和上座率。
- 焦点比赛卡片：识别前 4 交锋、德比、争冠关键战、保级关键战和高上座预期比赛。
- 数据变更日志：`data/changelog.json` 记录 fetch 后排名、积分、观众和异常变化。
- 多数据源比对：`data/source-comparison.json` 为后续多源字段差异和 Data Conflict Alert 预留结构。

## 为什么不在前端直接抓网页

GitHub Pages 是纯静态托管，浏览器直接抓官方或第三方网页会遇到：

- CORS 限制。
- 反爬、机器人验证或频率限制。
- 页面结构变化导致解析不稳定。
- 需要登录态、Cookie 或动态 JavaScript 渲染。
- API key 不能安全写入公开 HTML。

因此本项目采用：

1. GitHub Actions 定时抓取数据。
2. Node.js 脚本标准化为 `data/*.json`。
3. 前端只读取同仓库静态 JSON。
4. 抓取失败时保留上一次成功 JSON，不覆盖为空数据。
5. JSON 不存在、过旧或校验失败时回退到 mock，并在页面显著标注。

## GitHub Actions

主 workflow：

```text
.github/workflows/update-data.yml
```

触发方式：

- 每 6 小时自动运行一次。
- 支持 `workflow_dispatch` 手动运行。

执行内容：

```bash
npm install
npm run fetch:all
```

`fetch:all` 会依次运行：

```bash
npm run fetch:data
npm run fetch:attendance
npm run fetch:attendance-history
npm run validate:data
npm run generate:changelog
```

如果 `data/` 有变化，自动提交：

```text
Update football data
```

观众人数仍保留独立 workflow：

```text
.github/workflows/update-attendance.yml
```

它可以单独更新 `data/attendance-csl.json` 和 `data/attendance-meta.json`。

## 本地运行

本地需要 Node.js 20+。

```bash
npm install
npm run fetch:all
python3 -m http.server 8000
```

访问：

```text
http://localhost:8000/
```

只更新观众数据：

```bash
npm run fetch:attendance
npm run fetch:attendance-history
```

线上页面如果仍显示旧的 `Mock-first` 文案，通常是浏览器或 GitHub Pages CDN 缓存。可以使用 `https://timkok.github.io/china-football-dashboard/?v=<commit>` 强制读取新 HTML。

只校验并生成质量文件：

```bash
npm run validate:data
npm run generate:changelog
```

## 免责声明

- Transfermarkt、Sina 和其他 fallback / third-party 来源均非官方数据源。
- 页面中的联赛热度指数、焦点指数、升降级和亚冠资格预测均为规则模型，不是官方结论，也不是机器学习预测。
- 当前中甲 / 中乙以及中超赛程仍包含 mock fallback；页面会明确标注。
- 观众人数和上座率仅供趋势分析参考；如与中足联、中国足协或俱乐部官方公告不一致，以官方发布为准。

## 后续路线图

- 接入官方中足联赛程与积分榜，优先替换 fallback。
- 接入中甲 / 中乙真实积分榜、赛程和观众数据。
- 生成真实 match-level attendance JSON。
- 接入第二观众来源并启用字段级 source comparison。
- 增加历史排名、历史积分和观众趋势差异检测。
- 将扣分公告结构化并加入 changelog。
