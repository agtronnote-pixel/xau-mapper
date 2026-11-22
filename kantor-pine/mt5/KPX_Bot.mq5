//+------------------------------------------------------------------+
//| KPX_Bot.mq5 - Kantor Pine: eksekusi REAL-TIME                    |
//| Membaca sinyal Kantor lokal (MQL5\Files\KPX\<ASET>.sig) tiap     |
//| 0,25 detik dan langsung eksekusi. Satu EA untuk semua aset:      |
//| pasang di chart simbol mana pun (XAUUSD, XMRUSD, BTCUSD, ...).   |
//| PERINGATAN: uji di akun DEMO dulu. Bukan nasihat keuangan.       |
//+------------------------------------------------------------------+
#property copyright "Kantor Pine"
#property version   "2.00"
#property description "Eksekusi real-time sinyal Kantor Pine (Kantor lokal di PC)"
#include <Trade/Trade.mqh>

input group "Aset"
input string InpAset          = "";    // Aset Kantor (kosong = otomatis dari simbol chart), mis. XMRUSD, XAUUSD, USA100
input group "Risiko"
input double InpRiskPercent   = 0.5;   // Risiko per transaksi (% balance), 0 = lot tetap
input double InpFixedLot      = 0.01;  // Lot tetap (dipakai bila risiko = 0)
input double InpMaxRiskMult   = 2.0;   // Tolak entry bila lot minimum berisiko > N x risiko yang diatur (modal terlalu kecil)
input double InpMaxSpread     = 0;     // Spread maksimal (harga), 0 = otomatis per jenis aset
input bool   InpOnePosition   = true;  // Hanya 1 posisi terbuka sekaligus
input int    InpJedaMenit     = 30;    // Jeda setelah posisi ditutup (menit), 0 = tanpa jeda
input group "Entry"
input bool   InpConfirmCandle = false; // Tunggu candle konfirmasi di zona (false = entry saat harga menyentuh zona, sama dengan backtest)
input ENUM_TIMEFRAMES InpConfirmTF = PERIOD_M15; // Timeframe candle konfirmasi
input double InpZoneTolerance = -1;    // Toleransi di luar zona entry (harga), -1 = otomatis (10% ATR H1)
input bool   InpSemuaSinyal   = false; // true = jalankan SEMUA rencana: abaikan filter kekuatan, peluang, keunggulan aset & batas risiko lot (untuk akun demo)
input int    InpMinPeluang    = 50;    // Peluang backtest minimal (%) - sama dengan aturan keputusan di aplikasi
input int    InpMinStrength   = 55;    // Kekuatan sinyal minimal (%) untuk entry
input int    InpMaxAgeSec     = 30;    // Sinyal dianggap basi bila Kantor lokal tidak menulis selama N detik
input group "Manajemen posisi"
input double InpPartialPct    = 50;    // % lot ditutup saat TP1
input bool   InpMoveToBE      = true;  // Geser SL ke entry setelah TP1
input double InpBEBuffer      = -1;    // Buffer break-even (harga), -1 = otomatis (2% ATR H1)
input group "Keamanan"
input bool   InpAllowReal     = false; // Izinkan trading di akun RIIL (default: hanya akun demo)
input group "Lainnya"
input bool   InpDrawLevels    = true;  // Gambar zona & level di chart

#define MAXP 8
CTrade   trade;
string   gAset = "", gFile = "", GVP = "";
ulong    gMagic = 0;
int      vDigits = 2;
// sinyal terbaru
int      nP = 0;
int      P_TYPE[MAXP]; double P_ELO[MAXP], P_EHI[MAXP], P_SL[MAXP], P_TP1[MAXP], P_TP2[MAXP];
datetime P_EXP[MAXP]; string P_NAME[MAXP], P_ID[MAXP]; int P_STR[MAXP], P_PEL[MAXP];
datetime NT_S[16], NT_E[16]; int nNT = 0;
datetime gSigT = 0, gRefT = 0; double gRef = 0, gAtr = 0; int gEdge = 1; string gKelas = "", gAksi = "", gDrawn = "", gLastRaw = "";
double   gOffset = 0; bool gOffOk = false; datetime gOffSigT = 0;
datetime lastTry[MAXP];
string   gErr = "";

