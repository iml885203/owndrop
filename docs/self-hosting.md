# Self-Hosting OwnDrop with Docker

The exact same OwnDrop codebase runs in a lightweight **Node.js 22** container using Node's built-in `node:sqlite` (zero native C++ build dependencies) and a local filesystem volume for uploaded files.

## Quick Start

```bash
cp .env.example .env
```

Edit `.env`:
```env
OWNDROP_ORIGIN=https://drop.example.com
OWNDROP_PASSWORD=use-a-strong-unique-password
OWNDROP_SESSION_SECRET=generate-with-openssl-rand-base64-48
```

Start the container:
```bash
docker compose up -d --build
```

OwnDrop listens on `127.0.0.1:4180` by default. Put Caddy, Nginx, Traefik, or Cloudflare Tunnel in front of it with HTTPS matching `OWNDROP_ORIGIN`.

## Optional OIDC Login (Pocket ID / Authentik / Authelia)

Add these variables to `.env` and restart:
```env
OWNDROP_OIDC_ISSUER=https://id.example.com
OWNDROP_OIDC_CLIENT_ID=owndrop
OWNDROP_OIDC_CLIENT_SECRET=your-client-secret
OWNDROP_OIDC_REQUIRED_GROUP=homelab-admin
```

Configure your OIDC provider with:
- **Callback URL**: `https://drop.example.com/auth/callback`
- **Grant Type**: Authorization Code
- **PKCE**: Required (`S256`)
- **Scopes**: `openid profile email` (+ `groups` if `OWNDROP_OIDC_REQUIRED_GROUP` is set)

## Backup & Restore

All persistent data lives inside the `/data` volume (`owndrop.sqlite` + `uploads/`). Stop the container before taking a filesystem snapshot to ensure SQLite consistency.
