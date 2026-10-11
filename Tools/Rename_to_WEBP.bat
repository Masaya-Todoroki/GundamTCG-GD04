@echo off
setlocal
cd /d "%~dp0"
echo Renaming JPG files to WEBP in: %CD%
echo.
for %%F in (*.jpg *.jpeg) do (
    if exist "%%~nF.webp" (
        echo SKIPPED: %%~nxF ^(WEBP already exists^)
    ) else (
        ren "%%F" "%%~nF.webp"
        echo RENAMED: %%~nxF
    )
)
echo.
echo Finished. Original file data was not converted.
pause
