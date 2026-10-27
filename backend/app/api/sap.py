"""SAP data mapping endpoints: process an export, list/download/delete runs."""
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from ..db import run_repo
from ..services import sap_runs
from .deps import XLSX_MIME, read_upload

router = APIRouter(prefix="/api/sap", tags=["sap"])


def _with_full(run: dict) -> dict:
    """Mark whether the full workbook exists, so the screen only offers it for runs that have one."""
    run["hasFull"] = sap_runs.full_path(run) is not None
    return run


@router.post("/process")
async def process_sap(file: UploadFile = File(...)):
    data = await read_upload(file)
    try:
        run_id = await run_in_threadpool(sap_runs.process_and_store, data, file.filename or "")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _with_full(run_repo.get_run(run_id))


@router.get("/runs")
def list_runs():
    return [_with_full(r) for r in run_repo.list_runs()]


@router.get("/runs/{run_id}")
def get_run(run_id: int):
    r = run_repo.get_run(run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    return _with_full(r)


@router.delete("/runs")
def clear_runs():
    names = run_repo.delete_runs()
    sap_runs.remove_outputs(names)
    return {"deleted": len(names)}


@router.delete("/runs/{run_id}")
def delete_run(run_id: int):
    names = run_repo.delete_runs(run_id)
    if not names:
        raise HTTPException(404, "Run not found")
    sap_runs.remove_outputs(names)
    return {"deleted": 1}


@router.get("/runs/{run_id}/download")
def download_run(run_id: int):
    r = run_repo.get_run(run_id)
    f = sap_runs.output_path(r)
    if not f:
        raise HTTPException(404, "Processed file not found")
    return FileResponse(f, media_type=XLSX_MIME, filename=r["output"])


@router.get("/runs/{run_id}/download-full")
def download_full(run_id: int):
    r = run_repo.get_run(run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    f = sap_runs.full_path(r)
    if not f:
        raise HTTPException(404, "This run has no full workbook. Process the SAP file again to create one.")
    return FileResponse(f, media_type=XLSX_MIME, filename=f.name)
