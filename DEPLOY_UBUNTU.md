# Costing App: Ubuntu Cloud VM Deployment Guide

This guide deploys the Costing Master Data app (FastAPI backend with the built React frontend, SQLite database) on an Ubuntu cloud VM using Docker, with nginx as the public entry point.

For local development, run `uv run backend/run.py` and open `http://localhost:8000`. To run the same Docker setup on your PC (http://localhost/costing/), see "Docker (local and server)" in [README.md](README.md).

## 1. Architecture

```
Browser --> nginx (this project, port 80) --+-- ai.bullmachine.in/costing/ --> costing    (this project)
            the server's only public entry   |                                   +--> volume "costing-data" (/data)
                                             +-- ai.bullmachine.in/scm/     --> voice-web  (~/voice_call project)
                                                                                 +--> PostgreSQL (voice_call)
            all three joined by the shared external Docker network "ai-proxy"
```

| File | Purpose |
|---|---|
| `Dockerfile` | Builds the app image (Python 3.14 with uv) |
| `docker-compose.yml` | App (`127.0.0.1:8000`) and the central nginx (port 80) |
| `deploy/nginx.conf.template` | Reverse proxy for both projects (upload limits, timeouts, websockets); filled in from `DOMAIN`, `BASE_PATH`, `SCM_PATH` |
| `certs/` | Optional extra CA certificates for builds behind an SSL-inspecting proxy; empty on the server |

The two projects are started and maintained separately (`docker compose up -d` in `~/costing` and in `~/voice_call`). This project's nginx holds port 80 for the whole server and forwards `/scm/` to the voice_call `web` service (network alias `voice-web`). Upstreams are resolved per request, so nginx starts even when voice_call is down; `/scm/` then answers 502 and `/costing/` is unaffected. Without `DOMAIN` in `.env` the name defaults to `localhost` (local use).

One-time setup on each machine, before the first `docker compose up` of either project:

```bash
docker network create ai-proxy
```

Nothing else on the host may listen on port 80 (for example a systemd nginx site with `listen 80`).

## 2. Prerequisites

- Ubuntu 22.04 or later VM with SSH access (key-based login).
- Docker Engine and the Docker Compose plugin.
- Inbound port 80 open in the cloud security group or NSG. Open port 443 as well if HTTPS is added later.
- Port 22 restricted to known IP addresses.
- The project in a git repository that the VM can reach.

Check Docker:

```bash
docker --version
docker compose version
```

If Docker is missing, install it from the official Docker apt repository (https://docs.docker.com/engine/install/ubuntu/). Then allow your user to run it:

```bash
sudo usermod -aG docker $USER
# log out and log in again
```

## 3. Get the code

```bash
git clone <repository-url> ~/costing
cd ~/costing
```

`backend/static` (the built React app) must be committed to git. It is part of the image. If the frontend has changed, run `npm run build` in `frontend/` on your PC, then commit `backend/static` before pushing.

## 4. Configure the environment

`.env` is not stored in git. Create it on the VM:

```bash
cd ~/costing
nano .env
```

```
APP_USER=<login id>
APP_PASSWORD=<strong password>
DOMAIN=ai.bullmachine.in
```

- `DOMAIN` is the host name nginx answers to; `/costing/` and `/scm/` hang off it. To change it later, edit it and run `docker compose up -d nginx`. `SCM_PATH` (default `/scm`) must equal `BASE_PATH` of the voice_call project.
- `APP_USER` and `APP_PASSWORD` protect the whole app (HTTP Basic login). Compose refuses to start if either is missing.
- Use a long random password. Do not reuse a personal password.
- Restrict the file: `chmod 600 .env`.

## 5. Build and start

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f
```

Both `costing` and `nginx` should show as running. Open `http://ai.bullmachine.in/costing/` (or `http://<VM-public-IP>/costing/`) in a browser and sign in. The voice_call app is at `http://ai.bullmachine.in/scm/` once that project is up.

## 6. Load the database

The volume starts empty. Choose one method.

**Option A: copy the existing `costing.db` from Windows (PowerShell)**

```powershell
scp -i <path-to-key> D:\11326\Downloads\costing\backend\data\costing.db <vm-user>@<vm-ip>:~/costing.db
```

On the VM:

```bash
docker compose stop costing
docker run --rm -v costing_costing-data:/data -v ~:/src alpine cp /src/costing.db /data/costing.db
docker compose start costing
```

**Option B: seed from the Excel workbook**

`*.xlsx` files are not in git or in the image. Copy the workbook to the VM first (`scp`), then:

```bash
docker compose run --rm \
  -v "$HOME/<workbook-name>.xlsx:/app/workbook.xlsx:ro" \
  costing uv run --no-sync backend/seed.py /app/workbook.xlsx
```

`seed.py` merges into the existing data by default. Add `--replace` after the path to replace it. Check the script's header before using `--replace` on live data.

## 7. Verify

```bash
curl -I http://127.0.0.1:8000/costing/          # expect 401 (login required)
curl -u '<login id>:<password>' -I http://127.0.0.1:8000/costing/   # expect 200
```

From your PC, `http://ai.bullmachine.in/costing/` should show the login prompt (`/` redirects there). The base path comes from `BASE_PATH` (default `/costing`).

## 8. Update to a new version

```bash
cd ~/costing
git pull
docker compose up -d --build
```

The data volume is kept across rebuilds.

## 9. Backup and restore

Back up the database before every update and daily by cron.

```bash
mkdir -p ~/backup
docker run --rm -v costing_costing-data:/data -v ~/backup:/b alpine \
  sh -c 'cp /data/costing.db /b/costing-$(date +%F).db'
```

For a consistent copy while the app is busy, stop the app briefly (`docker compose stop costing`) or use `sqlite3 costing.db ".backup 'file'"`.

Restore by stopping the app and copying a backup file back to `/data/costing.db`, as in section 6, Option A.

Keep backups off the VM as well (another disk or storage account). The SAP run files are in `/data/runs` in the same volume.

## 10. Troubleshooting

| Symptom | Check |
|---|---|
| `docker compose up` stops with "set APP_USER in .env" | `.env` is missing or incomplete in `~/costing` |
| Page does not open from outside | Port 80 in the cloud security group; `sudo ufw status`; `docker compose ps` |
| 502 Bad Gateway | On `/costing/`: `docker compose logs costing`. On `/scm/`: voice_call not running or not on `ai-proxy` (`cd ~/voice_call && docker compose ps`) |
| nginx: "address already in use" on port 80 | Another process holds port 80: `sudo ss -ltnp 'sport = :80'` (e.g. a host nginx site; remove its `listen 80`) |
| "network ai-proxy declared as external, but could not be found" | `docker network create ai-proxy` |
| 413 on upload | Raise `client_max_body_size` in `deploy/nginx.conf.template` to match `MAX_UPLOAD_MB`, then `docker compose up -d --force-recreate nginx` |
| Upload times out | Raise `proxy_read_timeout` in `deploy/nginx.conf.template` |
| Wrong app or path | `DOMAIN` / `SCM_PATH` in `.env`; `docker compose exec nginx cat /etc/nginx/conf.d/default.conf` shows the rendered config |
| Build fails with `CERTIFICATE_VERIFY_FAILED` | An SSL-inspecting proxy: put its CA (PEM `.crt`) in `certs/` and rebuild |
| Data lost after rebuild | Never run `docker compose down -v`; `-v` deletes the data volume |

Useful commands:

```bash
docker compose logs -f costing     # app logs
docker compose logs -f nginx       # proxy logs
docker compose restart costing
docker compose down                # stop, keep data
```

## 11. Security notes

- The site is plain HTTP by default. HTTP Basic login sends the password with every request, encoded but not encrypted. Add HTTPS (certificate on nginx) before use outside a trusted network or VPN, or restrict access by VPN or IP allow-list.
- There is a single shared login, so there is no per-user audit trail.
- Costing data is restricted company information. Keep the VM, backups and `.env` access-controlled.
- Do not commit `.env`, the database or workbooks to git.
- Keep the VM patched: `sudo apt update && sudo apt upgrade`.
