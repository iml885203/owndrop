<div align="center">

<img src="docs/assets/hero-banner.png" alt="OwnDrop — 你的零開網頁跨裝置暫存與傳輸中樞" width="100%" />

<br />
<br />

[![License: MIT](https://img.shields.io/badge/License-MIT-38bdf8.svg?style=flat-square)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_免費方案-$0%2F月-f38020?style=flat-square&logo=cloudflare&logoColor=white)](docs/cloudflare-deploy.md)
[![Docker Ready](https://img.shields.io/badge/Docker-支援自架-2496ed?style=flat-square&logo=docker&logoColor=white)](docs/self-hosting.md)
[![Raycast](https://img.shields.io/badge/Raycast-macOS_%26_Windows-ff6363?style=flat-square&logo=raycast&logoColor=white)](raycast/README.md)
[![iOS Shortcuts](https://img.shields.io/badge/iPhone-Apple_捷徑-6366f1?style=flat-square&logo=apple&logoColor=white)](docs/shortcuts.md)

[English](README.md) · **繁體中文**

[為什麼做 OwnDrop](#-為什麼做-owndrop) · [介面預覽](#-介面與裝置設定預覽) · [免費部署到 Cloudflare](#-方案一免費部署到-cloudflare0月推薦) · [Docker 自架](#-方案二docker-compose-自架) · [零開網頁接線](#-連接你的裝置日常再也不用開網頁)

</div>

---

## 💡 為什麼做 OwnDrop？

大多數跨裝置傳輸工具，每次要傳一張截圖或一段連結，**兩台裝置都得先去找瀏覽器、開網頁、甚至打配對碼**，工作流直接被打斷。

**OwnDrop 把使用邏輯反過來：**
- **網頁介面**退居二線，負責歷史搜尋、釘選管理與新增裝置。
- **日常 80% 的收發**直接長在你的系統原生入口：**macOS 與 Windows 用 Raycast 快捷鍵**、**iPhone 用系統分享選單與動作按鈕**，一鍵送出、一鍵拉取，完全不用開網頁。
- **免費跑在 Cloudflare（$0/月）**（Workers + D1 + R2），也支援 **Docker 單容器自架**。

<p align="center">
  <img src="docs/assets/workflow-diagram.png" alt="OwnDrop 跨裝置零開網頁運作流程" width="100%" />
</p>

---

## ✨ 核心特色

| | 功能亮點 | 實際體驗 |
| :---: | :--- | :--- |
| ⌨️ | **跨平台 Raycast Extension（Mac & Windows）** | 一按快捷鍵立刻 `Drop Clipboard`（送出剪貼簿文字/截圖）或 `Copy Latest Drop`（拉最新一筆到剪貼簿）。 |
| 📱 | **iPhone Apple 捷徑** | 在相簿、Safari、任何 App 點「分享 → Send to OwnDrop」背景直傳；把「Get Latest」綁到動作按鈕一秒取用。 |
| ☁️ | **Cloudflare 免費方案原生架構（$0/月）** | Workers + Static Assets + D1（SQLite）+ R2（10 GB 免費、**零流量費**），搭配每日 Cron 自動清理防爆額度。 |
| 🐳 | **同時支援 Docker 自架** | 同一套 Hono TypeScript 核心直接跑在 Node 22 內建 `node:sqlite`（無需原生 C++ 編譯）。 |
| 🔑 | **多裝置獨立可撤銷 Token** | 每台裝置專屬一把 `owd_...` 鑰匙，自動標記來源裝置名稱（如 `MacBook Pro`、`iPhone`）；某台換機直接單獨撤銷，不影響其他裝置。 |
| 🔐 | **密碼登入 + 內建標準 OIDC** | 開箱即支援單一密碼登入，也可選配直連 **Pocket ID / Authentik / Authelia**（標準 PKCE S256 + 群組權限驗證）。 |
| 📦 | **突破大檔限制（> 90 MB）** | 小檔與 iOS 捷徑走直覺單次上傳；設定 R2 S3 金鑰後自動啟用 **R2 Presigned 直傳**，大檔最高可傳 512 MB+。 |

---

## 🖼️ 介面與裝置設定預覽

### 簡潔清爽的暫存板（自動跟隨深／淺色主題）
支援全頁檔案拖放、`⌘V` / `Ctrl+V` 直接貼上剪貼簿圖片、連結預覽卡片、置頂釘選與即時關鍵字搜尋。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/web-workspace-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/web-workspace-light.png" />
    <img src="docs/assets/web-workspace-dark.png" alt="OwnDrop 網頁暫存板介面" width="100%" />
  </picture>
</p>

### 內建「裝置管理」與「零開網頁設定精靈」
點右上角 **Devices** 即可一鍵發放／撤銷各裝置 Token，系統會自動帶入你的伺服器網址，30 秒完成 Raycast、iPhone 捷徑或終端機設定。

<p align="center">
  <img src="docs/assets/web-devices-dark.png" alt="OwnDrop 裝置管理與設定精靈" width="100%" />
</p>

---

## 🚀 3 分鐘快速部署（二選一）

### ☁️ 方案一：免費部署到 Cloudflare（$0/月，推薦）

不需要租主機、不用開電腦跑 Docker，完整圖文步驟見 **[`docs/cloudflare-deploy.md`](docs/cloudflare-deploy.md)**。

```bash
git clone https://github.com/iml885203/owndrop.git
cd owndrop
npm install && npm --prefix web install

# 1. 建立 D1 資料庫與 R2 儲存空間
npx wrangler d1 create owndrop-db
npx wrangler r2 bucket create owndrop-files
# -> 把終端機印出的 database_id 貼進 wrangler.toml

# 2. 套用資料庫結構到 D1
npm run db:migrate:remote

# 3. 設定環境密鑰
npx wrangler secret put OWNDROP_ORIGIN          # 例如 https://drop.yourdomain.com
npx wrangler secret put OWNDROP_PASSWORD        # 登入密碼
npx wrangler secret put OWNDROP_SESSION_SECRET  # 可用 openssl rand -base64 48 產生

# 4. 建置前端並一鍵上線！
npm run deploy:cf
```

> **免費額度安全防護**：預設總檔案上限設為 8 GB（`OWNDROP_MAX_STORAGE_MB=8192`），並透過每日 Cron 自動淘汰過期與最舊檔案，安心待在 R2 10 GB 免費額度內。

---

### 🐳 方案二：Docker Compose 自架

完整說明（含反向代理與 Pocket ID OIDC 串接）見 **[`docs/self-hosting.md`](docs/self-hosting.md)**。

```bash
git clone https://github.com/iml885203/owndrop.git
cd owndrop
cp .env.example .env
# 編輯 .env，填入 OWNDROP_ORIGIN、OWNDROP_PASSWORD、OWNDROP_SESSION_SECRET

docker compose up -d --build
```

容器預設監聽 `http://127.0.0.1:4180`，前面接 Caddy、Nginx 或 Cloudflare Tunnel 即可使用。

---

## 🔌 連接你的裝置（日常再也不用開網頁）

1. 登入 OwnDrop 網頁版，點右上角 **Devices**。
2. 為每台主力裝置建立專屬 Token（例如 `MacBook Pro`、`Windows PC`、`iPhone`）。
3. 各平台一次性接好線，之後完全免開網頁：

| 平台 | 入口工具 | 日常操作 | 設定指南 |
| :--- | :--- | :--- | :--- |
| **macOS & Windows** | **Raycast Extension** | 全域快捷鍵一鍵 `Drop Clipboard`、`Copy Latest Drop`、`Browse Drops`、`Drop Files`、macOS 選單列 | [`raycast/README.md`](raycast/README.md) · [`上架清單`](docs/raycast-store.md) |
| **iPhone & iPad** | **Apple 捷徑** | 原生**系統分享選單**（`Send to OwnDrop`）+ **動作按鈕／控制中心**（`Get Latest OwnDrop`） | [`docs/shortcuts.md`](docs/shortcuts.md) |
| **終端機 / 自動化** | **REST API (`curl`)** | 標準 Bearer API（`POST /api/items/text`、`POST /api/items/file`、`GET /api/items/latest`） | [`docs/api.md`](docs/api.md) |

---

## 🏗️ 雙環境統一架構

核心 API 採用 **Hono + TypeScript**，透過兩層極薄的儲存介面同時相容 **Cloudflare Native** 與 **Docker Self-Host**：

```mermaid
flowchart LR
  subgraph Clients["零開網頁客戶端"]
    RC["Raycast<br/>(macOS & Windows)"]
    IOS["Apple 捷徑<br/>(iPhone & iPad)"]
    WEB["Web PWA / CLI"]
  end

  subgraph Core["OwnDrop 核心 (Hono + TypeScript)"]
    API["REST API + 認證層<br/>(密碼 · 標準 OIDC PKCE · 多裝置 Token)"]
  end

  subgraph CF["Cloudflare Native ($0/月)"]
    D1["D1 SQLite"]
    R2["R2 物件儲存<br/>(直傳 + Presigned)"]
    CRON["每日 Cron 自動清理"]
  end

  subgraph Docker["Docker 自架模式"]
    SQL["Node 22 內建 sqlite"]
    FS["本地 /data 磁碟卷"]
  end

  RC -->|Bearer Token| API
  IOS -->|Bearer Token| API
  WEB -->|Cookie / Bearer| API
  API --> D1 & R2
  API -.->|或切換自架| SQL & FS
  CRON -.-> D1 & R2
```

---

## 📄 授權條款

採用 [MIT License](LICENSE) 開源釋出。