bool   Flag(const string k){ return GlobalVariableCheck(GVP + k); }
void   SetFlag(const string k){ GlobalVariableSet(GVP + k, 1); }
double Lv(const double v){ return v + gOffset; }

//--- magic sama dengan EA mapping per jam (posisi lama tetap dikenali)
ulong MagicOf(const string s)
{
   uint h = 7;
   for(int i = 0; i < StringLen(s); i++) h = h * 31 + (uint)StringGetCharacter(s, i);
   return (ulong)(520000000 + h % 9999999);
}

//--- tebak aset Kantor dari nama simbol broker
string GuessAset()
{
   string s = _Symbol; StringToUpper(s);
   string ids[] = {"XAUUSD","XMRUSD","BTCUSD","GBPUSD","USA100","SNP500","ETHUSD","SOLUSD","XRPUSD","DOGEUSD","ADAUSD","AVAXUSD","DOTUSD","LINKUSD","BCHUSD","LTCUSD","TRXUSD","BNBUSD"};
   if(StringFind(s, "XAU") >= 0 || StringFind(s, "GOLD") >= 0) return "XAUUSD";
   if(StringFind(s, "US100") >= 0 || StringFind(s, "NAS100") >= 0 || StringFind(s, "USTEC") >= 0 || StringFind(s, "NDX") >= 0 || StringFind(s, "USA100") >= 0) return "USA100";
   if(StringFind(s, "US500") >= 0 || StringFind(s, "SPX") >= 0 || StringFind(s, "SP500") >= 0 || StringFind(s, "SNP500") >= 0 || StringFind(s, "USA500") >= 0) return "SNP500";
   for(int i = 0; i < ArraySize(ids); i++)
   {
      string b = StringSubstr(ids[i], 0, StringLen(ids[i]) - 3);
      if(StringFind(s, b) >= 0) return ids[i];
   }
   return s;
}

//--- baca file sinyal; true bila isinya berubah
bool ReadSignal()
{
   int h = FileOpen(gFile, FILE_READ | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE) { gErr = "file sinyal " + gFile + " belum ada - jalankan Kantor lokal (KPX_RealTime.bat)"; return false; }
   string raw = "";
   string lines[]; int n = 0;
   while(!FileIsEnding(h) && n < 64) { string l = FileReadString(h); raw += l + "|"; ArrayResize(lines, n + 1); lines[n++] = l; }
   FileClose(h);
   if(n < 2 || lines[0] != "KPX1") { gErr = "file sinyal tidak lengkap"; return false; }
   gErr = "";
   if(raw == gLastRaw) return false;
   gLastRaw = raw;
   int np = 0, nt = 0;
   for(int i = 1; i < n; i++)
   {
      int eq = StringFind(lines[i], "="); if(eq < 0) continue;
      string k = StringSubstr(lines[i], 0, eq), v = StringSubstr(lines[i], eq + 1);
      if(k == "t") gSigT = (datetime)StringToInteger(v);
      else if(k == "ref") gRef = StringToDouble(v);
      else if(k == "reft") gRefT = (datetime)StringToInteger(v);
      else if(k == "atr") gAtr = StringToDouble(v);
      else if(k == "edge") gEdge = (int)StringToInteger(v);
      else if(k == "kelas") gKelas = v;
      else if(k == "aksi") gAksi = v;
      else if(k == "nt" && nt < 16)
      {
         string f[]; if(StringSplit(v, ';', f) == 2) { NT_S[nt] = (datetime)StringToInteger(f[0]); NT_E[nt] = (datetime)StringToInteger(f[1]); nt++; }
      }
      else if(k == "plan" && np < MAXP)
      {
         string f[]; if(StringSplit(v, ';', f) != 11) continue;
         P_TYPE[np] = (int)StringToInteger(f[0]); P_ELO[np] = StringToDouble(f[1]); P_EHI[np] = StringToDouble(f[2]);
         P_SL[np] = StringToDouble(f[3]); P_TP1[np] = StringToDouble(f[4]); P_TP2[np] = StringToDouble(f[5]);
         P_EXP[np] = (datetime)StringToInteger(f[6]); P_NAME[np] = f[7]; P_STR[np] = (int)StringToInteger(f[8]);
         P_PEL[np] = (int)StringToInteger(f[9]); P_ID[np] = f[10];
         np++;
      }
   }
   nP = np; nNT = nt;
   return true;
}

