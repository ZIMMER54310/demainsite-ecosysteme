@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title DemainSite - Vues Communes A-Z

echo ============================================================
echo  DEMAINSITE ECOSYSTEME - VUES COMMUNES A-Z
echo ============================================================
echo.
echo Ce lanceur cree des vues SharePoint pour classer les communes par lettre A a Z.
echo Aucune donnee n'est supprimee.
echo.
set /p CONFIRM=Ecris OUI pour creer les vues A-Z : 
if /I not "%CONFIRM%"=="OUI" (
    echo Annule.
    pause
    exit /b 0
)

where pwsh >nul 2>nul
if %errorlevel%==0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-CREER-VUES-COMMUNES-A-Z.ps1" -Mode Update
) else (
    pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-CREER-VUES-COMMUNES-A-Z.ps1" -Mode Update
)

echo.
echo Termine. Tu peux fermer cette fenetre apres verification.
pause

