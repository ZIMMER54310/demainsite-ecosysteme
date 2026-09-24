@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title DemainSite - Villes par departement V1.2
echo ============================================================
echo  DEMAINSITE ECOSYSTEME - VILLES PAR DEPARTEMENT V1.2
echo ============================================================
echo.
echo Mode conseille maintenant : creer d'abord toutes les sous-listes SharePoint.
echo.
echo Choix disponibles :
echo  OUI ou STRUCTURE = creer toutes les listes Villes-01, Villes-02, etc. sans import massif
echo  54               = creer/importer uniquement le departement 54
echo  57               = creer/importer uniquement le departement 57
echo  TOUS             = importer tous les departements fournis par l'API Geo
echo.
set /p CHOIX=Ecris OUI pour creer la structure, ou un code departement : 
if "%CHOIX%"=="" set CHOIX=STRUCTURE
where pwsh >nul 2>nul
if %errorlevel%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-INSTALL-VILLES-PAR-DEPARTEMENT.ps1" -Choix "%CHOIX%"
) else (
  pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-INSTALL-VILLES-PAR-DEPARTEMENT.ps1" -Choix "%CHOIX%"
)
echo.
echo ============================================================
echo  Termine. Consulter le dossier logs si besoin.
echo ============================================================
pause

