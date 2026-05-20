# china-football-dashboard-codex-export

实验版地址：[https://timkok.github.io/china-football-dashboard-codex-export/](https://timkok.github.io/china-football-dashboard-codex-export/)

这是中国足球职业联赛 Dashboard 的 Codex export / reference 版本。当前策略是 **real-data-only by default**：页面默认只读取仓库内的真实 JSON 文件，缺失或解析失败时显示“暂无真实数据”和错误原因，不再自动回退到 mock。

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

```bash
python3 -m http.server 8000
```

访问：

```text
http://localhost:8000/
http://localhost:8000/?demo=1
```

## 免责声明

- 默认页面不展示 mock 数据。
- `?demo=1` 仅用于视觉和交互演示。
- Sina、Transfermarkt 等 fallback / third-party 来源均非官方。
- 官方口径以中足联、中国足协和俱乐部公告为准。
