@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title DemainSite Ecosysteme - PowerShell 7

echo ============================================================
echo  DemainSite Ecosysteme - Lancement force PowerShell 7
echo ============================================================
echo.

where pwsh.exe >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] PowerShell 7 introuvable. Installe Microsoft PowerShell 7 puis relance.
    pause
    exit /b 1
)

pwsh.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\CONFIG.ps1"
set EXITCODE=%ERRORLEVEL%
echo.
pause
exit /b %EXITCODE%
