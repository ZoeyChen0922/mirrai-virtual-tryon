# MIRRAI · 商场门店 AI 虚拟试衣大屏

同花顺 AI Native 出海产品岗笔试作品：一个可运行的大屏 + 手机端虚拟试衣原型。

## 在线体验

GitHub Pages：`https://<username>.github.io/<repo>/prototype/`（发布后替换为实际地址）

线上版使用 8 套预生成的试穿图演示完整流程。真实的"拍脸 + 按身高尺码生成"需要在本地运行服务端（见下文）。

## 交付物

| 交付物 | 位置 |
|---|---|
| 可运行网页原型 + 源代码 | `prototype/`（前端）、`tools/server.py`（生成服务） |
| 一页产品方案 | `11_交付物2_一页产品方案.md`（PDF 版见 `deliverables/`） |
| AI 工具使用说明 | `12_交付物3_AI工具使用说明.md` |

过程文档：`01`–`10` 依次为题目理解、决策记录、用户调研、证据库、AI 使用记录、流程与技术方案、商品目录、演示面板说明、测试记录。

## 本地运行

**真实生成模式**（需要 OpenAI API Key）

```bash
echo 'OPENAI_API_KEY=sk-...' > .env
python3 tools/server.py        # 打开 http://localhost:4174
```

**纯静态模式**（不需要 Key）

```bash
cd prototype && python3 -m http.server 4173   # 打开 http://localhost:4173
```

## 用户旅程

大屏：待机轮播 → 拍脸（可跳过）→ 身高、尺码 → 选款画廊 → 生成（等待时推荐 3 套搭配）→ 效果页 → 扫码带走 → 自动清空
手机：我的试穿 → 单品详情（叫店员 / 官网购买）→ 分享海报 → 删除记录

## 说明

- 全部商品、模特与试穿图均由 AI 生成，为虚构内容；"官网"为演示页面 `prototype/shop.html`。
- 隐私：照片仅用于本次生成、不保存原图；结果只保存在服务内存中，24 小时后删除；API Key 只保存在服务端。
