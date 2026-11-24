# Deploying OwnDrop on Cloudflare ($0/month Free Tier)

OwnDrop is designed Cloudflare-Native first using **Workers + Static Assets + D1 + R2 + Cron Triggers**.

## Free Tier Headroom (Personal Use)

| Resource | Cloudflare Free Allowance | OwnDrop Safeguard |
| :--- | :--- | :--- |
| **Workers** | 100,000 API requests/day | Static frontend assets are served free without invoking the Worker |
| **D1 (SQLite)** | 5 GB storage, 5M reads/day, 100k writes/day | Lightweight metadata queries |
| **R2 Storage** | 10 GB/month, 1M writes/mo, 10M reads/mo, **$0 egress** | Default `OWNDROP_MAX_STORAGE_MB=8192` + daily Cron cleanup evicts oldest files before hitting 10 GB |

> **Note**: Cloudflare requires a payment method on file to activate R2, even though usage within the 10 GB free allowance is $0/month.

## Step-by-Step Deployment

### 1. Authenticate Wrangler
```bash
npx wrangler login
```

### 2. Provision D1 and R2
```bash
npx wrangler d1 create owndrop-db
npx wrangler r2 bucket create owndrop-files
```
Copy the `database_id` printed by `wrangler d1 create` into `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "owndrop-db"
database_id = "<YOUR_DATABASE_ID>"
migrations_dir = "migrations"
```

### 3. Apply Database Migrations
```bash
npm run db:migrate:remote
```

### 4. Configure Secrets
```bash
npx wrangler secret put OWNDROP_ORIGIN          # https://drop.yourdomain.com
npx wrangler secret put OWNDROP_PASSWORD        # Strong password (optional if OIDC is enabled)
npx wrangler secret put OWNDROP_SESSION_SECRET  # Generate: openssl rand -base64 48
```

### 5. (Optional) Enable Standard OIDC (Pocket ID / Authentik / Authelia)
Register a confidential Authorization Code client with callback `https://drop.yourdomain.com/auth/callback` and PKCE S256:
```bash
npx wrangler secret put OWNDROP_OIDC_ISSUER
npx wrangler secret put OWNDROP_OIDC_CLIENT_ID
npx wrangler secret put OWNDROP_OIDC_CLIENT_SECRET
npx wrangler secret put OWNDROP_OIDC_REQUIRED_GROUP  # Optional, e.g. homelab-admin
```

### 6. (Optional) Enable Direct Uploads > 90 MB via R2 Presigned URLs
Cloudflare Workers Free limits single incoming HTTP request bodies to 100 MB. To upload larger files (up to `OWNDROP_MAX_PRESIGNED_FILE_MB`, default 512 MB) directly from your browser or Raycast to R2:

1. In Cloudflare Dashboard → **R2 → Manage R2 API Tokens**, create an API token with **Object Read & Write** permission for `owndrop-files`.
2. Add CORS rules on the `owndrop-files` bucket allowing `PUT` from your `OWNDROP_ORIGIN` (`AllowedHeaders: ["Content-Type"]`).
3. Store the S3 credentials as Worker secrets:
```bash
npx wrangler secret put OWNDROP_R2_ACCOUNT_ID
npx wrangler secret put OWNDROP_R2_BUCKET_NAME
npx wrangler secret put OWNDROP_R2_ACCESS_KEY_ID
npx wrangler secret put OWNDROP_R2_SECRET_ACCESS_KEY
```

### 7. Build & Deploy
```bash
npm run deploy:cf
```

Attach a custom domain in Cloudflare Dashboard → **Workers & Pages → owndrop → Settings → Domains & Routes**.