//--- selisih harga broker vs harga Kantor (dirata-rata supaya tidak melompat)
void UpdateOffset()
{
   if(gRef <= 0 || gSigT == gOffSigT) return;
   gOffSigT = gSigT;
   double smp = 0; bool ok = false;
   if(TimeGMT() - gRefT <= 120)
   {
      double mid = (SymbolInfoDouble(_Symbol, SYMBOL_BID) + SymbolInfoDouble(_Symbol, SYMBOL_ASK)) / 2.0;
      if(mid > 0) { smp = mid - gRef; ok = true; }
   }
   else
   {
      datetime ts = gRefT + (TimeTradeServer() - TimeGMT());
      int sh = iBarShift(_Symbol, PERIOD_M5, ts, false);
      if(sh >= 0 && MathAbs((double)(iTime(_Symbol, PERIOD_M5, sh) - ts)) <= 900) { double c = iClose(_Symbol, PERIOD_M5, sh); if(c > 0) { smp = c - gRef; ok = true; } }
   }
   if(!ok || MathAbs(smp) > gRef * 0.01) return;      // > 1% harga = simbol/sumber berbeda, abaikan
   gOffset = gOffOk ? gOffset * 0.8 + smp * 0.2 : smp;
   gOffOk = true;
}

bool InNoTrade(const datetime g){ for(int i = 0; i < nNT; i++) if(g >= NT_S[i] && g < NT_E[i]) return true; return false; }

int CountMyPositions()
{
   int c = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i); if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && (ulong)PositionGetInteger(POSITION_MAGIC) == gMagic) c++;
   }
   return c;
}

//--- detik sejak posisi EA ini terakhir ditutup (-1 = belum ada)
long SinceLastClose()
{
   if(!HistorySelect(TimeCurrent() - 86400, TimeCurrent() + 60)) return -1;
   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
   {
      ulong d = HistoryDealGetTicket(i); if(d == 0) continue;
      if(HistoryDealGetString(d, DEAL_SYMBOL) != _Symbol || (ulong)HistoryDealGetInteger(d, DEAL_MAGIC) != gMagic) continue;
      long e = HistoryDealGetInteger(d, DEAL_ENTRY);
      if(e == DEAL_ENTRY_OUT || e == DEAL_ENTRY_OUT_BY) return (long)(TimeCurrent() - (datetime)HistoryDealGetInteger(d, DEAL_TIME));
   }
   return -1;
}

double NormLot(double lot)
{
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), mn = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), mx = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   lot = MathFloor(lot / step + 1e-7) * step;
   if(lot < mn) lot = mn;
   if(lot > mx) lot = mx;
   return NormalizeDouble(lot, vDigits);
}

