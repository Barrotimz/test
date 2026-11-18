@echo off
setlocal
set "SWITCHBAT=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=$env:SWITCHBAT; $q=$p.Replace([char]39,[char]39+[char]39); $code='$ErrorActionPreference=''Stop''; try { $lines=Get-Content -LiteralPath '''+$q+'''; $start=[array]::IndexOf($lines,''###POWERSHELL###''); if($start -lt 0){ throw ''Internet Switch file is damaged.'' }; $script=$lines[($start+1)..($lines.Length-1)]; if($script -is [string]){ $script=@($script) }; Invoke-Expression ($script -join [Environment]::NewLine) } catch { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show([string]$_.Exception.Message,''Internet Switch'') | Out-Null }'; $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code)); $a=@('-NoProfile','-STA','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded); try { $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Start-Process powershell.exe -WindowStyle Hidden -ArgumentList $a } else { Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList $a } } catch { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Administrator permission is required to turn the internet off or on.','Internet Switch') | Out-Null }"
if errorlevel 1 pause
exit /b
###POWERSHELL###
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$ErrorActionPreference = 'Stop'
$StateDir = Join-Path $env:LOCALAPPDATA 'InternetSwitch'
if (-not $env:LOCALAPPDATA) { $StateDir = Join-Path $env:USERPROFILE 'AppData\Local\InternetSwitch' }
$StateFile = Join-Path $StateDir 'state.json'
$script:busy = $false

function Get-ControllableAdapters {
  $pattern = 'WAN Miniport|Kernel Debug|Loopback|Teredo|ISATAP|6to4|QoS Packet Scheduler'
  $all = @(Get-NetAdapter -ErrorAction Stop | Where-Object {
    $name = [string]$_.Name
    $desc = [string]$_.InterfaceDescription
    $name -and ($name -notmatch $pattern) -and ($desc -notmatch $pattern)
  })
  $physical = @($all | Where-Object { $_.HardwareInterface })
  if ($physical.Count -gt 0) { return $physical }
  return $all
}

function Get-SavedNames {
  if (-not (Test-Path -LiteralPath $StateFile)) { return @() }
  try {
    $data = Get-Content -LiteralPath $StateFile -Raw -ErrorAction Stop | ConvertFrom-Json
  } catch {
    return @()
  }
  return @(@($data.disabled) | Where-Object { $_ -and ([string]$_).Trim() } | ForEach-Object { ([string]$_).Trim() })
}

