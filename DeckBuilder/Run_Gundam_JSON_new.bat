@echo off
cd /d "%~dp0"
echo Gundam Card JSON Generator
set /p SETS=Enter set (GD06, ST14) or ALL: 
if "%SETS%"=="" set SETS=GD06
py -3 create_gundam_json.py --sets %SETS% --all-cards
if errorlevel 1 python create_gundam_json.py --sets %SETS% --all-cards
pause
