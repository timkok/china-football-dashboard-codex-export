# china-football-dashboard-codex-export

实验版地址：[https://timkok.github.io/china-football-dashboard-codex-export/](https://timkok.github.io/china-football-dashboard-codex-export/)

这是中国足球职业联赛 Dashboard 的 Codex export / reference 版本。当前策略是 **real-data-only by default**：页面默认只读取仓库内的真实 JSON 文件，缺失或解析失败时显示“暂无真实数据”和错误原因，不再自动回退到 mock。

## 重点：每场比赛上座率

首页第一模块是逐场比赛，不是球队场均排名。支持主场球队、轮次、缺失/冲突筛选，以及日期、上座率和实际观众排序，每场可直接查看原始比赛报告。

- `data/csl-match-attendance.json`：Transfermarkt 单场报告中的日期、对阵、比分、球场和实际观众；保留逐行 `sourceUrl`、`fetchedAt`。
- 容量只匹配报告中的实际球场名称，不按主队默认球场猜测。分母为第三方列出的标称容量，不是比赛当日可售座位。
- 缺少人数或容量时为 `null`，不以场均代替，不按零计算。人数超过标称容量的记录标为待核对，并排除汇总；超过 120% 暂不展示比例。
- 2026-10-11 抓取收录 216 场已完赛，214 场有观众数，211 场有可计算比例。其中 4 场容量口径待核对（含 1 场暂缓计算），2 场未报人数、2 场缺少匹配容量。实际覆盖以 JSON 为准，不宣称覆盖全赛季。
- 单场文件缺失时明确留空，即使球队场均 JSON 存在也不替代。未配置模拟单场数据，demo 模式也不会把球队均值伪装成单场观众。
- 原赛程 JSON 不可用时，赛果模块可从这些真实单场记录生成已完赛列表；没有开球时间时只显示日期，不编造时间。

更新：`npm run fetch:match-attendance`；随后 `npm run build:standalone` 更新本地可双击版本。该任务也已加入 `fetch:all` 和观众定时工作流。默认逐个请求、间隔 350ms，遇到 403/429 停止本轮，不绕过验证；每次最多 240 场（可用 `MATCH_FETCH_LIMIT` 限制）。已成功记录缓存 7 天，失败保留旧记录；抓取状态写入 `data/match-attendance-meta.json`。

`npm test` 验证单场解析、缺失值、零值、实际球场匹配、容量冲突及赛季/日期校验。

演示数据只在 URL 带 `?demo=1` 时启用：

```text
https://timkok.github.io/china-football-dashboard-codex-export/?demo=1
```

## 数据文件

页面默认读取：

```text
./data/meta.json
./data/csl-standings.json
./data/csl-fixtures.json
./data/csl-attendance.json
./data/csl-attendance-history.json
```

兼容保留旧文件名：

```text
data/attendance-csl.json
data/attendance-history-csl.json
```

如果 JSON 文件不存在、HTTP 404、JSON parse error、网络错误，前端 `safeFetchJson()` 会记录状态，并在数据健康模块显示：

- `ok`
- `missing`
- `stale`
- `error`

## 当前真实数据状态

2026-10-11 本地执行完整抓取成功：中超积分榜 16 队、观众表 16 队、历史观众数据 3 季。是否仍新鲜以各 JSON 的 `fetchedAt` 为准，不以页面读取时间代替抓取时间。

竞技数据超过 12 小时标记 Stale，观众模块健康检查阈值为 7 天。旧快照仍可查看，不自动替换为 mock。旧版生成的近五场示例战绩不再作为真实数据展示；未核验的主客场拆分显示缺失。

- 中超积分榜：`data/csl-standings.json`，来源为新浪体育中超积分榜 fallback，非官方。
- 中超观众人数：`data/csl-attendance.json`，来源为 Transfermarkt，第三方非官方。
- 中超观众历史：`data/csl-attendance-history.json`，来源为 Transfermarkt attendance development。
- 中超赛程：当前 `data/csl-fixtures.json` 标记为 `mock`，因此 real-data-only 模式会拒绝展示，并显示“暂无真实赛程”。
- 中甲 / 中乙：未配置真实 JSON，默认显示“暂无真实数据”；`?demo=1` 才显示演示数据。

## 观众人数数据

观众模块来自 Transfermarkt：

- Chinese Super League attendance figures
  https://www.transfermarkt.com/chinese-super-league/besucherzahlen/wettbewerb/CSL
- Chinese Super League attendance development
  https://www.transfermarkt.com/chinese-super-league/besucherzahlenentwicklung/wettbewerb/CSL

`data/csl-attendance.json` 包含：

- 总观众人数
- 场均观众人数
- 平均上座率
- 球队主场观众排名
- 球场容量
- 上座率
- 热度标签

Transfermarkt 是第三方非官方来源，仅供趋势分析参考；如与中足联、中国足协或俱乐部官方公告不一致，以官方发布为准。

## 为什么不在前端直接抓德转

GitHub Pages 前端不直接抓 Transfermarkt 或其他第三方网页，原因包括：

- CORS
- bot / JS verification
- 页面结构不稳定
- 无法可靠缓存和保留上一次成功数据

正确路径是 GitHub Actions 或本地 Node 脚本抓取后生成静态 JSON，前端只读取同仓库 JSON。

## 手动更新

```bash
npm install
npm run fetch:attendance
npm run fetch:attendance-history
```

完整数据流水线：

```bash
npm run fetch:all
npm run build:standalone
```

## GitHub Actions

`.github/workflows/update-attendance.yml` 每 6 小时运行一次，也支持手动 `workflow_dispatch`。

它会执行：

```bash
npm install
npm run fetch:attendance
```

如果观众 JSON 有变化，会自动提交：

```text
Update attendance data
```

## 与主站关系

主站应作为生产版：

[https://timkok.github.io/china-football-dashboard/](https://timkok.github.io/china-football-dashboard/)

本 export 版本只作为参考 / 实验版。稳定后建议将以下模块迁回主站，而不是长期维护两个重复页面：

- 球市与观众人数监测
- 数据健康
- 刷新日志
- 赛程完整度监控
- 数据变更日志
- 多数据源比对
- 告警区

## 本地预览

JSON 请求 10 秒超时，各文件独立验证。图表 CDN 异步加载，单张图表分别显示 `loading / empty / error / ready`；图表失败不阻断表格或其他图表。

`standalone.html` 由 `npm run build:standalone` 生成，不手动维护第二套页面。双击本地文件时读取内嵌快照并保留原时间戳；通过 HTTP / GitHub Pages 打开时读取最新仓库 JSON。两个定时工作流均更新此文件，并使用同一发布并发锁。

```bash
python3 -m http.server 8000
```

访问：

```text
http://localhost:8000/
http://localhost:8000/?demo=1
```

## 本次验证

- `npm install`、`npm run fetch:all`、`npm run build:standalone` 成功；`npm audit` 无已知漏洞。
- Playwright 检查默认 16 队积分榜与 16 队观众表、中甲/中乙空状态、刷新日志、`?demo=1`。
- 模拟全部 JSON 404、历史 JSON 解析失败、CDN 失败和单张图表抛错，其余可用模块仍正常展示。
- 390px 手机视口无页面横向溢出；宽表格在自身容器内滚动。
- 观众表的场次按总观众 / 场均观众估算，历史页场次为来源报告口径，可能因缺报场次和四舍五入不同。2026 为赛季进行中快照，与完整赛季的同比不可直接当作全年增长。

## 数据声明

- 默认页面不展示 mock 数据。
- `?demo=1` 仅用于视觉和交互演示。
- Sina、Transfermarkt 等 fallback / third-party 来源均非官方。
- 官方口径以中足联、中国足协和俱乐部公告为准。
