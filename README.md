# OwnDrop

**Your personal, zero-browser cross-device drop & clipboard hub.**

Send text, URLs, screenshots, and files seamlessly across **macOS**, **Windows**, and **iPhone/iPad** — deployed for **$0/month on Cloudflare Workers + D1 + R2**, or self-hosted in one container with Docker.

> **Why OwnDrop?**
> Most cross-device transfer tools force you to hunt for a browser tab on *both* devices every time you want to move a link or screenshot. OwnDrop treats the web UI as the management hub and puts daily drops directly inside **Raycast (macOS & Windows)** and **Apple Shortcuts (iOS Share Sheet & Action Button)**.

---

## Highlights

- **Cloudflare Native ($0/month)**: Runs on Workers + Static Assets + D1 (SQLite) + R2 (10 GB free, $0 egress) + daily Cron cleanup guard so you stay inside free-tier limits.
- **Docker Self-Hostable**: Same Hono TypeScript core runs on Node.js 22 with built-in `node:sqlite` (zero native compilation) and local filesystem storage.
- **Zero-Browser Clients**:
  - **macOS & Windows**: Cross-platform **Raycast Extension** (`Drop Clipboard`, `Copy Latest Drop`, `Browse Drops`, `Drop Files`, `Drop Text`, `Menu Bar`).
  - **iPhone & iPad**: **Apple Shortcuts** for iOS Share Sheet ("Send to OwnDrop") and Action Button / Control Center ("Get Latest OwnDrop").
- **Flexible Authentication**:
  - Built-in **Password login** out of the box (zero external dependencies).
  - Built-in **Standard OIDC (PKCE S256)** with JWKS signature verification and optional group claim enforcement (works with Pocket ID, Authentik, Authelia, Keycloak, etc.).
  - **Multi-Device API Tokens**: Per-device revocable Bearer tokens (`owd_...`) that automatically tag items with their source device (`MacBook Pro`, `Windows PC`, `iPhone`).
- **Large File Support**: Direct multipart uploads up to 90 MB (perfect for iOS Shortcuts & quick drops), plus optional **R2 Presigned Direct Uploads** up to 512 MB+ bypassing the Cloudflare Workers 100 MB request cap.
- **Privacy & Security**: SSRF-hardened link previews, strict CSP/Origin CSRF protection, durable revocable browser sessions, no offline caching of private history.

---

## Quick Start

### Option 1: Deploy to Cloudflare Free Tier ($0/month — Recommended)

See the full walkthrough in [`docs/cloudflare-deploy.md`](docs/cloudflare-deploy.md).

```bash
git clone https://github.com/your-org/owndrop.git
cd owndrop
npm install && npm --prefix web install

# 1. Create D1 database & R2 bucket
npx wrangler d1 create owndrop-db
npx wrangler r2 bucket create owndrop-files
# Update database_id in wrangler.toml with the ID printed above

# 2. Apply SQLite schema to D1
npm run db:migrate:remote

# 3. Set required secrets
npx wrangler secret put OWNDROP_ORIGIN          # e.g. https://drop.example.com
npx wrangler secret put OWNDROP_PASSWORD        # strong login password
npx wrangler secret put OWNDROP_SESSION_SECRET  # openssl rand -base64 48

# 4. Build web UI and deploy Worker + Static Assets
npm run deploy:cf
```

### Option 2: Self-Host with Docker Compose

See [`docs/self-hosting.md`](docs/self-hosting.md) for reverse-proxy & OIDC configuration.

```bash
cp .env.example .env
# Edit .env and set OWNDROP_ORIGIN, OWNDROP_PASSWORD, OWNDROP_SESSION_SECRET
docker compose up -d --build
```

---

## Connect Your Devices (No Browser Required)

1. Sign in to your OwnDrop web UI and click **Devices** in the top bar.
2. Create a dedicated token for each device (e.g., `MacBook Raycast`, `Windows PC`, `iPhone`).
3. Configure your clients:
   - **Raycast (macOS & Windows)**: See [`raycast/README.md`](raycast/README.md) & [`docs/raycast-store.md`](docs/raycast-store.md).
   - **iPhone / iPad (Apple Shortcuts)**: See [`docs/shortcuts.md`](docs/shortcuts.md).
   - **CLI / Automation**: See [`docs/api.md`](docs/api.md).

---

## Local Development

### Run with Node.js + Local SQLite
```bash
npm install && npm --prefix web install
npm run build:web
OWNDROP_PASSWORD=dev-password \
OWNDROP_SESSION_SECRET="$(openssl rand -hex 32)" \
OWNDROP_ORIGIN=http://localhost:4180 \
npm run dev:node
```

### Run with Cloudflare Wrangler (Local D1 + R2 Emulation)
```bash
cp .dev.vars.example .dev.vars
npm run build:web
npm run db:migrate:local
npm run dev:cf
```

### Run Tests & Checks
```bash
npm test
npm run typecheck
```

---

## Architecture

```text
server/
├── app.ts                  # Hono REST API, security headers, upload & range streaming
├── auth.ts                 # Password auth, durable sessions, multi-device API tokens
├── oidc.ts                 # Standard OIDC Authorization Code + PKCE S256 + JWKS
├── db.ts                   # Shared SQLite/D1 repository & quota cleanup
├── preview.ts              # SSRF-guarded OpenGraph/HTML link preview fetcher
└── adapters/
    ├── cf/                 # Cloudflare Workers + D1 + R2 + Presigned PUT + Cron
    └── node/               # Node 22 built-in node:sqlite + Local FS + Static Server
web/                        # React 19 + Vite + Tailwind v4 PWA frontend
raycast/                    # Cross-platform Raycast Extension (macOS & Windows)
migrations/                 # Shared SQLite schema migrations
```

## License

[MIT](LICENSE)
