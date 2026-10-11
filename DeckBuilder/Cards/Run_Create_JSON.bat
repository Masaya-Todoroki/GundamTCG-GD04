@echo off
setlocal
cd /d "%~dp0"
title Gundam Card JSON Generator

echo =====================================
echo       Gundam Card JSON Generator
echo =====================================
echo.

where python >nul 2>&1
if %errorlevel%==0 (
    python "create_json.py"
) else (
    where py >nul 2>&1
    if %errorlevel%==0 (
        py "create_json.py"
    ) else (
        echo Python was not found. Install Python and add it to PATH.
    )
)

echo.
echo -------------------------------------
pause
