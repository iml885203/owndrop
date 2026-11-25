# OwnDrop REST API Reference

All `/api/items*`, `/api/files*`, `/api/uploads*`, and `/api/me` endpoints accept either:
- Browser session cookie (`owndrop_session`), OR
- Per-device API token via `Authorization: Bearer owd_...` (no `Origin` header required).

Device tokens automatically populate the item's `device` label unless explicitly overridden.

## Endpoints

### `GET /api/health`
Public liveness probe.
```json
{ "status": "ok", "version": "1.0.0" }
```

### `GET /api/me`
Verify credentials and inspect server capabilities (used by Raycast & clients).
```json
{
  "authKind": "device-token",
  "device": "MacBook Pro",
  "version": "1.0.0",
  "maxFileMb": 90,
  "maxPresignedFileMb": 512,
  "maxStorageMb": 8192,
  "directUploadEnabled": true,
  "retentionDays": 90,
  "stats": { "itemCount": 12, "fileBytes": 4820112 }
}
```

### `GET /api/items?q=<query>&limit=<1..200>`
List items ordered by `pinned DESC, created_at DESC`.

### `GET /api/items/latest`
Return the single most recently created item (404 if empty). Ideal for `Copy Latest Drop` and API clients.

### `POST /api/items/text`
```bash
curl -X POST https://drop.example.com/api/items/text \
  -H "Authorization: Bearer $OWNDROP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"https://github.com/honojs/hono"}'
```

### `POST /api/items/file`
Multipart upload for files up to `maxFileMb` (default 90 MB).
```bash
curl -X POST https://drop.example.com/api/items/file \
  -H "Authorization: Bearer $OWNDROP_TOKEN" \
  -F "file=@./screenshot.png"
```

### `POST /api/uploads/presign` & `POST /api/uploads/complete`
Two-step direct-to-R2 upload for files > 90 MB (available when R2 S3 credentials are configured on Cloudflare).
1. `POST /api/uploads/presign` with `{ "name": "video.mp4", "mime": "video/mp4", "size": 157286400 }` → returns `{ uploadId, url, method: "PUT", headers, expiresAt }`.
2. `PUT <url>` with raw file bytes.
3. `POST /api/uploads/complete` with `{ "uploadId": "..." }` → verifies object in R2 and commits item record.

### `GET /api/files/:id`
Download file payload with `Accept-Ranges: bytes` (`200` / `206 Partial Content`).

### `PUT /api/items/:id/pin`
Body: `{ "pinned": true | false }`. Returns `204`.

### `DELETE /api/items/:id`
Deletes metadata and backing blob. Returns `204`.

### `GET / POST / DELETE /api/tokens` *(Browser session only)*
Manage per-device revocable API tokens.
