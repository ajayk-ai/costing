"""Master data endpoints: list, edit, Excel upload/export, upload history."""
from datetime import date

from fastapi import APIRouter, Body, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from ..db import master_repo
from ..domain.masters import MASTERS, Master
from ..services.excel import build_xlsx, parse_for_type, parse_workbook
from .deps import XLSX_MIME, master_or_404, read_upload

router = APIRouter(prefix="/api", tags=["masters"])


def _columns_json(m: Master):
    return [{"key": c.key, "label": c.label} for c in master_repo.columns_for(m)]


def _xlsx(name: str, content: bytes):
    return Response(content, media_type=XLSX_MIME, headers={"Content-Disposition": f'attachment; filename="{name}"'})


def _file_label(m: Master) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in m.label).strip("_")


@router.get("/masters")
def list_masters():
    st = master_repo.stats()
    return [{
        "type": m.type, "label": m.label, "group": m.group, "keyed": m.keyed,
        "dynamicColumns": m.columns is None, "columns": _columns_json(m),
        "count": st.get(t, {}).get("count", 0), "lastUpdated": st.get(t, {}).get("last_updated"),
    } for t, m in MASTERS.items()]


@router.post("/upload-workbook")
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
        r = await run_in_threadpool(master_repo.import_rows, MASTERS[t], cols, rows, mode, file.filename, sheet)
        results[t] = {"label": MASTERS[t].label, "sheetName": sheet, **r}
    return {"mode": mode, "results": results, "emptySheets": empty}


@router.get("/masters/{t}")
def list_rows(t: str, q: str = "", page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=500)):
    return master_repo.list_rows(master_or_404(t), q, page, size)


@router.post("/masters/{t}", status_code=201)
def add_row(t: str, data: dict = Body(...)):
    m = master_or_404(t)
    try:
        return {"id": master_repo.add_row(m, data)}
    except master_repo.Conflict as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/masters/{t}/rows/{row_id}")
def update_row(t: str, row_id: int, data: dict = Body(...)):
    try:
        master_repo.update_row(master_or_404(t), row_id, data)
    except master_repo.NotFound:
        raise HTTPException(404, "Row not found")
    except master_repo.Conflict as e:
        raise HTTPException(409, str(e))
    return {"ok": True}


@router.delete("/masters/{t}/rows/{row_id}")
def delete_row(t: str, row_id: int):
    try:
        master_repo.delete_row(master_or_404(t), row_id)
    except master_repo.NotFound:
        raise HTTPException(404, "Row not found")
    return {"ok": True}


@router.post("/masters/{t}/upload")
async def upload(t: str, file: UploadFile = File(...), mode: str = Query("merge", pattern="^(merge|replace)$")):
    m = master_or_404(t)
    data = await read_upload(file)
    try:
        sheet, cols, rows = await run_in_threadpool(parse_for_type, data, m)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not rows:
        raise HTTPException(400, f'No data rows found in sheet "{sheet}"')
    r = await run_in_threadpool(master_repo.import_rows, m, cols, rows, mode, file.filename, sheet)
    return {"mode": mode, "sheetName": sheet, **r}


@router.get("/masters/{t}/export")
def export(t: str):
    m = master_or_404(t)
    return _xlsx(f"{_file_label(m)}_{date.today()}.xlsx",
                 build_xlsx(m, master_repo.columns_for(m), master_repo.all_rows(m)))


@router.get("/masters/{t}/template")
def template(t: str):
    m = master_or_404(t)
    return _xlsx(f"{_file_label(m)}_Template.xlsx", build_xlsx(m, master_repo.columns_for(m), []))


@router.get("/masters/{t}/logs")
def logs(t: str):
    return master_repo.logs(master_or_404(t))


@router.delete("/masters/{t}/logs")
def clear_logs(t: str):
    return {"deleted": master_repo.delete_logs(master_or_404(t))}


@router.delete("/masters/{t}/logs/{log_id}")
def delete_log(t: str, log_id: int):
    if not master_repo.delete_logs(master_or_404(t), log_id):
        raise HTTPException(404, "History entry not found")
    return {"deleted": 1}
