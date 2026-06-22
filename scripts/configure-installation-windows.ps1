[CmdletBinding()]
param(
  [switch] $Report,
  [switch] $WhatIf,
  [switch] $Apply,
  [switch] $Restore
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$selectedModes = @($Report, $WhatIf, $Apply, $Restore).Where({ $_ }).Count
if ($selectedModes -ne 1) {
  throw "Select exactly one mode: -Report, -WhatIf, -Apply, or -Restore."
}

$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root ".tmp\windows-installation-backup"
$backupPath = Join-Path $backupDir "backup-version-1.json"
$kioskProfile = Join-Path $root ".tmp\kiosk-browser"

$powerSettings = @(
  [pscustomobject]@{ Name = "display timeout"; Subgroup = "7516b95f-f776-4464-8c53-06167f40cc99"; Setting = "3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e"; Command = @("/change", "monitor-timeout-ac", "0") },
  [pscustomobject]@{ Name = "sleep timeout"; Subgroup = "238c9fa8-0aad-41ed-83f4-97be242c8f20"; Setting = "29f6c1db-86da-48c5-9fdb-f2b67b1f44da"; Command = @("/change", "standby-timeout-ac", "0") },
  [pscustomobject]@{ Name = "hibernate timeout"; Subgroup = "238c9fa8-0aad-41ed-83f4-97be242c8f20"; Setting = "9d7815a6-7ee4-497e-8888-515a05f02364"; Command = @("/change", "hibernate-timeout-ac", "0") },
  [pscustomobject]@{ Name = "lid close action"; Subgroup = "4f971e89-eebd-4455-a8de-9e59040e7347"; Setting = "5ca83367-6e45-459f-a27b-476b1d01c936"; Command = @("/setacvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", "0") }
)

function Get-ChromePath {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
  )
  return $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}

function Get-RegistryValueSnapshot {
  param([string] $Path, [string] $Name)

  if (-not (Test-Path $Path)) {
    return [pscustomobject]@{ Path = $Path; Name = $Name; Exists = $false; Kind = $null; Value = $null }
  }
  $key = Get-Item -LiteralPath $Path
  try {
    $value = $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    if ($null -eq $value) {
      return [pscustomobject]@{ Path = $Path; Name = $Name; Exists = $false; Kind = $null; Value = $null }
    }
    return [pscustomobject]@{
      Path = $Path
      Name = $Name
      Exists = $true
      Kind = $key.GetValueKind($Name).ToString()
      Value = $value
    }
  } finally {
    $key.Close()
  }
}

function Set-RegistryValue {
  param([string] $Path, [string] $Name, [object] $Value, [string] $Kind)

  if (-not (Test-Path $Path)) { New-Item -Path $Path -Force | Out-Null }
  New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Kind -Force | Out-Null
}

function Restore-RegistryValue {
  param([pscustomobject] $Snapshot)

  if ($Snapshot.Exists) {
    Set-RegistryValue -Path $Snapshot.Path -Name $Snapshot.Name -Value $Snapshot.Value -Kind $Snapshot.Kind
  } elseif (Test-Path $Snapshot.Path) {
    Remove-ItemProperty -Path $Snapshot.Path -Name $Snapshot.Name -ErrorAction SilentlyContinue
  }
}