double CalcLots(const int type, const double entry, const double sl)
{
   double lot = InpFixedLot;
   if(InpRiskPercent > 0)
   {
      double pl = 0; ENUM_ORDER_TYPE ot = (type == 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      if(OrderCalcProfit(ot, _Symbol, 1.0, entry, sl, pl) && pl < 0) lot = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPercent / 100.0 / (-pl);
   }
   return NormLot(lot);
}

bool Confirmed(const int type, const double lo, const double hi)
{
   if(!InpConfirmCandle) return true;
   double o = iOpen(_Symbol, InpConfirmTF, 1), c = iClose(_Symbol, InpConfirmTF, 1), l = iLow(_Symbol, InpConfirmTF, 1), h = iHigh(_Symbol, InpConfirmTF, 1);
   if(o == 0 || c == 0) return false;
   if(type == 0) return (l <= hi && c > o && c >= lo);
   return (h >= lo && c < o && c <= hi);
}

string DoneKey(const int i){ return "done_" + P_ID[i]; }
string SkipKey(const int i){ return "skip_" + P_ID[i]; }

void OpenPlan(const int i, const double price, double sl, double tp1, double tp2)
{
   int d = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   sl = NormalizeDouble(sl, d); tp2 = NormalizeDouble(tp2, d);
   double lots = CalcLots(P_TYPE[i], price, sl);
   if(InpRiskPercent > 0 && !InpSemuaSinyal)
   {
      double pl = 0; ENUM_ORDER_TYPE ot = (P_TYPE[i] == 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      double want = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPercent / 100.0;
      if(OrderCalcProfit(ot, _Symbol, lots, price, sl, pl) && -pl > want * InpMaxRiskMult)
      {
         SetFlag(SkipKey(i));
         PrintFormat("KPX lewati %s: lot %s berisiko %.2f %s (%.1f%% saldo), batas %.2f. Modal terlalu kecil untuk SL ini.",
                     P_NAME[i], DoubleToString(lots, vDigits), -pl, AccountInfoString(ACCOUNT_CURRENCY), -pl / AccountInfoDouble(ACCOUNT_BALANCE) * 100.0, want * InpMaxRiskMult);
         return;
      }
   }
   string cm = "KPX T1=" + DoubleToString(NormalizeDouble(tp1, d), d);
   ulong t0 = GetMicrosecondCount();
   bool ok = (P_TYPE[i] == 0) ? trade.Buy(lots, _Symbol, 0, sl, tp2, cm) : trade.Sell(lots, _Symbol, 0, sl, tp2, cm);
   uint rc = trade.ResultRetcode();
   if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED))
   {
      SetFlag(DoneKey(i));
      Print("KPX entry ", P_NAME[i], " lot ", DoubleToString(lots, vDigits), " harga ", DoubleToString(trade.ResultPrice(), d), " SL ", DoubleToString(sl, d), " TP ", DoubleToString(tp2, d),
            " | sinyal umur ", IntegerToString((long)(TimeGMT() - gSigT)), " dtk, eksekusi ", IntegerToString((long)((GetMicrosecondCount() - t0) / 1000)), " ms");
   }
   else PrintFormat("KPX gagal entry %s: %s", P_NAME[i], trade.ResultRetcodeDescription());
}

void ManagePositions(const double bid, const double ask)
{
   int d = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), mn = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   if(step <= 0) step = 0.01;
   double beBuf = InpBEBuffer >= 0 ? InpBEBuffer : (gKelas == "emas" ? 0.20 : gAtr * 0.02);
   for(int k = PositionsTotal() - 1; k >= 0; k--)
   {
      ulong t = PositionGetTicket(k); if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || (ulong)PositionGetInteger(POSITION_MAGIC) != gMagic) continue;
      string cm = PositionGetString(POSITION_COMMENT);
      int pos = StringFind(cm, "T1="); if(pos < 0) continue;
      double tp1 = StringToDouble(StringSubstr(cm, pos + 3)); if(tp1 <= 0) continue;
      string key = "tp1_" + IntegerToString((long)t), keyP = "tp1p_" + IntegerToString((long)t);
      if(Flag(key)) continue;
      long ptype = PositionGetInteger(POSITION_TYPE);
      if(!((ptype == POSITION_TYPE_BUY) ? (bid >= tp1) : (ask <= tp1))) continue;
      double vol = PositionGetDouble(POSITION_VOLUME), open = PositionGetDouble(POSITION_PRICE_OPEN), tp = PositionGetDouble(POSITION_TP);
      double cv = NormalizeDouble(MathFloor(vol * InpPartialPct / 100.0 / step + 1e-7) * step, vDigits);
      if(!Flag(keyP))
      {
         if(cv >= mn && vol - cv >= mn && !trade.PositionClosePartial(t, cv))
         { PrintFormat("KPX gagal tutup sebagian tiket %I64u: %s", t, trade.ResultRetcodeDescription()); continue; }
         SetFlag(keyP);
         PrintFormat("KPX TP1 tercapai (tiket %I64u): tutup %s lot", t, DoubleToString(cv, vDigits));
      }
      if(InpMoveToBE)
      {
         double be = NormalizeDouble((ptype == POSITION_TYPE_BUY) ? open + beBuf : open - beBuf, d), cur = PositionGetDouble(POSITION_SL);
         bool better = (ptype == POSITION_TYPE_BUY) ? (cur < be) : (cur == 0 || cur > be);
         if(better && !trade.PositionModify(t, be, tp)) continue;   // dicoba lagi di tick berikutnya
      }
      SetFlag(key);
   }
}

