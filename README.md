# Costing Master Data

Web app for the master data behind the Departmentwise Expense Report.

- **Backend:** Python + FastAPI, managed with [uv](https://docs.astral.sh/uv/); SQLite (`backend/data/costing.db`), openpyxl for Excel
- **Frontend:** React (Vite), plain CSS

## Masters

| Group | Master | Kind |
|---|---|---|
| Description Masters | Material, Offsetting, Order (IO), Cost Center, Account Description, P&L Group (by Account, loaded from the "Departmentwise Expense report" tab) | one row per code |
| D1 Department Mapping | Fixed Expenses based Account, Salary based on Order, Wages based on Cost Center, Consulting based on Offsetting Account, Consumable, Field Employees, ESI & PF, Emp ID | mapping table: the same code can appear more than once, exact duplicate rows are dropped |
| F1 Mapping | F1 GL Nature (Account, Account Description, Nature, GL nature), F1 Overhead (GL + Department, Overhead) | keyed: one row per Account / per "GL + Department" key; loaded from the tabs "F1 GL NATURE" and "F1 OVERHEAD" |

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

## Configuration (.env)

All settings live in `.env` in the project root. `.env` is not committed: copy `.env.example` to `.env` and edit it (`start.bat` does this automatically the first time). Relative paths are resolved from the project root. A real environment variable with the same name overrides `.env`.

| Key | Default | Purpose |
|---|---|---|
| `APP_HOST` | `127.0.0.1` | address the API listens on; `0.0.0.0` makes it reachable from other PCs |
| `APP_PORT` | `8000` | API port, also used by the Vite dev proxy |
| `APP_RELOAD` | `false` | `true` restarts the server when backend code changes (development) |
| `DB_PATH` | `backend/data/costing.db` | SQLite database file |
| `SEED_WORKBOOK` | `Departmnetwise Expense Report 2026-27 (2).xlsx` | workbook loaded by `seed.py` when no path is given |
| `FRONTEND_DIST` | `backend/static` | built React app served at `/` |
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


## AI department check

The SAP Data Mapping result gets three extra columns right after `Department`: **AI Suggested Department**,
**AI Flag** and **AI Reason**. The Department column (D1 rules) is never changed.

* The model (logistic regression, `backend/app/services/ai_dept.py`) sees the vendor (Offst.acct), account, account
  description and order description. It never sees the cost center, so it can catch a wrong cost center.
* **AI Flag**: `REVIEW` the AI disagrees and is confident (>= `AI_REVIEW_CONF`, default 0.90); `WATCH` a weaker
  disagreement (>= `AI_WATCH_CONF`, default 0.60) or this Cost Ctr + Account was never booked to the department;
  `NO_DEPT` the line has no department (the suggestion is still shown); `OK` the AI agrees.
* The result file shades REVIEW red, WATCH yellow and NO_DEPT grey and has filter buttons. The app shows an
  **AI review** card, an **AI check** tab and **AI Review / AI Watch** buttons in the preview.
* Many differences are systematic department rules, not mistakes: agree with finance which ones are real.

### Train the model

```
uv run backend/train_ai.py "AI Sample Data.xlsx" "Departmnetwise Expense Report 2026-27.xlsx"
```

Give the old history together with the current year's Departmentwise Expense report (the tab named like
"expense report" is read): the department convention changes over time, and a model trained only on old data agreed
with the final 2026-27 departments on just 43% of lines, against about 82% when the current year is included.
The model is saved to `AI_MODEL_FILE` (`backend/data/ai/dept_model.joblib`). Retrain every 3 months or at a year
end. Without a model the SAP result is created as before, with a note that the AI columns were not added.

`uv run backend/check_ai.py "<sap file>.xlsx"` processes a file and prints what the AI columns contain.
Settings (`AI_ENABLED`, `AI_REVIEW_CONF`, `AI_WATCH_CONF`, `AI_MODEL_FILE`) are in `.env`.
Spellings to merge (for example "Markeing" -> "Marketing") are in `DEPT_ALIASES` in `ai_dept.py`.


### Full workbook download

Besides **Download result .xlsx** (REDEFINED DATA and Summary), every new run can be downloaded as a **full workbook**
(`..._FULL.xlsx`) with all tabs in one Excel file: REDEFINED DATA, SAP DATA (the sheet exactly as uploaded), every
master that has data (descriptions, D1, F1) as it was when the file was processed, and the Summary. The button
**Download full workbook** is on the result page and in History. Runs made before this feature have no full workbook
(the button is hidden): process the SAP file again.
The Summary sheet and the **F1 check** tab list the Account / Department combinations that are missing from F1 Overhead.
