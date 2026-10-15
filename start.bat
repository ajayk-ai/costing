@echo off
rem Starts the Costing Master Data app (requires uv: https://docs.astral.sh/uv/)
rem Host, port and paths are read from .env
cd /d "%~dp0"
if not exist .env copy .env.example .env >nul
uv run backend/run.py --open
