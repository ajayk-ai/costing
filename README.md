# Costing Master Data

Web app for the master data behind the Departmentwise Expense Report.

- **Backend:** Python + FastAPI, managed with [uv](https://docs.astral.sh/uv/); SQLite (`backend/data/costing.db`), openpyxl for Excel
- **Frontend:** React (Vite), plain CSS

## Masters

| Group | Master | Kind |
|---|---|---|
| Description Masters | Material, Offsetting, Order (IO), Cost Center, Account Description, P&L Group (by Account, loaded from the "Departmentwise Expense report" tab) | one row per code |
| D1 Department Mapping | Fixed Expenses based Account, Salary based on Order, Wages based on Cost Center, Consulting based on Offsetting Account, Consumable, Field Employees, ESI & PF, Emp ID | mapping table: the same code can appear more than once, exact duplicate rows are dropped |

The ESI & PF tab in the workbook is empty, so this master has no fixed columns. The header row of the first file uploaded to it sets them.

## Run

```
start.bat
```

That opens the app in the browser (http://localhost:8000 by default) and serves the built React app from the API. It is the same as `uv run backend/run.py --open`.

### Deploying to another machine

The built frontend is committed in `backend/static/`, so the other machine needs only [uv](https://docs.astral.sh/uv/getting-started/installation/), not Node.js:

```
git clone <repo> costing && cd costing
start.bat                              # first run creates .env and .venv, then opens the browser
```

Set `APP_HOST=0.0.0.0` in `.env` to let other PCs on the network open `http://<this-pc>:8000`. The database (`backend/data/`) and the Excel workbooks are not in git: copy `backend/data/costing.db` across, or upload the workbook in the app (**Upload full workbook**) or run `uv run backend/seed.py <file.xlsx>`.

## Deploy on an Ubuntu server (Docker)

Production setup: one Ubuntu VM runs both projects. This project's nginx owns port 80 and is the single public entry point for one domain: `ai.bullmachine.in/costing/` (this app) and `ai.bullmachine.in/scm/` (voice_call, its own separate Compose project, reached over the shared Docker network `ai-proxy`). Full detail, database loading, backups and troubleshooting: [DEPLOY_UBUNTU.md](DEPLOY_UBUNTU.md).

### 1. Prepare Ubuntu and install Docker

Ubuntu 22.04 or later with SSH access. The VM needs outbound internet access to Docker Hub (base images), PyPI (Python packages) and registry.npmjs.org (frontend build). Install Docker Engine and the Compose plugin from Docker's apt repository:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in (or run `newgrp docker`), then check:

```bash
docker --version
docker compose version
```

### 2. DNS and firewall

- An A record for `ai.bullmachine.in` pointing at the VM's public IP (both apps share it).
- Inbound **80** open in the cloud security group or NSG (443 too once HTTPS is added); 22 limited to known IPs.
- Keep 8000, 8001 and 5432 closed; only nginx is public.

On the VM, if using `ufw`:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. Clone and configure

```bash
git clone <repository-url> ~/costing
cd ~/costing
cp .env.example .env
nano .env
```

Set at least:

```dotenv
APP_USER=<login id>
APP_PASSWORD=<strong password>
DOMAIN=ai.bullmachine.in
# BASE_PATH=/costing        # default; change only for another path
# SCM_PATH=/scm             # default; must equal voice_call's BASE_PATH
# FRONTEND_SOURCE=build     # default; leave unset on the server
```

- Create a fresh `.env` on the server; do not copy the office PC's `.env` (it has `FRONTEND_SOURCE=prebuilt`).
- `APP_USER` / `APP_PASSWORD` are the HTTP Basic login; Compose refuses to start without them.
- `certs/` stays empty on the server (it is only for an SSL-inspecting office proxy).
- Lock the file down: `chmod 600 .env`.

### 4. Build and start

```bash
docker compose up -d --build
docker compose ps          # costing and nginx: Up
```

### 5. Load the database

The `costing-data` volume starts empty. Choose one method. The commands below assume the project is cloned to `~/costing`, so the volume is `costing_costing-data`; otherwise check `docker volume ls`.

**Copy the existing database from Windows** (PowerShell):

```powershell
scp -i <key> D:\path\to\costing\backend\data\costing.db <vm-user>@<vm-ip>:~/costing.db
```

On the VM:

```bash
docker compose stop costing
docker run --rm -v costing_costing-data:/data -v ~:/src alpine cp /src/costing.db /data/costing.db
docker compose start costing
```

**Or seed from the Excel workbook** (copy the `.xlsx` to the VM first):

```bash
docker compose run --rm \
  -v "$HOME/<workbook-name>.xlsx:/app/workbook.xlsx:ro" \
  costing uv run --no-sync backend/seed.py /app/workbook.xlsx
```

`seed.py` merges by default; add `--replace` after the path to replace existing data.

### 6. Verify

```bash
curl -I -H "Host: ai.bullmachine.in" http://localhost/costing/              # 401 = login prompt, app is up
curl -u '<login id>:<password>' -I http://localhost/costing/                # 200
```

From a browser: `http://ai.bullmachine.in/costing/` (`/` redirects there).

### 7. Deploy voice_call too

This nginx forwards `/scm/` to the voice_call project's `web` service over the `ai-proxy` network, so run its stack as well (steps in the voice_call project's `readme.md`):

```bash
git clone <voice_call-repository-url> ~/voice_call
cd ~/voice_call
cp .env.example .env && nano .env    # PUBLIC_URL=https://ai.bullmachine.in/scm
chmod 600 .env
docker compose up -d --build
```

Until voice_call is up, `/scm/` answers 502; `/costing/` is unaffected. The two projects can start in either order (both need `docker network create ai-proxy` once).

### 8. Update, logs, stop, backup

```bash
cd ~/costing
git pull && docker compose up -d --build   # new version, data volume kept
docker compose logs -f costing             # or: nginx
docker compose down                        # stop; never add -v (deletes the database volume)
```

Back up the SQLite database (restore steps in [DEPLOY_UBUNTU.md](DEPLOY_UBUNTU.md)):

```bash
mkdir -p ~/backup
docker run --rm -v costing_costing-data:/data -v ~/backup:/b alpine \
  sh -c 'cp /data/costing.db /b/costing-$(date +%F).db'
```

The site is plain HTTP until a TLS certificate is added to this nginx. voice_call needs HTTPS for phone calls.

## Docker (local and server)

This project and the voice_call project each have their own `docker-compose.yml` and are started separately. There is one nginx, in this project; voice_call has none. Each app runs under its own **base path** on one domain: costing under `/costing/`, voice_call under `/scm/`. The domain and paths come from `.env`, so the same files work on your PC and on the server.

```
:80 --> nginx (this project) --+-- DOMAIN/costing/ --> costing   (127.0.0.1:8000/costing/)
                               +-- DOMAIN/scm/     --> voice-web (127.0.0.1:8001/scm/, voice_call project)
        shared external Docker network "ai-proxy" (create once: docker network create ai-proxy)
```

| | costing | voice_call |
|---|---|---|
| App port directly | http://127.0.0.1:8000/costing/ | http://127.0.0.1:8001/scm/ |
| Through nginx, local (default) | http://localhost/costing/ | http://localhost/scm/ |
| Through nginx, server | http://ai.bullmachine.in/costing/ | http://ai.bullmachine.in/scm/ |

| Setting (`.env`) | Project | Default | Server value |
|---|---|---|---|
| `DOMAIN` | costing | `localhost` | `ai.bullmachine.in` |
| `BASE_PATH` | costing | `/costing` | same |
| `SCM_PATH` | costing (nginx) | `/scm` | same; must equal voice_call's `BASE_PATH` |
| `BASE_PATH` | voice_call | `/scm` | same |

Only one process can use port 80, so this project's nginx owns it and forwards `/scm/` to voice_call (alias `voice-web` on `ai-proxy`). nginx resolves both upstreams per request, so the two projects can start in either order; until voice_call is up, `/scm/` answers 502. The nginx config is [deploy/nginx.conf.template](deploy/nginx.conf.template), and nginx fills in the domain and paths when it starts.

**How the image is built** ([Dockerfile](Dockerfile), [docker-compose.yml](docker-compose.yml)):
1. The frontend is built from `frontend/` with `npm ci && npm run build` inside Docker (`FRONTEND_SOURCE=build`, the default). On networks that block npm it comes from the host-built `backend/static` instead (`FRONTEND_SOURCE=prebuilt`).
2. The Python dependencies are installed with uv, the backend is copied to `/app/backend`, and the frontend goes to `/app/backend/static` (`FRONTEND_DIST`).
3. The app starts with `uv run --no-sync backend/run.py` (the `command:` in docker-compose.yml) on port 8000 under `BASE_PATH`. Data lives in the `costing-data` volume at `/data`.

The frontend uses relative URLs, so one build works under any `BASE_PATH`. Changing the path needs only `docker compose up -d`, not a rebuild.

### Run locally (Docker Desktop)

1. Start Docker Desktop.
2. `.env` needs `APP_USER` and `APP_PASSWORD` (`copy .env.example .env`). Leave `DOMAIN`/`BASE_PATH`/`SCM_PATH` unset for the defaults. Run `docker network create ai-proxy` once.
3. **Office network only** (Fortinet SSL inspection, npm registry blocked):
   - Put the firewall's CA certificate in `certs/` as a `.crt` file (PEM), or builds fail with `CERTIFICATE_VERIFY_FAILED`. Export it from Windows (`certmgr.msc` → Trusted Root → the Fortinet `FG…` certificate → Export, Base-64). `certs/*.crt` is git-ignored.
   - Add `FRONTEND_SOURCE=prebuilt` to `.env` and build the frontend on the PC first: `cd frontend && npm run build` (this needs the existing `node_modules`).
   - On the server, leave `certs/` empty and `FRONTEND_SOURCE` unset.
4. Start:
   ```
   docker compose up -d --build
   docker compose ps                  # costing and nginx: Up
   ```
5. Open http://localhost/costing/ or http://127.0.0.1:8000/costing/ (login prompt). Start voice_call too for http://localhost/scm/.

### Server deployment

See [Deploy on an Ubuntu server (Docker)](#deploy-on-an-ubuntu-server-docker) above for the full step-by-step setup (Docker install, DNS/firewall, `.env`, build, database, verify, updates and backups).

### Changing a domain or base path later

- **Domain:** edit `DOMAIN` in `.env`, then run `docker compose up -d nginx`. Update DNS to match.
- **voice_call path:** set `BASE_PATH` in voice_call and `SCM_PATH` here to the same value, then `docker compose up -d` in both projects.
- **Base path:** edit `BASE_PATH` in `.env` and run `docker compose up -d`. That recreates the app and nginx; no rebuild is needed.

No file edits are needed for either.

### Update, logs, stop

```bash
git pull && docker compose up -d --build   # new version, data volume kept
docker compose logs -f costing             # or: nginx
docker compose down                        # stop; never add -v (deletes the database volume)
```

Database loading, backups and troubleshooting are in [DEPLOY_UBUNTU.md](DEPLOY_UBUNTU.md). The site is plain HTTP until a TLS certificate is added to this nginx. voice_call needs HTTPS for phone calls.

## Configuration (.env)

All settings live in `.env` in the project root. `.env` is not committed: copy `.env.example` to `.env` and edit it (`start.bat` does this automatically the first time). Relative paths are resolved from the project root. A real environment variable with the same name overrides `.env`.

| Key | Default | Purpose |
|---|---|---|
| `APP_HOST` | `127.0.0.1` | address the API listens on; `0.0.0.0` makes it reachable from other PCs |
| `APP_PORT` | `8000` | API port, also used by the Vite dev proxy |
| `APP_RELOAD` | `false` | `true` restarts the server when backend code changes (development) |
| `DB_PATH` | `backend/data/costing.db` | SQLite database file |
| `SEED_WORKBOOK` | `Departmnetwise Expense Report 2026-27 (2).xlsx` | workbook loaded by `seed.py` when no path is given |
| `FRONTEND_DIST` | `backend/static` | built React app served at `/` (or at `BASE_PATH/`) |
| `BASE_PATH` | *(empty)*; `/costing` in Docker | URL prefix the whole app is served under; `/` redirects there |
| `FRONTEND_SOURCE` | `build` | Docker only: `build` runs npm in Docker; `prebuilt` uses the host-built `backend/static` |
| `VITE_DEV_PORT` | `5173` | port for `npm run dev` |
| `MAX_UPLOAD_MB` | `100` | largest Excel upload accepted |
| `CORS_ORIGINS` | *(empty)* | comma-separated origins allowed to call the API from another host |

### First-time setup (already done on this machine)

Requires [uv](https://docs.astral.sh/uv/getting-started/installation/). Node.js 18+ is needed only to change the frontend.

```
# install uv (once per machine)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# from the project root (D:\11326\Downloads\costing)
copy .env.example .env                 # then edit paths/ports if needed
uv sync                                # creates .venv here (project root) with the Python in .python-version and the locked packages
uv run backend/seed.py                 # load masters from SEED_WORKBOOK
```

`uv run backend/seed.py <file.xlsx>` loads a different workbook; add `--replace` to wipe each master found first.

### Project layout

```
costing/
  .env  .env.example   settings (.env is not committed)
  pyproject.toml  uv.lock  .python-version   Python project (uv); requirements.txt is exported from it
  start.bat            one-click start
  backend/             FastAPI server  (Python)
    run.py  seed.py    start the server / load masters from the workbook
    app/
      main.py          app wiring only: CORS, routers, frontend mount
      config.py        all settings, read from .env
      api/             HTTP layer: masters.py, sap.py, deps.py (shared helpers), frontend.py (serves the built UI)
      services/        business logic: excel.py (parse/export), sap.py (SAP mapping rules), sap_runs.py (run + store result)
      db/              SQLite: connection.py (schema, tx), master_repo.py, run_repo.py
      domain/          masters.py: the 14 master definitions (columns, aliases, tab names)
    tests/             pytest: test_e2e.py (API end to end), test_frontend_contract.py
    static/            built React app, committed, served at /
    data/              costing.db and processed SAP files (not committed)
  frontend/            React app  (JavaScript, Vite)
    src/api.js         the only file that talks to the backend
    src/ui/            reusable components: Button, Card, Modal, Tabs, FileDrop, Pagination, Alert, Toast, ...
    src/layout/        Topbar and Sidebar (a drawer on phones)
    src/pages/sap/     SAP Data Mapping page: upload, previous runs, result tabs
    src/pages/masters/ master page: table, search, edit/upload dialogs, upload history
```

Dependency direction on the backend is one way: `api -> services -> db -> domain`. Routers hold no business logic; services never import `api`.

### Backend dependencies

Dependencies are declared in `pyproject.toml` and pinned in `uv.lock` at the project root; commit both. Run these from the project root:

```
uv add <package>                       # add a dependency
uv remove <package>
uv lock --upgrade                      # upgrade everything within the pyproject constraints
uv export --no-hashes -o requirements.txt   # refresh requirements.txt for pip-only machines
```

### Developing

```
uv run backend/run.py                  # from the project root; set APP_RELOAD=true in .env for auto-restart
cd frontend && npm run dev
```

### Testing

```
uv run pytest                          # from the project root
```

`backend/tests/test_e2e.py` drives the real API (masters CRUD, Excel upload/export, SAP processing, download, frontend serving) against a temporary database, so it never touches `backend/data/`. `test_frontend_contract.py` fails if `frontend/src/api.js` calls an endpoint the backend does not serve.

The second command runs Vite on `VITE_DEV_PORT` (5173) and forwards `/api` to `APP_PORT`. When done, run `npm install` (once) and `npm run build` in `frontend/`, then commit `backend/static/` so port 8000 and other machines get the new version.

## SAP Data Mapping

Sidebar → **Processing → SAP Data Mapping**. Upload the SAP export: the tab named "SAP DATA" is used if present, otherwise the first sheet. Click **Process**, then **Download result .xlsx**. Every run is kept under `RUNS_DIR` and listed in *Previous runs*.

Columns added (orange in the output file):

| New column | How it is filled |
|---|---|
| Month | from **Year/month**, which holds the fiscal period: period 1 = April … 12 = March |
| Offst.acct Desc | Offsetting Description master, by **Offst.acct** |
| Account Description | Account Description master, by **Account** |
| P&L Group | P&L Group master, by **Account** |
| CC Description | Cost Center Description master, by **Cost Ctr** |
| Order Desc | Order Description master, by **Order** |
| Material desc | Material Description master, by **Material** |
| Department | D1 rules below, in order |

The result has exactly the 25 columns of the **REDIFINED DATA** sheet, in the same order (`LAYOUT` in `backend/app/sap.py`). Other SAP columns (Vendor, Clrng doc., Bline Date, Ref.key (header) 1, Reference, Reference Key 3) are left out. Which D1 rule filled each row is shown in the app's summary, not in the file.

The P&L Group master was built from the existing "Departmentwise Expense report" tab, where each Account has one P&L Group. For an account missing from it, add the row in **P&L Group** (or upload the report again).

Date columns (Doc. Date, Pstng Date) are written as real dates shown `dd-mm-yyyy` with no time. In the SAP export, dates with a day of 12 or less are often stored with day and month swapped (12-10-2026 becomes 10 Dec), while later days stay as text. When a column shows that pattern, the swap is reversed. Year/month is shown `yyyy/mm`.

Department rules. Each step only fills rows still blank after the steps above it:

| # | D1 master | SAP field | Master column → department |
|---|---|---|---|
| 1 | Fixed Expenses based Account | Account | Account → Department |
| 2 | Salary based on Order | Order | Order → Department |
| 3 | Wages based on Cost Center | Cost Ctr | Cost Center → Department |
| 4 | Consulting based on Offsetting Account | Offst.acct | Offst.acct → Department |
| 5 | Consumable | Cost Ctr | Cost Ctr → Department |
| 6 | Field Employees | Offst.acct | EMP CODE → DEPARTMENT REGION |
| 7 | ESI & PF | Assignment (employee ID on PF/ESI postings) | first column → first column named like "Dept"; skipped while the master is empty |
| 8 | Emp ID | Offst.acct, then Assignment | EMP ID → REVISED DEPT. |

Codes are compared ignoring leading zeros (`0000500458` = `500458`). Where a D1 sheet lists the same code twice with different departments, the first row wins and the run notes say so. The Amount column is converted from text like `-1,61,925.00` to a number. The result also contains a **Summary** sheet with rows filled per step, missing description codes and accounts left without a department.

The rule order and match fields are defined in `RULES` in `backend/app/sap.py`.

## Updating masters from Excel

- **Upload .xlsx** on a master: if the file has a tab named like the master, that tab is used, otherwise the first sheet. Headers are matched by name (case, spaces and punctuation ignored). **Template** gives a blank file with the right headings.
- **Upload full workbook** (top right): upload the whole expense report. Every master tab found is updated, and empty tabs are skipped.

| Mode | Description masters | D1 mapping tables |
|---|---|---|
| Merge | add new codes, update changed values; a blank cell never overwrites an existing value | add rows not already present |
| Replace all | delete that master's records, then load the file | same |

To correct a D1 mapping in bulk, use **Replace all**: Merge only adds rows, so a changed department would sit next to the old row.

## API

Interactive docs: http://localhost:8000/docs

- `GET /api/masters`: masters, columns, counts
- `GET /api/masters/{type}?q=&page=&size=`: search and page rows
- `POST /api/masters/{type}` · `PUT|DELETE /api/masters/{type}/rows/{id}`
- `POST /api/masters/{type}/upload?mode=merge|replace` (multipart `file`)
- `POST /api/upload-workbook?mode=merge|replace`
- `GET /api/masters/{type}/export` · `/template` · `/logs`