void DrawLevels()
{
   string sig = "";
   for(int i = 0; i < nP; i++) sig += P_ID[i] + DoubleToString(P_SL[i], 5) + DoubleToString(P_TP2[i], 5);
   sig += DoubleToString(MathRound(gOffset / (gAtr * 0.05 + _Point)), 0);   // gambar ulang hanya bila selisih bergeser berarti
   if(sig == gDrawn) return;
   gDrawn = sig;
   ObjectsDeleteAll(0, "KPX_");
   datetime a = TimeCurrent() - 3600;
   for(int i = 0; i < nP; i++)
   {
      datetime b = P_EXP[i] + (TimeTradeServer() - TimeGMT());
      string n = "KPX_Z" + IntegerToString(i);
      ObjectCreate(0, n, OBJ_RECTANGLE, 0, a, Lv(P_EHI[i]), b, Lv(P_ELO[i]));
      ObjectSetInteger(0, n, OBJPROP_COLOR, P_TYPE[i] == 0 ? clrSeaGreen : clrTomato);
      ObjectSetInteger(0, n, OBJPROP_FILL, true); ObjectSetInteger(0, n, OBJPROP_BACK, true);
      ObjectSetString(0, n, OBJPROP_TOOLTIP, P_NAME[i] + " zona entry");
      string lv[3] = {"SL", "TP1", "TP2"}; double pr[3]; pr[0] = Lv(P_SL[i]); pr[1] = Lv(P_TP1[i]); pr[2] = Lv(P_TP2[i]);
      for(int j = 0; j < 3; j++)
      {
         string m = "KPX_L" + IntegerToString(i) + "_" + lv[j];
         ObjectCreate(0, m, OBJ_TREND, 0, a, pr[j], b, pr[j]);
         ObjectSetInteger(0, m, OBJPROP_COLOR, j == 0 ? clrRed : clrDodgerBlue);
         ObjectSetInteger(0, m, OBJPROP_STYLE, STYLE_DASH); ObjectSetInteger(0, m, OBJPROP_RAY_RIGHT, false);
         ObjectSetString(0, m, OBJPROP_TOOLTIP, P_NAME[i] + " " + lv[j] + " " + DoubleToString(pr[j], _Digits));
      }
   }
   ChartRedraw();
}

int OnInit()
{
   gAset = InpAset != "" ? InpAset : GuessAset();
   StringToUpper(gAset);
   gFile = "KPX\\" + gAset + ".sig";
   gMagic = MagicOf(gAset);
   GVP = "KPXB_" + IntegerToString((long)gMagic) + "_";
   trade.SetExpertMagicNumber(gMagic);
   trade.SetDeviationInPoints(50);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   vDigits = (step > 0) ? (int)MathMax(0, MathCeil(-MathLog10(step) - 1e-9)) : 2;
   for(int i = 0; i < MAXP; i++) lastTry[i] = 0;
   // input bisa berubah: tanda "dilewati (modal)" dinilai ulang
   for(int i = GlobalVariablesTotal() - 1; i >= 0; i--) { string g = GlobalVariableName(i); if(StringFind(g, GVP + "skip_") == 0) GlobalVariableDel(g); }
   if(AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_REAL && !InpAllowReal) Print("KPX: akun RIIL - EA hanya memantau. Aktifkan InpAllowReal bila sengaja.");
   PrintFormat("KPX_Bot aktif: aset %s, simbol %s, magic %I64u, file %s", gAset, _Symbol, gMagic, gFile);
   ReadSignal(); UpdateOffset();
   EventSetMillisecondTimer(250);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason){ EventKillTimer(); ObjectsDeleteAll(0, "KPX_"); Comment(""); }
void OnTimer(){ Process(); }
void OnTick(){ Process(); }

