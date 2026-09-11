# MIRRAI · 商场门店 AI 虚拟试衣大屏

同花顺 AI Native 出海产品岗笔试作品：一个可运行的大屏 + 手机端虚拟试衣原型。

## 在线体验

| 地址 | 说明 |
|---|---|
| **https://mirrai-virtual-tryon.vercel.app** | 完整版（推荐）：拍脸后按身高、尺码实时生成上身效果（约 30 秒） |
| https://zoeychen0922.github.io/mirrai-virtual-tryon/prototype/ | 纯静态备用版：用 8 套预生成的试穿图演示完整流程 |

打开后左边是 1080×1920 大屏，右边是演示面板（模拟扫码、服务状态、埋点事件）。在效果页用手机扫码即可打开手机页。
线上完整版做了限流：每个会话 4 次、全站每天 80 次；超出后自动降级为商品图。

## 交付物

| 交付物 | 位置 |
|---|---|
| 可运行网页原型 + 源代码 | 上面的链接；`prototype/`（前端）、`tools/server.py`（生成服务）、`api/`（Vercel 函数） |
| 一页产品方案 | `deliverables/产品方案.pdf`（文字版 `11_交付物2_一页产品方案.md`） |
| AI 工具使用说明 | `deliverables/AI工具使用说明.pdf`（文字版 `12_交付物3_AI工具使用说明.md`） |

过程文档：`01`–`10` 依次为题目理解、决策记录、用户调研、证据库、AI 使用记录、流程讨论稿、技术方案、商品目录、演示面板说明、测试记录。

## 本地运行

**真实生成模式**（需要 OpenAI API Key）

```bash
pip install requests Pillow
echo 'OPENAI_API_KEY=sk-...' > .env
python3 tools/server.py        # 打开 http://localhost:4174
```

**纯静态模式**（不需要 Key）

```bash
cd prototype && python3 -m http.server 4173   # 打开 http://localhost:4173
```

## 部署结构

- 前端：`prototype/` 纯静态 HTML/CSS/JS，无构建步骤。
- 生成：`tools/server.py` 调用 OpenAI gpt-image-2（images/edits），本地运行时自带静态服务。
- Vercel：`api/*.py` 复用 `tools/server.py` 的生成逻辑；结果存在 Redis 中，24 小时过期。环境变量 `OPENAI_API_KEY`、`REDIS_URL`，可选 `DAILY_LIMIT`、`SESSION_LIMIT`。

## 用户旅程

大屏：待机轮播 → 拍脸（可跳过）→ 身高、尺码 → 选款画廊 → 生成（等待时推荐 3 套搭配）→ 效果页 → 扫码带走 → 自动清空
手机：我的试穿 → 单品详情（叫店员 / 官网购买）→ 分享海报 → 删除记录

## 说明

- 全部商品、模特与试穿图均由 AI 生成，为虚构内容；"官网"为演示页面 `prototype/shop.html`。
- 隐私：照片仅用于本次生成，不保存原图；结果临时存储（本地为内存，线上为 Redis），24 小时后删除；API Key 只保存在服务端。
- 库存、领券、叫店员、下单为模拟功能。
