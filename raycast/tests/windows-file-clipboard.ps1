# Opt-in native clipboard smoke test. Replaces clipboard with synthetic file references.
$ErrorActionPreference = 'Stop'
$testDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('owndrop-files-' + [guid]::NewGuid())
[void](New-Item -ItemType Directory -Path $testDirectory)
$paths = @((Join-Path $testDirectory 'one space.txt'), (Join-Path $testDirectory 'two.txt'))
foreach ($file in $paths) { [System.IO.File]::WriteAllText($file, 'OwnDrop synthetic clipboard test') }
$env:OWNDROP_SELECTED_FILES = ConvertTo-Json -InputObject $paths -Compress
$helper = Join-Path $PSScriptRoot '../assets/selection-windows.ps1'
& powershell.exe -NoProfile -NonInteractive -STA -File $helper -Mode copy
if ($LASTEXITCODE -ne 0) { throw 'Clipboard write failed' }
Add-Type -AssemblyName System.Windows.Forms
$copied = @([System.Windows.Forms.Clipboard]::GetFileDropList())
if ($copied.Count -ne $paths.Count) { throw 'Clipboard lost files after helper exited' }
foreach ($file in $paths) { if ($copied -cnotcontains $file) { throw 'Clipboard file reference mismatch' } }
Write-Output 'PASS: both native file references persisted after helper exit.'
Write-Output "Paste into an empty folder to verify Explorer paste. Synthetic sources remain at $testDirectory"