void Process()
{
   ReadSignal();
   UpdateOffset();
   datetime g = TimeGMT();
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   ManagePositions(bid, ask);
   long age = (long)(g - gSigT);
   double spreadMax = InpMaxSpread > 0 ? InpMaxSpread : gKelas == "emas" ? 0.50 : gKelas == "forex" ? 0.0003 : gKelas == "indeks" ? bid * 0.0003 : bid * 0.0015;
   long since = -1;

   string why = "";
   if(gErr != "") why = gErr;
   else if(age > InpMaxAgeSec) why = "sinyal basi " + IntegerToString(age) + " dtk - Kantor lokal mati? cek KPX_Kantor_status.txt";
   else if(!gOffOk) why = "menghitung selisih harga broker";
   else if(InNoTrade(g)) why = "jam NO TRADE";
   else if(ask - bid > spreadMax) why = "spread terlalu lebar (" + DoubleToString(ask - bid, _Digits) + ")";
   else if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) why = "Algo Trading mati";
   else if(AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_REAL && !InpAllowReal) why = "akun riil (aktifkan InpAllowReal)";
   else if(InpOnePosition && CountMyPositions() > 0) why = "posisi sedang berjalan";
   else if(TimeTradeServer() - (datetime)SymbolInfoInteger(_Symbol, SYMBOL_TIME) > 300) why = "pasar tutup / tidak ada harga dari broker";
   else if(InpJedaMenit > 0 && (since = SinceLastClose()) >= 0 && since < InpJedaMenit * 60) why = "jeda setelah posisi ditutup, " + IntegerToString((InpJedaMenit * 60 - since) / 60 + 1) + " mnt lagi";

   string st = "Kantor Pine REAL-TIME - " + gAset + (InpSemuaSinyal ? "  [MODE SEMUA SINYAL]" : "") + "\n";
   st += "Sinyal: " + (gSigT > 0 ? IntegerToString(age) + " dtk lalu" : "-") + "  |  keputusan Kantor: " + gAksi + "  |  selisih harga: " + (gOffOk ? DoubleToString(gOffset, _Digits) : "-") + "\n";
   double tol = InpZoneTolerance >= 0 ? InpZoneTolerance : (gKelas == "emas" ? 1.0 : gAtr * 0.1);
   for(int i = 0; i < nP; i++)
   {
      string s;
      double lo = Lv(P_ELO[i]), hi = Lv(P_EHI[i]), sl = Lv(P_SL[i]), tp1 = Lv(P_TP1[i]), tp2 = Lv(P_TP2[i]);
      if(Flag(DoneKey(i))) s = "sudah entry";
      else if(Flag(SkipKey(i))) s = "dilewati (modal terlalu kecil untuk SL ini - lihat tab Experts)";
      else if(!InpSemuaSinyal && gEdge == 0) s = "dilewati (backtest aset ini belum menguntungkan)";
      else if(!InpSemuaSinyal && P_STR[i] < InpMinStrength) s = "dilewati (kekuatan " + IntegerToString(P_STR[i]) + "% < " + IntegerToString(InpMinStrength) + "%)";
      else if(!InpSemuaSinyal && P_PEL[i] >= 0 && P_PEL[i] < InpMinPeluang) s = "dilewati (peluang backtest " + IntegerToString(P_PEL[i]) + "% < " + IntegerToString(InpMinPeluang) + "%)";
      else if(g >= P_EXP[i]) s = "kedaluwarsa";
      else if(why != "") s = "menunggu (" + why + ")";
      else
      {
         s = "memantau zona " + DoubleToString(lo, _Digits) + "-" + DoubleToString(hi, _Digits);
         bool inZone = (P_TYPE[i] == 0) ? (ask >= lo - tol && ask <= hi + tol && ask > sl && ask < tp1)
                                        : (bid <= hi + tol && bid >= lo - tol && bid < sl && bid > tp1);
         if(inZone && g - lastTry[i] >= 5)
         {
            if(Confirmed(P_TYPE[i], lo, hi))
            {
               lastTry[i] = g;
               OpenPlan(i, P_TYPE[i] == 0 ? ask : bid, sl, tp1, tp2);
               if(InpOnePosition && CountMyPositions() > 0) why = "posisi sedang berjalan";
            }
            else s = "harga di zona, tunggu konfirmasi candle";
         }
      }
      st += P_NAME[i] + " (kekuatan " + IntegerToString(P_STR[i]) + "%" + (P_PEL[i] >= 0 ? ", peluang " + IntegerToString(P_PEL[i]) + "%" : "") + "): " + s + "\n";
   }
   if(nP == 0) st += (why != "" ? "Menunggu: " + why : "Kantor belum memberi rencana BUY/SELL") + "\n";
   Comment(st);
   if(InpDrawLevels && gOffOk) DrawLevels();
}
//+------------------------------------------------------------------+
