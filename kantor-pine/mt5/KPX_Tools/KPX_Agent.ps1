# ==================================================================
#  Kantor Pine XAUUSD - KPX_Agent (MT5)
#  Tiap 5 menit mengunduh EA mapping terbaru dari aplikasi GitHub Pages
#  ke folder Experts. KPX_AutoCompile lalu meng-compile-nya otomatis,
#  dan MT5 memuat ulang EA yang sudah terpasang di chart.
#  Atur alamat aplikasi di file KPX_Agent.config (satu baris URL).
# ==================================================================
$ErrorActionPreference = 'Continue'
$Here      = Split-Path -Parent $MyInvocation.MyCommand.Path
$Experts   = Split-Path -Parent $Here
$Config    = Join-Path $Here 'KPX_Agent.config'
$Target    = Join-Path $Experts 'KPX_Mapping_latest.mq5'
$Status    = Join-Path $Experts 'KPX_Agent_status.txt'
$mutex = New-Object System.Threading.Mutex($false, 'Local\KPX_Agent')
if (-not $mutex.WaitOne(0)) { exit }
function Log([string]$m) { Add-Content -Path $Status -Value ('{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $m) -Encoding UTF8 }
if (-not (Test-Path $Config)) { Log 'GAGAL: KPX_Agent.config belum diisi alamat aplikasi.'; exit 1 }
$Base = (Get-Content $Config -TotalCount 1).Trim().TrimEnd('/')
Log "Aktif. Sumber: $Base"
$last = ''
while ($true) {
    try {
        $r = Invoke-WebRequest -Uri "$Base/ea/KPX_Mapping_latest.mq5" -UseBasicParsing -TimeoutSec 30
        $body = $r.Content
        if ($body -is [byte[]]) { $body = [Text.Encoding]::UTF8.GetString($body) }
        if ($body -and $body -ne $last -and $body.Contains('OnTick')) {
            [IO.File]::WriteAllText($Target, $body, (New-Object Text.UTF8Encoding($false)))
            $last = $body
            Log 'EA mapping baru dipasang: KPX_Mapping_latest.mq5'
        }
    } catch { Log ('Gagal unduh: ' + $_.Exception.Message) }
    Start-Sleep -Seconds 300
}
