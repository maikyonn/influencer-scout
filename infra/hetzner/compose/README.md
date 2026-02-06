# Hetzner Deploy (Docker Compose)

These files mirror the production layout on the Hetzner host.

- `docker-compose.yml` is a reference template. Do not commit secrets.
- `docker-compose.ghcr.yml` is the recommended template for GHCR-based deploys (no repo checkout needed on the server).
- Use `*.env.example` files and provision secrets on the server.

Typical layout on the server:

- `/opt/influencer-scout/compose/docker-compose.ghcr.yml`
- `/opt/influencer-scout/compose/influencer-scout.env`
- `/opt/influencer-scout/compose/sql/init.sql`

## Recommended Deploy Flow (GHCR)
1. Copy `docker-compose.ghcr.yml` + `sql/init.sql` to the server under `/opt/influencer-scout/compose/`.
2. Create `/opt/influencer-scout/compose/influencer-scout.env` based on `influencer-scout.env.example`.
3. Run:
   - `docker compose -f docker-compose.ghcr.yml up -d`
4. Keep Caddy on the host reverse proxying to `127.0.0.1:8091`.

## GitHub Actions Deploy
The workflow `.github/workflows/deploy-hetzner.yml` can build/push the API image to GHCR and then SSH into the host to:
- `docker compose pull`
- `docker compose up -d`

Required repo secrets:
- `HETZNER_HOST` (public IPv4/IPv6)
- `HETZNER_USER` (usually `ubuntu`)
- `HETZNER_SSH_KEY` (private key contents)
- `HETZNER_SSH_PORT` (optional; default 22)
