"""SAP data mapping endpoints: process an export, list/download/delete runs."""
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from ..db import run_repo
from ..services import sap_runs
from .deps import XLSX_MIME, read_upload

router = APIRouter(prefix="/api/sap", tags=["sap"])


@router.post("/process")
async def process_sap(file: UploadFile = File(...)):
    data = await read_upload(file)
    try:
        run_id = await run_in_threadpool(sap_runs.process_and_store, data, file.filename or "")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return run_repo.get_run(run_id)


@router.get("/runs")
def list_runs():
    return run_repo.list_runs()


@router.get("/runs/{run_id}")
def get_run(run_id: int):
    r = run_repo.get_run(run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    return r


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
