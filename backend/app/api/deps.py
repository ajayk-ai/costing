"""Helpers shared by the routers."""
from fastapi import HTTPException, UploadFile

from ..config import MAX_UPLOAD_MB
from ..domain.masters import MASTERS, Master

MAX_UPLOAD = MAX_UPLOAD_MB * 1024 * 1024
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def master_or_404(t: str) -> Master:
    m = MASTERS.get(t)
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
