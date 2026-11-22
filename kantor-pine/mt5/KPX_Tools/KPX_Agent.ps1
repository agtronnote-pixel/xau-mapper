# ==================================================================
#  Kantor Pine - KPX_Agent (multi-aset) (MT5)
#  Tiap 5 menit mengunduh EA mapping terbaru dari aplikasi GitHub Pages
#  ke folder Experts. KPX_AutoCompile lalu meng-compile-nya otomatis,
#  dan MT5 memuat ulang EA yang sudah terpasang di chart.
#  KPX_Agent.config: baris 1 = alamat aplikasi, baris 2 (opsional) = daftar aset,
#  mis. XAUUSD,BTCUSD,GBPUSD,USA100. EA kripto/forex/indeks: KPX_<ASET>_latest.mq5
# ==================================================================
$ErrorActionPreference = 'Continue'
$Here      = Split-Path -Parent $MyInvocation.MyCommand.Path
$Experts   = Split-Path -Parent $Here
$Config    = Join-Path $Here 'KPX_Agent.config'
$Status    = Join-Path $Experts 'KPX_Agent_status.txt'
$mutex = New-Object System.Threading.Mutex($false, 'Local\KPX_Agent')
if (-not $mutex.WaitOne(0)) { exit }
function Log([string]$m) { Add-Content -Path $Status -Value ('{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $m) -Encoding UTF8 }
if (-not (Test-Path $Config)) { Log 'GAGAL: KPX_Agent.config belum diisi alamat aplikasi.'; exit 1 }
$cfg  = @(Get-Content $Config)
$Base = $cfg[0].Trim().TrimEnd('/')
if ($Base -notmatch 'kantor-pine/app$') { $Base = "$Base/kantor-pine/app" }   # alamat root juga diterima
# Baris ke-2 (opsional): daftar aset dipisah koma, mis. XAUUSD,BTCUSD,GBPUSD. Kosong = XAUUSD saja.
$Assets = @('XAUUSD')
if ($cfg.Count -ge 2 -and $cfg[1].Trim()) { $Assets = $cfg[1].Split(',') | ForEach-Object { $_.Trim().ToUpper() } | Where-Object { $_ -match '^[A-Z0-9]+$' } }
function EaName([string]$a) { if ($a -eq 'XAUUSD') { 'KPX_Mapping_latest.mq5' } else { "KPX_${a}_latest.mq5" } }
Log ("Aktif. Sumber: $Base · aset: " + ($Assets -join ', '))
$last = @{}
while ($true) {
    foreach ($a in $Assets) {
        $name = EaName $a
        try {
            # ?t= melewati cache GitHub Pages (10 menit) supaya EA terbaru langsung terunduh
            $r = Invoke-WebRequest -Uri ("$Base/ea/$name" + '?t=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -UseBasicParsing -TimeoutSec 30
            $body = $r.Content
            if ($body -is [byte[]]) { $body = [Text.Encoding]::UTF8.GetString($body) }
            if ($body -and $body -ne $last[$a] -and $body.Contains('OnTick')) {
                [IO.File]::WriteAllText((Join-Path $Experts $name), $body, (New-Object Text.UTF8Encoding($false)))
                $last[$a] = $body
                Log "EA mapping baru dipasang: $name"
            }
        } catch { Log ("Gagal unduh $name" + ': ' + $_.Exception.Message) }
    }
    Start-Sleep -Seconds 300
}
