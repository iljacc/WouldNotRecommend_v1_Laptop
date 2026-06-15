Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string] $Message)
  Write-Host ""
  Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Invoke-LoggedCommand {
  param(
    [string] $FilePath,
    [string[]] $Arguments,
    [string] $Description,
    [switch] $AllowFailure
  )

  Write-Host "- $Description"
  & $FilePath @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    $message = "$Description failed with exit code $exitCode."
    if ($AllowFailure) {
      Write-Warning $message
    } else {
      throw $message
    }
  }
}

function Set-RegistryDword {
  param(
    [string] $Path,
    [string] $Name,
    [int] $Value,
    [string] $Description
  )

  if (-not (Test-Path $Path)) {
    New-Item -Path $Path -Force | Out-Null
  }

  New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType DWord -Force | Out-Null
  Write-Host "- $Description"
}

function Set-RegistryString {
  param(
    [string] $Path,
    [string] $Name,
    [string] $Value,
    [string] $Description
  )

  if (-not (Test-Path $Path)) {
    New-Item -Path $Path -Force | Out-Null
  }

  New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType String -Force | Out-Null
  Write-Host "- $Description"
}

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $isAdmin) {
  throw "Run setup-windows-kiosk.bat so Windows can request administrator privileges."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$desktop = [Environment]::GetFolderPath("Desktop")
$reportPath = Join-Path $desktop "would-not-recommend-kiosk-setup-$timestamp.txt"
$chromePolicyPath = "HKLM:\SOFTWARE\Policies\Google\Chrome"
$screenSaverPath = "HKCU:\Control Panel\Desktop"

Start-Transcript -Path $reportPath -Force | Out-Null

try {
  Write-Host "Would Not Recommend - Windows kiosk setup"
  Write-Host "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  Write-Host "Report: $reportPath"

  Write-Step "Current power scheme"
  Invoke-LoggedCommand "powercfg.exe" @("/getactivescheme") "Recording active power scheme"
  Invoke-LoggedCommand "powercfg.exe" @("/query", "SCHEME_CURRENT") "Recording current power settings before changes"

  Write-Step "Prevent Windows sleep while plugged in"
  Invoke-LoggedCommand "powercfg.exe" @("/change", "standby-timeout-ac", "0") "Sleep on AC: Never"
  Invoke-LoggedCommand "powercfg.exe" @("/change", "hibernate-timeout-ac", "0") "Hibernate timeout on AC: Never"
  Invoke-LoggedCommand "powercfg.exe" @("/hibernate", "off") "Hibernate feature: Off"

  Write-Step "Keep displays alive while plugged in"
  Invoke-LoggedCommand "powercfg.exe" @("/change", "monitor-timeout-ac", "0") "Turn off display on AC: Never"
  Invoke-LoggedCommand "powercfg.exe" @("/setacvalueindex", "SCHEME_CURRENT", "SUB_VIDEO", "VIDEOCONLOCK", "0") "Lock-screen display timeout on AC: Never" -AllowFailure
  Invoke-LoggedCommand "powercfg.exe" @("/setactive", "SCHEME_CURRENT") "Apply active power scheme"

  Write-Step "Make lid closing safe for the ThinkPad installation"
  Invoke-LoggedCommand "powercfg.exe" @("/setacvalueindex", "SCHEME_CURRENT", "SUB_BUTTONS", "LIDACTION", "0") "Lid close action on AC: Do nothing"
  Invoke-LoggedCommand "powercfg.exe" @("/setactive", "SCHEME_CURRENT") "Apply lid setting"

  Write-Step "Reduce USB/display power saving surprises"
  Invoke-LoggedCommand "powercfg.exe" @("/setacvalueindex", "SCHEME_CURRENT", "SUB_USB", "USBSELECTIVE", "0") "USB selective suspend on AC: Disabled" -AllowFailure
  Invoke-LoggedCommand "powercfg.exe" @("/setacvalueindex", "SCHEME_CURRENT", "SUB_PCIEXPRESS", "ASPM", "0") "PCI Express link-state power management on AC: Off" -AllowFailure
  Invoke-LoggedCommand "powercfg.exe" @("/setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "SYSCOOLPOL", "1") "System cooling policy on AC: Active" -AllowFailure
  Invoke-LoggedCommand "powercfg.exe" @("/setactive", "SCHEME_CURRENT") "Apply power-saving changes"

  Write-Step "Disable screensaver lock for the current Windows user"
  Set-RegistryString $screenSaverPath "ScreenSaveActive" "0" "Screen saver: Disabled"
  Set-RegistryString $screenSaverPath "ScreenSaverIsSecure" "0" "Require password on screensaver: Disabled"
  Set-RegistryString $screenSaverPath "ScreenSaveTimeOut" "0" "Screensaver timeout: Never"

  Write-Step "Set Chrome kiosk-friendly performance policies"
  Set-RegistryDword $chromePolicyPath "BatterySaverModeAvailability" 0 "Chrome Energy Saver / Battery Saver policy: Disabled"
  Set-RegistryDword $chromePolicyPath "HighEfficiencyModeEnabled" 0 "Chrome Memory Saver policy: Disabled"
  Set-RegistryDword $chromePolicyPath "HardwareAccelerationModeEnabled" 1 "Chrome hardware acceleration policy: Enabled"
  Set-RegistryDword $chromePolicyPath "WindowOcclusionEnabled" 0 "Chrome window occlusion throttling policy: Disabled"

  Write-Step "Put Windows in extended-display mode"
  if (Test-Path "$env:WINDIR\System32\DisplaySwitch.exe") {
    Invoke-LoggedCommand "$env:WINDIR\System32\DisplaySwitch.exe" @("/extend") "Display mode: Extend" -AllowFailure
  } else {
    Write-Host "- DisplaySwitch.exe not found; set displays to Extend manually."
  }

  Write-Step "After reboot / Chrome restart checks"
  Write-Host "- Open chrome://policy and click Reload policies."
  Write-Host "- Confirm BatterySaverModeAvailability = 0."
  Write-Host "- Confirm HighEfficiencyModeEnabled = false or 0."
  Write-Host "- Confirm HardwareAccelerationModeEnabled = true or 1."
  Write-Host "- Confirm WindowOcclusionEnabled = false or 0."
  Write-Host "- Put /bot fullscreen on the 75-inch TV."
  Write-Host "- Put /terminal fullscreen on the 32-inch Samsung TV."
  Write-Host "- Keep the ThinkPad plugged into its charger for the full run."

  Write-Step "Finished"
  Write-Host "Kiosk setup completed. Restart Chrome so the policy changes take effect."
} finally {
  Stop-Transcript | Out-Null
  Write-Host ""
  Write-Host "Saved setup report to: $reportPath" -ForegroundColor Green
}
