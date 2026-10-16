
@echo off
cd /d "%~dp0"

echo ============================
echo PNG Image Converter
echo ============================
echo.

if "%~1"=="" (
    py convert_to_png.py
) else (
    py convert_to_png.py "%~1"
)

echo.
pause
