@echo off
setlocal
cd /d "%~dp0"
title Gundam Card JSON Generator

echo =====================================
echo    Gundam Card JSON Generator
 echo =====================================
echo.
if not exist "create_json_from_images_v7.py" (
    echo ERROR: create_json_from_images_v7.py was not found in this folder.
    goto :end
)
where py >nul 2>&1
if not errorlevel 1 (
    py -3 "create_json_from_images_v7.py"
) else (
    where python >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python 3 was not found. Please install Python 3.
        goto :end
    )
    python "create_json_from_images_v7.py"
)
echo.
if errorlevel 1 echo Script finished with an error. Check the messages above.
:end
echo.
pause
endlocal
