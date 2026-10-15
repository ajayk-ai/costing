"""Costing master data API (FastAPI).

Run from the project root:  uv run backend/run.py   (settings come from .env)
If FRONTEND_DIST exists (npm run build), the React app is served at / as well.
"""
from datetime import date, datetime

from fastapi import Body, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from . import db, sap
from .config import CORS_ORIGINS, FRONTEND_DIST, MAX_UPLOAD_MB, RUNS_DIR
from .excel import build_xlsx, parse_for_type, parse_workbook
from .masters import MASTERS, Master

app = FastAPI(title="Costing Master Data")
if CORS_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
MAX_UPLOAD = MAX_UPLOAD_MB * 1024 * 1024
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def master_or_404(t: str) -> Master:
    m = db.get_master(t)
    if not m:
        raise HTTPException(404, f'Unknown master "{t}"')
    return m


async def read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(400, "No file received")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, f"File too large (max {MAX_UPLOAD_MB} MB)")
    if data[:2] != b"PK":
        raise HTTPException(400, "Not an .xlsx file. If it is .xls, open it in Excel and save as .xlsx.")
    return data


def columns_json(m: Master):
    return [{"key": c.key, "label": c.label} for c in db.columns_for(m)]


@app.get("/api/masters")
def list_masters():
    st = db.stats()
    return [{
        "type": m.type, "label": m.label, "group": m.group, "keyed": m.keyed,
        "dynamicColumns": m.columns is None, "columns": columns_json(m),
        "count": st.get(t, {}).get("count", 0), "lastUpdated": st.get(t, {}).get("last_updated"),
    } for t, m in MASTERS.items()]


@app.post("/api/upload-workbook")
async def upload_workbook(file: UploadFile = File(...), mode: str = Query("merge", pattern="^(merge|replace)$")):
    data = await read_upload(file)
    try:
        parsed = await run_in_threadpool(parse_workbook, data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not parsed:
        raise HTTPException(400, "No master tabs found in this workbook.")
    results, empty = {}, []
    for t, (sheet, cols, rows) in parsed.items():
        if not rows:  # never wipe a master because its tab is empty
            empty.append(MASTERS[t].label)
            continue
        r = await run_in_threadpool(db.import_rows, MASTERS[t], cols, rows, mode, file.filename, sheet)
        results[t] = {"label": MASTERS[t].label, "sheetName": sheet, **r}
    return {"mode": mode, "results": results, "emptySheets": empty}


@app.get("/api/masters/{t}")
def list_rows(t: str, q: str = "", page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=500)):
    return db.list_rows(master_or_404(t), q, page, size)


@app.post("/api/masters/{t}", status_code=201)
def add_row(t: str, data: dict = Body(...)):
    m = master_or_404(t)
    try:
        return {"id": db.add_row(m, data)}
    except db.Conflict as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.put("/api/masters/{t}/rows/{row_id}")
def update_row(t: str, row_id: int, data: dict = Body(...)):
    try:
        db.update_row(master_or_404(t), row_id, data)
    except db.NotFound:
        raise HTTPException(404, "Row not found")
    except db.Conflict as e:
        raise HTTPException(409, str(e))
    return {"ok": True}


@app.delete("/api/masters/{t}/rows/{row_id}")
def delete_row(t: str, row_id: int):
    try:
        db.delete_row(master_or_404(t), row_id)
    except db.NotFound:
        raise HTTPException(404, "Row not found")
    return {"ok": True}


@app.post("/api/masters/{t}/upload")
async def upload(t: str, file: UploadFile = File(...), mode: str = Query("merge", pattern="^(merge|replace)$")):
    m = master_or_404(t)
    data = await read_upload(file)
    try:
        sheet, cols, rows = await run_in_threadpool(parse_for_type, data, m)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not rows:
        raise HTTPException(400, f'No data rows found in sheet "{sheet}"')
    r = await run_in_threadpool(db.import_rows, m, cols, rows, mode, file.filename, sheet)
    return {"mode": mode, "sheetName": sheet, **r}


def _xlsx(name: str, content: bytes):
    return Response(content, media_type=XLSX_MIME, headers={"Content-Disposition": f'attachment; filename="{name}"'})


def _file_label(m: Master) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in m.label).strip("_")


@app.get("/api/masters/{t}/export")
def export(t: str):
    m = master_or_404(t)
    return _xlsx(f"{_file_label(m)}_{date.today()}.xlsx", build_xlsx(m, db.columns_for(m), db.all_rows(m)))


@app.get("/api/masters/{t}/template")
def template(t: str):
    m = master_or_404(t)
    return _xlsx(f"{_file_label(m)}_Template.xlsx", build_xlsx(m, db.columns_for(m), []))


@app.get("/api/masters/{t}/logs")
def logs(t: str):
    return db.logs(master_or_404(t))


# ---------- SAP data processing ----------

def _process_sap(data: bytes, file_name: str) -> int:
    summary, header, rows = sap.process(data, file_name)
    content = sap.build_output(summary, header, rows)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    stem = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in (file_name.rsplit(".", 1)[0] or "SAP_DATA"))[:60]
    out_name = f"{datetime.now():%Y%m%d_%H%M%S}_{stem}_REDEFINED.xlsx"
    (RUNS_DIR / out_name).write_bytes(content)
    return db.add_run(file_name, summary, sap.preview(header, rows), out_name)


@app.post("/api/sap/process")
async def process_sap(file: UploadFile = File(...)):
    data = await read_upload(file)
    try:
        run_id = await run_in_threadpool(_process_sap, data, file.filename or "")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return db.get_run(run_id)


@app.get("/api/sap/runs")
def sap_runs():
    return db.list_runs()


@app.get("/api/sap/runs/{run_id}")
def sap_run(run_id: int):
    r = db.get_run(run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    return r


@app.get("/api/sap/runs/{run_id}/download")
def sap_download(run_id: int):
    r = db.get_run(run_id)
    f = RUNS_DIR / r["output"] if r else None
    if not f or not f.is_file():
        raise HTTPException(404, "Processed file not found")
    return FileResponse(f, media_type=XLSX_MIME, filename=r["output"])


# Serve the built React app (frontend/dist) when present.
DIST = FRONTEND_DIST
if (DIST / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = DIST / path
        return FileResponse(f if path and f.is_file() and DIST in f.resolve().parents else DIST / "index.html")
