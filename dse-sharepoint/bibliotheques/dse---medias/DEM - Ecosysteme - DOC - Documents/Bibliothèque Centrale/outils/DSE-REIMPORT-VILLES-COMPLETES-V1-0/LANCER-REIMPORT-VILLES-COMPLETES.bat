@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title DemainSite - Reimport villes completes

echo ============================================================
echo  DEMAINSITE ECOSYSTEME - REIMPORT VILLES COMPLETES
echo ============================================================
echo.
echo Place d'abord le fichier CSV officiel dans le dossier data.
echo Le script prendra automatiquement le dernier CSV trouve.
echo.
set /p CONFIRM=Ecris OUI pour lancer le reimport : 
if /I not "%CONFIRM%"=="OUI" (
    echo Annule.
    pause
    exit /b 0
)

where pwsh >nul 2>nul
if %errorlevel%==0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-REIMPORT-VILLES-COMPLETES.ps1"
) else (
    pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-REIMPORT-VILLES-COMPLETES.ps1"
)

echo.
echo Termine. Tu peux fermer cette fenetre apres verification.
pause

