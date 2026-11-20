# ==================================================================
#  Kantor Pine XAUUSD - Compile otomatis EA hasil mapping (MT5)
#  Mengawasi folder Experts. Setiap file KPX_*.mq5 yang baru/berubah
#  langsung di-compile dengan MetaEditor menjadi .ex5.
#  Hasil compile ditulis ke <nama>.log di folder yang sama.
# ==================================================================
$ErrorActionPreference = 'Continue'
$TerminalId = 'D0E8209F77C8CF37AD8BF550E51FF075'
$DataDir    = Join-Path $env:APPDATA "MetaQuotes\Terminal\$TerminalId"
$Mql5Dir    = Join-Path $DataDir 'MQL5'
$Experts    = Join-Path $Mql5Dir 'Experts'
$StatusFile = Join-Path $Experts 'KPX_AutoCompile_status.txt'

# Satu instance saja
$mutex = New-Object System.Threading.Mutex($false, 'Local\KPX_AutoCompile')
if (-not $mutex.WaitOne(0)) { exit }

function Write-Status([string]$msg) {
    $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $msg
    Add-Content -Path $StatusFile -Value $line -Encoding UTF8
}

function Find-MetaEditor {
    # 1) Folder instalasi dari origin.txt milik terminal ini
    $origin = Join-Path $DataDir 'origin.txt'
    if (Test-Path $origin) {
        $dir = (Get-Content -Path $origin -TotalCount 1).Trim()
        $exe = Join-Path $dir 'metaeditor64.exe'
        if (Test-Path $exe) { return $exe }
    }
    # 2) Cari di Program Files
    foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if (-not $root) { continue }
        $hit = Get-ChildItem -Path $root -Filter 'metaeditor64.exe' -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    return $null
}

$MetaEditor = Find-MetaEditor
if (-not $MetaEditor) { Write-Status 'GAGAL: metaeditor64.exe tidak ditemukan.'; exit 1 }
Write-Status "Aktif. MetaEditor: $MetaEditor"

while ($true) {
    try {
        Get-ChildItem -Path $Experts -Filter 'KPX_*.mq5' -File -ErrorAction SilentlyContinue | ForEach-Object {
            $src = $_.FullName
            $ex5 = [IO.Path]::ChangeExtension($src, '.ex5')
            $log = [IO.Path]::ChangeExtension($src, '.log')
            $need = (-not (Test-Path $ex5)) -or ((Get-Item $ex5).LastWriteTime -lt $_.LastWriteTime)
            if ($need -and ((Get-Date) - $_.LastWriteTime).TotalSeconds -ge 2) {
                $logTime = if (Test-Path $log) { (Get-Item $log).LastWriteTime } else { [datetime]::MinValue }
                if ($logTime -lt $_.LastWriteTime) {
                    Start-Process -FilePath $MetaEditor -ArgumentList @("/compile:`"$src`"", "/inc:`"$Mql5Dir`"", "/log:`"$log`"") -Wait -WindowStyle Hidden
                    $result = if (Test-Path $log) { (Get-Content -Path $log | Select-String -Pattern 'Result' | Select-Object -Last 1) } else { 'tanpa log' }
                    Write-Status ("Compile {0}: {1}" -f $_.Name, $result)
                }
            }
        }
    } catch { Write-Status ("Error: " + $_.Exception.Message) }
    Start-Sleep -Seconds 3
}
