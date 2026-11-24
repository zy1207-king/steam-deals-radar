# Steam 特惠雷达（Steam Deals Radar）

> 一个纯静态网页作品：自动聚合 Steam 商店当前的**每日特惠 / 深度折扣**，一屏查看折扣力度、到手价格、剩余时间与商店入口，无需登录、无需后端。

- **在线访问**：<https://zy1207-king.github.io/steam-deals-radar/>（部署后请替换为实际地址）
- **源码仓库**：<https://github.com/zy1207-king/steam-deals-radar>
- **技术栈**：原生 HTML + CSS + JavaScript（零依赖、零构建）+ Python 3 标准库 + GitHub Actions + GitHub Pages

---

## 一、当前功能

| 功能 | 说明 |
| --- | --- |
| 每日特惠列表 | 聚合 Steam 官方「特别优惠」精选与按折扣排序的深度折扣榜 |
| 双区域切换 | 中国区（¥ CNY）/ 美国区（$ USD），价格按区域正确显示 |
| 折扣 / 价格 | 折扣角标、划线原价、到手价、单款可省金额 |
| 剩余时间 | 精确到秒的倒计时，24 小时内高亮提示「即将结束」 |
| 统计概览 | 在榜数量、平均折扣、最狠折扣、累计可省金额 |
| 搜索 / 筛选 / 排序 | 名称搜索、折扣档位快捷筛选、5 种排序方式 |
| 一键直达 | 卡片跳转对应 Steam 商店页面 |
| 数据刷新 | 点击「刷新」重新拉取同域最新快照；每 10 分钟自动静默同步 |
| 即将结束专区 | 优先展示 24 小时内截止的特惠；暂无时展示剩余时间最短的 8 款，倒计时醒目 |
| 愿望单 + 降价提醒 | 卡片一键收藏（存浏览器本地），数据更新时检测到「降到新低」自动弹窗提醒 |
| 社交分享卡片 | Open Graph / Twitter Card 元信息 + 1200×630 分享封面，分享链接即出预览图 |
| 响应式 | 桌面 / 平板 / 手机自适应，含深色游戏风视觉与雷达扫描动画 |

### 后续可扩展（预留）

历史价格曲线与史低标记、多区比价、免费游戏领取榜、评测评分展示、PWA 离线缓存。

---

## 二、运行说明

### 方式 A：直接访问线上页面（推荐）

打开上面的在线地址即可，无需任何安装。数据由 GitHub Actions 每天自动更新。

### 方式 B：本地运行（无需安装任何依赖）

```bash
# 1. 克隆仓库
git clone https://github.com/zy1207-king/steam-deals-radar.git
cd steam-deals-radar

# 2. 启动一个本地静态服务器（Python 3 自带）
python3 -m http.server 8000

# 3. 浏览器打开
#    http://localhost:8000
```

> 也可以直接双击 `index.html` 打开：页面数据通过 `<script src="data/specials.js">` 同步加载，不受浏览器 CORS 限制，`file://` 协议下同样能看到完整列表（此模式下「刷新」按钮会提示为本地预览模式）。

### 方式 C：手动更新特惠数据

```bash
# 需要 Python 3.8+，仅使用标准库，无需 pip install
python3 scripts/fetch_specials.py                 # 抓取中国区 + 美国区
python3 scripts/fetch_specials.py --regions CN   # 只抓中国区
python3 scripts/fetch_specials.py --dry-run      # 只打印结果，不写文件
```

脚本会重新生成 `data/specials.json` 与 `data/specials.js`，刷新浏览器即可看到新数据。
线上版本无需手动执行：GitHub Actions 会在**每天北京时间 09:00** 自动运行该脚本并提交，也可在仓库 `Actions → 更新 Steam 每日特惠数据 → Run workflow` 手动触发。

---

## 三、部署到 GitHub Pages（从零复现）

1. 在 GitHub 新建公开仓库 `steam-deals-radar`，把本目录所有文件推送到 `main` 分支：

   ```bash
   git init
   git add .
   git commit -m "feat: Steam 特惠雷达 初始版本"
   git branch -M main
   git remote add origin https://github.com/zy1207-king/steam-deals-radar.git
   git push -u origin main
   ```

