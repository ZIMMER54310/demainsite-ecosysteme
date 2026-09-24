@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title DemainSite - Moteur Liaisons Geo - Reel

echo ============================================================
echo  DEMAINSITE ECOSYSTEME - MOTEUR LIAISONS GEO - REEL
echo ============================================================
echo.
echo ATTENTION : ce mode cree/met a jour les colonnes et les liaisons.
echo Aucune suppression automatique n'est faite.
echo.
set /p CONFIRM=Ecris OUI pour lancer le mode reel : 
if /I not "%CONFIRM%"=="OUI" (
    echo Annule.
    pause
    exit /b 0
)

where pwsh >nul 2>nul
if %errorlevel%==0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\DSE-GEO-MOTEUR-LIAISONS-V1-0.ps1" -Mode Update
) else (
    pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\DSE-GEO-MOTEUR-LIAISONS-V1-0.ps1" -Mode Update
)

echo.
pause

