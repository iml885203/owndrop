# Read-only native smoke test: no clipboard access, file contents, or uploads.
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot '../assets/selection-windows.cs')
$shell = New-Object -ComObject Shell.Application
$entries = @($shell.Windows())
$checked = 0
foreach ($group in ($entries | Group-Object HWND)) {
    $handle = [long]$group.Name
    $activeTab = [OwnDropExplorer]::ActiveTab($handle)
    if ($activeTab -eq 0) { continue }
    $matching = @($group.Group | Where-Object { [OwnDropExplorer]::BrowserWindow($_) -eq $activeTab })
    if ($matching.Count -ne 1) { throw 'Expected exactly one active tab per Explorer window' }
    $checked++
    Write-Output "PASS: resolved one active tab among $($group.Count) Shell entries sharing a window."
}
if ($checked -eq 0) { throw 'Open a tabbed File Explorer window before running this test' }