2. 打开仓库 **Settings → Pages**：
   - **Source** 选择 `Deploy from a branch`
   - **Branch** 选择 `main`，目录选择 `/ (root)`
   - 点击 Save，等待 1–3 分钟。

3. 访问 `https://zy1207-king.github.io/steam-deals-radar/` 验证页面。

4. 打开仓库 **Settings → Actions → General**，确认 *Workflow permissions* 为 **Read and write permissions**，这样定时任务才能把新数据提交回仓库。

> 说明：本项目**不使用** Jekyll 或任何构建工具，Pages 直接托管仓库根目录的静态文件；`data/specials.js` 更新提交后 Pages 会自动重新部署。

---

## 四、目录结构

```
steam-deals-radar/
├── index.html                         # 页面结构（唯一的 HTML 入口）
├── assets/
│   ├── css/style.css                  # 全部样式：深色游戏风、雷达动画、响应式
│   └── js/app.js                      # 全部交互：筛选/排序/统计/倒计时/刷新
├── data/
│   ├── specials.json                  # 规范化特惠数据（供刷新与外部消费）
│   └── specials.js                    # 同一份数据的 JS 包裹，供页面同步加载
├── scripts/
│   └── fetch_specials.py              # 数据抓取脚本（Python 标准库，零依赖）
├── .github/workflows/
│   └── update-specials.yml            # 每日定时抓取 + 自动提交
├── docs/制作说明.md                   # 制作思路、技术选型与实现细节
└── README.md                          # 本文件（项目说明 + 运行说明）
```

---

## 五、数据来源与更新机制

| 项目 | 说明 |
| --- | --- |
| 精选特惠 | `https://store.steampowered.com/api/featuredcategories?cc=<区>&l=<语言>`，取 `specials` 与 `top_sellers` 中带折扣的商品，包含精确的 `discount_expiration` 结束时间 |
| 深度折扣 | `https://store.steampowered.com/search/results/?specials=1&sort_by=Discount_DESC&json=1`，解析返回的 HTML 片段补充更多高折扣游戏 |
| 更新频率 | 每 6 小时一次（北京时间 09:00 / 15:00 / 21:00 / 03:00）+ 手动触发 |
| 价格单位 | 统一换算为主货币单位（CNY 元 / USD 美元） |
| 失败兜底 | 某个区域抓取失败时沿用上一次成功的数据，不会清空线上页面 |

**为什么用 `<script>` 而不是 `fetch()` 加载主数据？**
Steam 官方接口没有开放 CORS 响应头，浏览器端直接请求会被拦截；而第三方代理不稳定。因此采用「服务端（GitHub Actions）定时抓取 → 生成同域静态文件 → 前端同步加载」的方案：纯静态、无后端、无跨域、`file://` 也能打开。点击「刷新」时再 `fetch` 同域 `data/specials.json` 获取最新快照。

---

## 六、常见问题

**Q：页面显示「数据文件缺失」？**
A：确认 `data/specials.js` 存在；若被误删，执行 `python3 scripts/fetch_specials.py` 重新生成。

**Q：价格或折扣看起来不对？**
A：Steam 商店会分区域动态定价，且折扣随时可能结束；请以卡片跳转到的 Steam 商店实时页面为准。本作品展示的是抓取时刻的快照。

**Q：为什么定时任务没有更新？**
A：检查 Actions 是否有运行记录、Workflow permissions 是否为 Read and write。公开仓库的定时任务在长时间无活动后可能被 GitHub 暂停，手动 Run workflow 一次即可恢复。

**Q：如何增加新的区域？**
A：在 `scripts/fetch_specials.py` 的 `REGIONS` 字典里新增一项，并在 `index.html` 的区域切换处加一个按钮即可。

---

## 七、声明

本项目为学习 / 展示用途的独立作品，与 Valve / Steam 无官方关联。游戏名称、封面图版权归各自权利人所有，数据来源于 Steam 商店公开接口。

## License

MIT