function Save-Names([string[]]$Names) {
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  @{ disabled = @($Names) } | ConvertTo-Json -Compress | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

function Test-InternetOn {
  $adapters = @(Get-ControllableAdapters)
  if ($adapters.Count -eq 0) { throw 'No network adapter was found on this PC.' }
  foreach ($adapter in $adapters) {
    $status = [string]$adapter.Status
    if ($status -ne 'Disabled' -and $status -ne 'Not Present') { return $true }
  }
  return $false
}

function Set-Adapters([string[]]$Names, [bool]$Enable) {
  foreach ($name in $Names) {
    if ($Enable) {
      Enable-NetAdapter -Name $name -Confirm:$false -ErrorAction Stop | Out-Null
    } else {
      Disable-NetAdapter -Name $name -Confirm:$false -ErrorAction Stop | Out-Null
    }
  }
}

function Invoke-PressOn {
  $names = @(Get-ControllableAdapters | Where-Object {
    $status = [string]$_.Status
    $status -ne 'Disabled' -and $status -ne 'Not Present'
  } | ForEach-Object { [string]$_.Name })
  if ($names.Count -eq 0) { return }
  $previous = @(Get-SavedNames)
  Save-Names $names
  try {
    Set-Adapters $names $false
  } catch {
    $failure = $_
    try { Set-Adapters $names $true } catch { throw $failure }
    Save-Names $previous
    throw $failure
  }
}

function Invoke-PressOff {
  $names = @(Get-SavedNames)
  if ($names.Count -eq 0) {
    if (Test-InternetOn) { return }
    $names = @(Get-ControllableAdapters | Where-Object { [string]$_.Status -eq 'Disabled' } | ForEach-Object { [string]$_.Name })
  }
  if ($names.Count -eq 0) { throw 'No network adapter was found to turn back on.' }
  Set-Adapters $names $true
  Save-Names @()
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Internet Switch'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size(460, 270)
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$status = New-Object System.Windows.Forms.Label
$status.AutoSize = $false
$status.TextAlign = 'MiddleCenter'
$status.Font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
$status.Text = 'Checking...'
$status.SetBounds(20, 16, 420, 42)

$detail = New-Object System.Windows.Forms.Label
$detail.AutoSize = $false
$detail.TextAlign = 'MiddleCenter'
$detail.SetBounds(20, 60, 420, 44)

$on = New-Object System.Windows.Forms.Button
$on.Text = 'ON'
$on.Font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
$on.SetBounds(40, 116, 170, 72)
$on.BackColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
$on.ForeColor = [System.Drawing.Color]::White
$on.FlatStyle = 'Flat'
$on.UseVisualStyleBackColor = $false

$off = New-Object System.Windows.Forms.Button
$off.Text = 'OFF'
$off.Font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
$off.SetBounds(250, 116, 170, 72)
$off.BackColor = [System.Drawing.Color]::FromArgb(21, 128, 61)
$off.ForeColor = [System.Drawing.Color]::White
$off.FlatStyle = 'Flat'
$off.UseVisualStyleBackColor = $false

$onCap = New-Object System.Windows.Forms.Label
$onCap.Text = 'shuts internet off'
$onCap.TextAlign = 'MiddleCenter'
$onCap.SetBounds(40, 194, 170, 24)

$offCap = New-Object System.Windows.Forms.Label
$offCap.Text = 'turns internet on'
$offCap.TextAlign = 'MiddleCenter'
$offCap.SetBounds(250, 194, 170, 24)

$foot = New-Object System.Windows.Forms.Label
$foot.Text = 'This changes only this computer.'
$foot.TextAlign = 'MiddleCenter'
$foot.ForeColor = [System.Drawing.Color]::FromArgb(113, 113, 122)
$foot.SetBounds(20, 230, 420, 24)

function Update-View {
  try {
    $online = Test-InternetOn
  } catch {
    $status.Text = 'Could not check the connection'
    $status.ForeColor = [System.Drawing.Color]::FromArgb(146, 64, 14)
    $detail.Text = $_.Exception.Message
    return
  }
  if ($online) {
    $status.Text = 'Internet is on'
    $status.ForeColor = [System.Drawing.Color]::FromArgb(21, 128, 61)
    $detail.Text = 'Press ON to shut this PC''s internet off.'
  } else {
    $status.Text = 'Internet is off'
    $status.ForeColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
    $detail.Text = 'Press OFF to turn this PC''s internet back on.'
  }
  if ($online) {
    $on.FlatAppearance.BorderSize = 1
    $off.FlatAppearance.BorderSize = 4
  } else {
    $on.FlatAppearance.BorderSize = 4
    $off.FlatAppearance.BorderSize = 1
  }
}

function Invoke-Action([scriptblock]$Action) {
  if ($script:busy) { return }
  $script:busy = $true
  $on.Enabled = $false
  $off.Enabled = $false
  $status.Text = 'Working...'
  $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
  try {
    & $Action
    Update-View
  } catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Internet Switch') | Out-Null
    try { Update-View } catch { }
  } finally {
    $on.Enabled = $true
    $off.Enabled = $true
    $form.Cursor = [System.Windows.Forms.Cursors]::Default
    $script:busy = $false
  }
}

$form.Controls.AddRange(@($status, $detail, $on, $off, $onCap, $offCap, $foot))
$on.Add_Click({ Invoke-Action ${function:Invoke-PressOn} })
$off.Add_Click({ Invoke-Action ${function:Invoke-PressOff} })

Update-View
[System.Windows.Forms.Application]::Run($form)
