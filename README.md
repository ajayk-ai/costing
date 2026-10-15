# Costing Master Data

Web app for the master data behind the Departmentwise Expense Report.

- **Backend:** Python + FastAPI, managed with [uv](https://docs.astral.sh/uv/); SQLite (`backend/data/costing.db`), openpyxl for Excel
- **Frontend:** React (Vite), plain CSS

## Masters

| Group | Master | Kind |
|---|---|---|
| Description Masters | Material, Offsetting, Order (IO), Cost Center, Account Description | one row per code |
| D1 Department Mapping | Fixed Expenses based Account, Salary based on Order, Wages based on Cost Center, Consulting based on Offsetting Account, Consumable, Field Employees, ESI & PF, Emp ID | mapping table: the same code can appear more than once, exact duplicate rows are dropped |

The ESI & PF tab in the workbook is empty, so this master has no fixed columns. The header row of the first file uploaded to it sets them.

## Run

```
start.bat
```

That opens the app in the browser (http://localhost:8000 by default) and serves the built React app from the API. It is the same as `uv run backend/run.py --open`.

## Configuration (.env)

All settings live in `.env` in the project root. `.env` is not committed: copy `.env.example` to `.env` and edit it (`start.bat` does this automatically the first time). Relative paths are resolved from the project root. A real environment variable with the same name overrides `.env`.

| Key | Default | Purpose |
|---|---|---|
| `APP_HOST` | `127.0.0.1` | address the API listens on; `0.0.0.0` makes it reachable from other PCs |
| `APP_PORT` | `8000` | API port, also used by the Vite dev proxy |
| `APP_RELOAD` | `false` | `true` restarts the server when backend code changes (development) |
| `DB_PATH` | `backend/data/costing.db` | SQLite database file |
| `SEED_WORKBOOK` | `Departmnetwise Expense Report 2026-27 (2).xlsx` | workbook loaded by `seed.py` when no path is given |
| `FRONTEND_DIST` | `frontend/dist` | built React app served at `/` |
| `VITE_DEV_PORT` | `5173` | port for `npm run dev` |
| `MAX_UPLOAD_MB` | `100` | largest Excel upload accepted |
| `CORS_ORIGINS` | *(empty)* | comma-separated origins allowed to call the API from another host |

### First-time setup (already done on this machine)

Requires [uv](https://docs.astral.sh/uv/getting-started/installation/) and Node.js 18+.

```
# install uv (once per machine)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# from the project root (D:\11326\Downloads\costing)
copy .env.example .env                 # then edit paths/ports if needed
uv sync                                # creates .venv here (project root) with the Python in .python-version and the locked packages
uv run backend/seed.py                 # load masters from SEED_WORKBOOK
cd frontend
npm install
npm run build
```

`uv run backend/seed.py <file.xlsx>` loads a different workbook; add `--replace` to wipe each master found first.

### Project layout

```
costing/
  .env                settings (not committed)  ·  .env.example  template
  .venv/              Python environment (created by uv sync, not committed)
  pyproject.toml      Python dependencies
  uv.lock             pinned versions
  .python-version
  backend/            FastAPI app (app/, settings in app/config.py), run.py, seed.py, data/costing.db
  frontend/           React app (src/), built into dist/
```

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

The second command runs Vite on `VITE_DEV_PORT` (5173) and forwards `/api` to `APP_PORT`. Run `npm run build` again afterwards so port 8000 serves the new version.

## SAP Data Mapping

Sidebar → **Processing → SAP Data Mapping**. Upload the SAP export: the tab named "SAP DATA" is used if present, otherwise the first sheet. Click **Process**, then **Download result .xlsx**. Every run is kept under `RUNS_DIR` and listed in *Previous runs*.

Columns added (orange in the output file):

| New column | How it is filled |
|---|---|
| Month | from **Year/month**, which holds the fiscal period: period 1 = April … 12 = March |
| Offst.acct Desc | Offsetting Description master, by **Offst.acct** |
| Account Description | Account Description master, by **Account** |
| CC Description | Cost Center Description master, by **Cost Ctr** |
| Order Desc | Order Description master, by **Order** |
| Material desc | Material Description master, by **Material** |
| Department | D1 rules below, in order |
| Department Source | which D1 rule filled the row (for checking) |

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
