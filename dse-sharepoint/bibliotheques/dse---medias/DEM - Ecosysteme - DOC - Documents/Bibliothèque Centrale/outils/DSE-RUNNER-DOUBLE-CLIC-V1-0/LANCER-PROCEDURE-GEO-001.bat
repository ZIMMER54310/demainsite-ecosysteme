@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title DemainSite - Procedure GEO-001

echo ============================================================
echo  DEMAINSITE ECOSYSTEME - PROCEDURE GEO-001
echo ============================================================
echo.
echo Ce lanceur ouvre PowerShell automatiquement.
echo Si une fenetre de connexion Microsoft s'affiche, suis le code DeviceLogin.
echo.

where pwsh >nul 2>nul
if %errorlevel%==0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\RUN-INSTALL-PROCEDURE-GEO-001.ps1"
) else (
    pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\RUN-INSTALL-PROCEDURE-GEO-001.ps1"
)

echo.
echo ============================================================
echo  Termine. Tu peux fermer cette fenetre apres verification.
echo ============================================================
pause

