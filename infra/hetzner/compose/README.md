# Hetzner Deploy (Docker Compose)

These files mirror the production layout on the Hetzner host.

- `docker-compose.yml` is a reference template. Do not commit secrets.
- Use `*.env.example` files and provision secrets on the server.

Typical layout on the server:

- `/opt/penny/compose/docker-compose.yml`
- `/opt/penny/compose/influencer-scout.env`
- `/opt/penny/secrets/*`