function Get-ActivePowerSchemeGuid {
  $output = (& powercfg.exe /getactivescheme 2>&1 | Out-String)
  $match = [regex]::Match($output, "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
  if (-not $match.Success) { throw "Could not determine the active Windows power scheme." }
  return $match.Value
}

function Get-PowerSettingSnapshot {
  param([string] $SchemeGuid, [pscustomobject] $Setting)

  $path = "HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes\$SchemeGuid\$($Setting.Subgroup)\$($Setting.Setting)"
  $value = (Get-ItemProperty -LiteralPath $path -Name "ACSettingIndex").ACSettingIndex
  return [pscustomobject]@{ Name = $Setting.Name; Subgroup = $Setting.Subgroup; Setting = $Setting.Setting; ACSettingIndex = [int64]$value }
}

function Invoke-PowerCfg {
  param([string[]] $Arguments, [string] $Description)

  & powercfg.exe @Arguments | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE." }
  Write-Host "- $Description"
}

function Test-IsAdministrator {
  $principal = [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
  return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

function Get-RegistryTargets {
  $targets = @(
    [pscustomobject]@{ Path = "HKCU:\Control Panel\Desktop"; Name = "ScreenSaveActive"; Value = "0"; Kind = "String" },
    [pscustomobject]@{ Path = "HKCU:\Control Panel\Desktop"; Name = "ScreenSaverIsSecure"; Value = "0"; Kind = "String" },
    [pscustomobject]@{ Path = "HKCU:\Control Panel\Desktop"; Name = "ScreenSaveTimeOut"; Value = "0"; Kind = "String" },
    [pscustomobject]@{ Path = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"; Name = "EnableGoodbye"; Value = 0; Kind = "DWord" },
    [pscustomobject]@{ Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\PushNotifications"; Name = "ToastEnabled"; Value = 0; Kind = "DWord" },
    [pscustomobject]@{ Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager"; Name = "SoftLandingEnabled"; Value = 0; Kind = "DWord" },
    [pscustomobject]@{ Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager"; Name = "SystemPaneSuggestionsEnabled"; Value = 0; Kind = "DWord" },
    [pscustomobject]@{ Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager"; Name = "SubscribedContent-338389Enabled"; Value = 0; Kind = "DWord" },
    [pscustomobject]@{ Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager"; Name = "SubscribedContent-338393Enabled"; Value = 0; Kind = "DWord" }
  )
  $chrome = Get-ChromePath
  if ($chrome) {
    $targets += [pscustomobject]@{ Path = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"; Name = $chrome; Value = "GpuPreference=2;"; Kind = "String" }
  }
  return $targets
}

function Write-ReadinessReport {
  Write-Host "Would Not Recommend - installation readiness report" -ForegroundColor Cyan
  Write-Host "Computer: $env:COMPUTERNAME"
  Write-Host "Administrator: $(Test-IsAdministrator)"
  Write-Host "Chrome: $(if (Get-ChromePath) { Get-ChromePath } else { 'not found' })"
  Write-Host "Kiosk profile: $kioskProfile"
  try { Write-Host "Active power scheme: $(Get-ActivePowerSchemeGuid)" } catch { Write-Warning $_ }
  Write-Host ""
  Write-Host "Manual exhibition checks:" -ForegroundColor Yellow
  Write-Host "- TCL 75P81K: primary, 3840x2160, 60 Hz, start at 200% scaling."
  Write-Host "- Samsung UE32N5000AW: left secondary, 1920x1080, 60 Hz, 100% scaling."
  Write-Host "- Use Extend, disable the closed laptop panel, and turn HDR/Night Light/VRR off initially."
  Write-Host "- Complete Windows Update, restart, then pause updates for the exhibition period."
  Write-Host "- Enable Lenovo Vantage battery conservation and use Balanced power mode."
  Write-Host "- Disable TV sleep/eco timers, HDMI-CEC power control, and overscan."
  Write-Host "- Confirm the intended audio output after both HDMI displays are connected."
  Write-Host "- Keep the laptop, charger, intake, and exhaust away from the radiator and fully ventilated."
}

if ($Report) {
  Write-ReadinessReport
  exit 0
}

if ($WhatIf) {
  Write-ReadinessReport
  Write-Host ""
  Write-Host "Changes that -Apply would make:" -ForegroundColor Cyan
  foreach ($setting in $powerSettings) { Write-Host "- AC $($setting.Name): installation-safe value" }
  foreach ($target in Get-RegistryTargets) { Write-Host "- $($target.Path) [$($target.Name)] -> $($target.Value)" }
  Write-Host "- Disable hibernation and Fast Startup."
  Write-Host "- Create $kioskProfile."
  Write-Host "No changes were made."
  exit 0
}

if (-not (Test-IsAdministrator)) {
  throw "Run PowerShell as Administrator for -Apply or -Restore."
}

if ($Apply) {
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  if (-not (Test-Path $backupPath)) {
    $schemeGuid = Get-ActivePowerSchemeGuid
    $registryTargets = Get-RegistryTargets
    $backup = [ordered]@{
      BackupVersion = 1
      CreatedAt = (Get-Date).ToString("o")
      PowerSchemeGuid = $schemeGuid
      PowerSettings = @($powerSettings | ForEach-Object { Get-PowerSettingSnapshot -SchemeGuid $schemeGuid -Setting $_ })
      HibernateEnabled = Get-RegistryValueSnapshot -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Power" -Name "HibernateEnabled"
      HiberbootEnabled = Get-RegistryValueSnapshot -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power" -Name "HiberbootEnabled"
      RegistryValues = @($registryTargets | ForEach-Object { Get-RegistryValueSnapshot -Path $_.Path -Name $_.Name })
    }
    $backup | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $backupPath -Encoding UTF8
    Write-Host "Saved original settings to $backupPath" -ForegroundColor Green
  } else {
    Write-Host "Keeping existing original backup at $backupPath"
  }

  foreach ($setting in $powerSettings) { Invoke-PowerCfg -Arguments $setting.Command -Description "Set AC $($setting.Name)" }
  Invoke-PowerCfg -Arguments @("/hibernate", "off") -Description "Disable hibernation and Fast Startup"
  Invoke-PowerCfg -Arguments @("/setactive", "SCHEME_CURRENT") -Description "Apply current power scheme"
  foreach ($target in Get-RegistryTargets) {
    Set-RegistryValue -Path $target.Path -Name $target.Name -Value $target.Value -Kind $target.Kind
    Write-Host "- Set $($target.Name)"
  }
  New-Item -ItemType Directory -Path $kioskProfile -Force | Out-Null
  Write-Host "Installation settings applied. Sign out or restart Chrome for all user settings to refresh." -ForegroundColor Green
  Write-ReadinessReport
  exit 0
}

if (-not (Test-Path $backupPath)) { throw "No backup exists at $backupPath. Nothing can be restored safely." }
$saved = Get-Content -LiteralPath $backupPath -Raw | ConvertFrom-Json
if ($saved.BackupVersion -ne 1) { throw "Unsupported backup version: $($saved.BackupVersion)." }

$restoreFailures = 0
foreach ($setting in $saved.PowerSettings) {
  try {
    Invoke-PowerCfg -Arguments @("/setacvalueindex", $saved.PowerSchemeGuid, $setting.Subgroup, $setting.Setting, [string]$setting.ACSettingIndex) -Description "Restore AC $($setting.Name)"
  } catch { $restoreFailures += 1; Write-Warning $_ }
}
foreach ($snapshot in (@($saved.RegistryValues) + @($saved.HibernateEnabled) + @($saved.HiberbootEnabled))) {
  try { Restore-RegistryValue -Snapshot $snapshot } catch { $restoreFailures += 1; Write-Warning $_ }
}
try {
  $hibernateOn = $saved.HibernateEnabled.Exists -and ([int]$saved.HibernateEnabled.Value -ne 0)
  Invoke-PowerCfg -Arguments @("/hibernate", $(if ($hibernateOn) { "on" } else { "off" })) -Description "Restore hibernation feature"
  Invoke-PowerCfg -Arguments @("/setactive", $saved.PowerSchemeGuid) -Description "Restore original active power scheme"
} catch { $restoreFailures += 1; Write-Warning $_ }

if ($restoreFailures -gt 0) { throw "Restore completed with $restoreFailures failure(s). Review the warnings above." }
Write-Host "Original recorded settings restored from $backupPath." -ForegroundColor Green
