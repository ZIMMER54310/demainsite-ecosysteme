# ============================================================
# DEMAINSITE ECOSYSTEME - INSTALLATION TACHE MENSUELLE
# V1.3
# ============================================================

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$Root\CONFIG.ps1"
$cfg = $global:DSE_GEO_Config

$scriptPath = Join-Path $Root "RUN-CONTROLE-GEO.ps1"
$taskName = $cfg.ScheduledTaskName

Write-Host "Installation de la tache mensuelle : $taskName" -ForegroundColor Cyan
Write-Host "Script appele : $scriptPath" -ForegroundColor Cyan

$action = New-ScheduledTaskAction -Execute "pwsh.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -Mode AuditOnly"
$trigger = New-ScheduledTaskTrigger -Monthly -DaysOfMonth 1 -At 8:00am
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Ancienne tache remplacee." -ForegroundColor Yellow
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Host "Tache mensuelle installee." -ForegroundColor Green
Write-Host "Elle lance un controle le 1er jour de chaque mois a 08:00." -ForegroundColor Green
Write-Host "Regle : controle et journalisation, aucune suppression automatique." -ForegroundColor Green
