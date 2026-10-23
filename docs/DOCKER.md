# Docker Deployment Guide

SubFaber deploys to a VPS with Docker Compose. The canonical, security-hardened stack lives in [`docker-compose.yaml`](../docker-compose.yaml) at the repository root — this guide walks you through using it, plus a filesystem-only variant for single-node setups.

> **Official deployment method:** build from source with `docker compose up -d --build`. No pre-built Docker Hub image is currently published for SubFaber; the local build path is the supported route.

## Prerequisites

- Docker 20+ and Docker Compose v2
- An OpenSubtitles API key (recommended — OpenSubtitles is the primary source-subtitle provider)
- An AI translation provider key of your choice (Gemini is only one of 10+ supported AI doors)

## Quick Start (VPS / Production — Redis stack)

1) Clone the repository and enter it:
```bash
git clone https://github.com/mfzf99/StremioSubFaber.git
cd StremioSubFaber
```

2) Create `.env` from the example (minimum settings):
```env
OPENSUBTITLES_API_KEY=your_opensubtitles_key
STORAGE_TYPE=redis
# Optional: override defaults
# PORT=7001
# REDIS_PASSWORD=
```

3) Build and start using the repository's canonical compose file:
```bash
docker compose up -d --build
docker compose logs -f subfaber
```

The repository's [`docker-compose.yaml`](../docker-compose.yaml) already implements the security gold standard:
- **App and Redis ports bind to `127.0.0.1` only** (`127.0.0.1:${PORT:-7001}:7001` and `127.0.0.1:6379:6379`) — neither service is exposed to the public internet. Put a reverse proxy (nginx, Caddy, Cloudflare Tunnel) with HTTPS in front of port 7001.
- **`REDIS_KEY_PREFIX=stremio:`** with the mandatory trailing colon — keep it identical across all instances to avoid namespace splits.
- **Redis password auto-generated** (32-char random, persisted at `/app/keys/.redis-password`, shared with the app via the `encryption-key` volume) — no manual password management required.
- **`TRUST_PROXY=1`** pre-set for reverse-proxy deployments, so rate limiting and client-IP detection work correctly.
- **Encryption key persisted** in the `encryption-key` named volume (`/app/keys/.encryption-key`) — without this, encrypted user sessions become unreadable after a restart.
- Healthchecks on both services, `stop_grace_period: 30s` for clean session shutdown, and `depends_on` gating on Redis health.

Do NOT replace the canonical compose file with a hand-written one — it is the single source of truth for a correct, secure deployment.

## Filesystem-only variant (no Redis)

Good for single-node/local use. Storage stays on local disk.

`.env`:
```env
OPENSUBTITLES_API_KEY=your_opensubtitles_key
STORAGE_TYPE=filesystem
# PORT=7001
```

Start with the dedicated local compose file (forces `STORAGE_TYPE=filesystem`, uses bind mounts for data/cache/logs/keys):
```bash
docker compose -f docker-compose.local.yaml up -d --build
docker compose -f docker-compose.local.yaml logs -f subfaber
```

## Docker run (without Compose)

Build the image locally first, then run it. Filesystem storage:
```bash
docker build -t subfaber .
docker run -d \
  --name subfaber \
  -p 7001:7001 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/keys:/app/keys \
  -v $(pwd)/.cache:/app/.cache \
  -e STORAGE_TYPE=filesystem \
  -e OPENSUBTITLES_API_KEY=your_opensubtitles_key \
  subfaber
```

External Redis (you supply Redis):
```bash
docker run -d \
  --name subfaber \
  -p 127.0.0.1:7001:7001 \
  -e STORAGE_TYPE=redis \
  -e REDIS_HOST=your-redis-host \
  -e REDIS_PORT=6379 \
  -e REDIS_PASSWORD= \
  -e REDIS_DB=0 \
  -e REDIS_KEY_PREFIX=stremio: \
  -e REDIS_PASSWORD_FILE=/app/keys/.redis-password \
  -e ENCRYPTION_KEY_FILE=/app/keys/.encryption-key \
  -e TRUST_PROXY=1 \
  -v $(pwd)/keys:/app/keys \
  subfaber
```

## Configuration notes

- `OPENSUBTITLES_API_KEY` is recommended — OpenSubtitles is the primary source-subtitle provider and gives maximum coverage. SubDL and SubSource keys are optional alternatives configured in the web UI.
- Gemini is only ONE of the 10+ supported AI translation doors (OpenAI, Anthropic, DeepL, DeepSeek, Grok, Mistral, OpenRouter, Cloudflare, Google Translate, Custom/OpenAI-compatible). All provider keys are configured in the web UI after startup, not in `.env`.
- `STORAGE_TYPE` defaults to `redis`; set to `filesystem` for single-node/local installs.
- Encryption key: if `ENCRYPTION_KEY` is unset, the app writes a key to `/app/keys/.encryption-key`; keep that path persistent (named volume or bind mount). Losing this key makes all encrypted user session data unreadable.
- Redis password: set `REDIS_PASSWORD_FILE` (for example `/app/keys/.redis-password`) to auto-generate and persist a strong Redis password. If `REDIS_PASSWORD` is set, that value is used instead and written to the password file. Ensure Redis is configured to read the same file; the provided `docker-compose.yaml` handles this via the shared `keys` volume.
- Ports: container listens on `7001` by default; override with `PORT` env and matching host mapping. Keep the `127.0.0.1` host binding for production and terminate TLS at a reverse proxy.
- `TRUST_PROXY`: set to `1` when running behind a reverse proxy (nginx, Cloudflare, etc.) so Express reads the real client IP from `X-Forwarded-For`. Defaults to `false` (safe for direct exposure). Accepts numeric depth, boolean, or named values (`loopback`, `linklocal`, `uniquelocal`).
- OpenSubtitles Auth in multi-instance deployments uses shared Redis coordination. Keep all SubFaber replicas on the same Redis/key prefix so JWT cache and login singleflight locks are shared. Advanced tuning variables: `OPENSUBTITLES_LOGIN_MIN_INTERVAL_MS`, `OPENSUBTITLES_LOGIN_LOCK_TTL_MS`.
- Subtitle provider searches use the timeout saved in each installed config. A separate stuck-search guard defaults to 60s and can be tuned with `SUBTITLE_SEARCH_HARD_TIMEOUT_MS`; `SUBTITLE_SEARCH_STALE_GRACE_MS` controls when an old in-flight search may be replaced.
- Redis commands default to a 5000ms command timeout via `REDIS_COMMAND_TIMEOUT_MS`; this is a storage safety limit, not the subtitle provider timeout.

## Troubleshooting

- Check app logs: `docker compose logs -f subfaber`
- Check Redis: `docker compose logs -f redis` and `docker compose ps`
- Port in use? adjust `${PORT:-7001}` mapping or free the port (`lsof -i :7001` on Linux/macOS, `netstat -ano | findstr :7001` on Windows).
- Update to the latest version: `git pull` then `docker compose up -d --build`

---

[Back to README](../README.md)
