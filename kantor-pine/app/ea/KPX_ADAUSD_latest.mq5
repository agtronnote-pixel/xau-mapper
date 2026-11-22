//+------------------------------------------------------------------+
//| KPX_ADAUSD_202611222000.mq5                                      |
//| Dibuat otomatis oleh Kantor Pine XAUUSD                          |
//| Mapping: 22 Nov 2026, 20.00 WIB - ADAUSD 0.14550                 |
//| PERINGATAN: uji di akun DEMO dulu. Bukan nasihat keuangan.       |
//| EA hanya aktif selama 24 jam masa berlaku mapping ini.           |
//+------------------------------------------------------------------+
/* Bias: BEARISH - Keyakinan 42%
   Ringkasan: ADAUSD cenderung turun (2/4 analis searah). Volatilitas normal. Rencana terkuat: SELL Utama di 0.1459-0.1465 (kekuatan sinyal 62% - Sedang).
   Rencana 0: SELL 0.14590-0.14650 SL 0.14786 TP1 0.14390 TP2 0.14137 - Kekuatan sinyal 62% (Sedang)
     Trigger: Candle M15 menyentuh zona lalu close kembali di bawahnya (rejection bearish), RSI M15 < 60
     Manajemen: Tutup 50% di TP1 lalu geser SL ke titik impas; sisanya ke TP2. Batal bila candle H1 close melewati SL.
   Rencana 1: BUY 0.14360-0.14420 SL 0.14224 TP1 0.14620 TP2 0.14943 - Kekuatan sinyal 40% (Lemah)
     Trigger: Candle M15 menyentuh zona lalu close kembali di atasnya (rejection bullish), RSI M15 > 40
     Manajemen: Tutup 50% di TP1 lalu geser SL ke titik impas; sisanya ke TP2. Batal bila candle H1 close melewati SL.
   Invalidasi: Candle H1 close di atas 0.14786
*/
#property copyright "Kantor Pine XAUUSD"
#property version   "1.00"
#property description "Eksekusi otomatis mapping ADAUSD 202611222000"
#include <Trade/Trade.mqh>

input group "Risiko"
input double InpRiskPercent   = 0.5;   // Risiko per transaksi (% balance), 0 = lot tetap
input double InpFixedLot      = 0.01;  // Lot tetap (dipakai bila risiko = 0)
input double InpMaxSpread     = 0.00022;  // Spread maksimal (harga)
input bool   InpOnePosition   = true;  // Hanya 1 posisi terbuka sekaligus
input group "Entry"
input bool   InpConfirmCandle = true;  // Tunggu candle konfirmasi di zona
input ENUM_TIMEFRAMES InpConfirmTF = PERIOD_M15; // Timeframe candle konfirmasi
input double InpZoneTolerance = 0.00015;  // Toleransi di luar zona entry (harga)
input bool   InpAutoOffset    = true;  // Hitung selisih harga broker vs mapping otomatis
input double InpPriceOffset   = 0.00;  // Selisih manual (dipakai bila otomatis mati/gagal)
input int    InpMinStrength   = 55;    // Kekuatan sinyal minimal (%) untuk entry
input group "Manajemen posisi"
input double InpPartialPct    = 50;    // % lot ditutup saat TP1
input bool   InpMoveToBE      = true;  // Geser SL ke entry setelah TP1
input double InpBEBuffer      = 0.00003;  // Buffer break-even (harga)
input bool   InpCloseAtEnd    = false; // Tutup semua posisi saat mapping berakhir
input group "Keamanan"
input bool   InpAllowReal     = false; // Izinkan trading di akun RIIL (default: hanya akun demo)
input group "Lainnya"
input ulong  InpMagic         = 129922540; // Magic number
input bool   InpDrawLevels    = true;  // Gambar zona & level di chart

//--- data mapping (waktu dalam GMT)
int      P_TYPE[] = {1, 0};   // 0=BUY 1=SELL
double   P_ELO[]  = {0.14590, 0.14360};
double   P_EHI[]  = {0.14650, 0.14420};
double   P_SL[]   = {0.14786, 0.14224};
double   P_TP1[]  = {0.14390, 0.14620};
double   P_TP2[]  = {0.14137, 0.14943};
datetime P_EXP[]  = {D'2026.11.22 21:00:00', D'2026.11.22 21:00:00'};
string   P_NAME[] = {"SELL Utama", "BUY Alternatif"};
int      P_STR[]  = {62, 40};   // kekuatan sinyal %
datetime REF_TIME   = D'2026.11.22 13:00:00';   // waktu harga acuan mapping (GMT)
double   REF_PRICE  = 0.14550;
double   OFFSET_MAX = 0.00145;
datetime NT_START[] = {D'1970.01.01 00:00:00'};
datetime NT_END[]   = {D'1970.01.01 00:00:00'};
datetime MAP_START  = D'2026.11.22 13:00:00';
datetime MAP_END    = D'2026.11.23 13:00:00';

CTrade   trade;
string   GVP;
datetime lastTry[];
int      vDigits = 2;

double   gOffset = 0;
string   gOffsetNote = "";
double Lv(const double v){ return v + gOffset; }
bool   Flag(const string k){ return GlobalVariableCheck(GVP + k); }
void   SetFlag(const string k){ GlobalVariableSet(GVP + k, 1); }
datetime ToServer(const datetime g){ return g + (TimeTradeServer() - TimeGMT()); }

bool InNoTrade(const datetime g)
{
   for(int i = 0; i < ArraySize(NT_START); i++)
      if(NT_END[i] > NT_START[i] && g >= NT_START[i] && g < NT_END[i]) return true;
   return false;
}

int CountMyPositions()
{
   int c = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && (ulong)PositionGetInteger(POSITION_MAGIC) == InpMagic) c++;
   }
   return c;
}

double NormLot(double lot)
{
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double mn   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double mx   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   lot = MathFloor(lot / step) * step;
   if(lot < mn) lot = mn;
   if(lot > mx) lot = mx;
   return NormalizeDouble(lot, vDigits);
}

double CalcLots(const int type, const double entry, const double sl)
{
   double lot = InpFixedLot;
   if(InpRiskPercent > 0)
   {
      double pl = 0;
      ENUM_ORDER_TYPE ot = (type == 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      if(OrderCalcProfit(ot, _Symbol, 1.0, entry, sl, pl) && pl < 0)
         lot = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPercent / 100.0 / (-pl);
   }
   return NormLot(lot);
}

bool Confirmed(const int type, const double lo, const double hi)
{
   if(!InpConfirmCandle) return true;
   double o = iOpen(_Symbol, InpConfirmTF, 1), c = iClose(_Symbol, InpConfirmTF, 1);
   double l = iLow(_Symbol, InpConfirmTF, 1),  h = iHigh(_Symbol, InpConfirmTF, 1);
   if(o == 0 || c == 0) return false;
   if(type == 0) return (l <= hi && c > o && c >= lo);   // rejection bullish dari zona
   return (h >= lo && c < o && c <= hi);                  // rejection bearish dari zona
}

void OpenPlan(const int i, const double price, double sl, double tp2)
{
   int d = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   sl  = NormalizeDouble(sl, d);
   tp2 = NormalizeDouble(tp2, d);
   double lots = CalcLots(P_TYPE[i], price, sl);
   string cm = "KPX P" + IntegerToString(i);
   bool ok = (P_TYPE[i] == 0) ? trade.Buy(lots, _Symbol, 0, sl, tp2, cm) : trade.Sell(lots, _Symbol, 0, sl, tp2, cm);
   uint rc = trade.ResultRetcode();
   if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED))
   {
      SetFlag("done" + IntegerToString(i));
      PrintFormat("KPX entry %s lot %.2f SL %.2f TP %.2f", P_NAME[i], lots, sl, tp2);
   }
   else
      PrintFormat("KPX gagal entry %s: %s", P_NAME[i], trade.ResultRetcodeDescription());
}

void ManagePositions(const double bid, const double ask)
{
   int d = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), mn = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   if(step <= 0) step = 0.01;
   for(int k = PositionsTotal() - 1; k >= 0; k--)
   {
      ulong t = PositionGetTicket(k);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || (ulong)PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      string cm = PositionGetString(POSITION_COMMENT);
      int pos = StringFind(cm, "KPX P");
      if(pos < 0) continue;
      int i = (int)StringToInteger(StringSubstr(cm, pos + 5));
      if(i < 0 || i >= ArraySize(P_TYPE)) continue;
      string key = "tp1_" + IntegerToString((long)t);
      if(Flag(key)) continue;
      long   ptype = PositionGetInteger(POSITION_TYPE);
      double tp1   = Lv(P_TP1[i]);
      bool hit = (ptype == POSITION_TYPE_BUY) ? (bid >= tp1) : (ask <= tp1);
      if(!hit) continue;
      double vol  = PositionGetDouble(POSITION_VOLUME);
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double tp   = PositionGetDouble(POSITION_TP);
      double cv   = NormalizeDouble(MathFloor(vol * InpPartialPct / 100.0 / step) * step, vDigits);
      if(cv >= mn && vol - cv >= mn) trade.PositionClosePartial(t, cv);
      if(InpMoveToBE)
      {
         double be = (ptype == POSITION_TYPE_BUY) ? open + InpBEBuffer : open - InpBEBuffer;
         trade.PositionModify(t, NormalizeDouble(be, d), tp);
      }
      SetFlag(key);
      PrintFormat("KPX TP1 tercapai %s: tutup %.2f lot, SL ke BE", P_NAME[i], cv);
   }
}

void CloseAll()
{
   for(int k = PositionsTotal() - 1; k >= 0; k--)
   {
      ulong t = PositionGetTicket(k);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && (ulong)PositionGetInteger(POSITION_MAGIC) == InpMagic) trade.PositionClose(t);
   }
}

void DrawLevels()
{
   datetime a = ToServer(MAP_START);
   for(int i = 0; i < ArraySize(P_TYPE); i++)
   {
      color c = (P_TYPE[i] == 0) ? clrSeaGreen : clrTomato;
      string n = "KPX_Z" + IntegerToString(i);
      ObjectCreate(0, n, OBJ_RECTANGLE, 0, a, Lv(P_EHI[i]), ToServer(P_EXP[i]), Lv(P_ELO[i]));
      ObjectSetInteger(0, n, OBJPROP_COLOR, c);
      ObjectSetInteger(0, n, OBJPROP_FILL, true);
      ObjectSetInteger(0, n, OBJPROP_BACK, true);
      ObjectSetString(0, n, OBJPROP_TOOLTIP, P_NAME[i] + " zona entry");
      string lv[3] = {"SL", "TP1", "TP2"};
      double pr[3];
      pr[0] = Lv(P_SL[i]); pr[1] = Lv(P_TP1[i]); pr[2] = Lv(P_TP2[i]);
      for(int j = 0; j < 3; j++)
      {
         string m = "KPX_L" + IntegerToString(i) + "_" + lv[j];
         ObjectCreate(0, m, OBJ_TREND, 0, a, pr[j], ToServer(P_EXP[i]), pr[j]);
         ObjectSetInteger(0, m, OBJPROP_COLOR, j == 0 ? clrRed : clrDodgerBlue);
         ObjectSetInteger(0, m, OBJPROP_STYLE, STYLE_DASH);
         ObjectSetInteger(0, m, OBJPROP_RAY_RIGHT, false);
         ObjectSetString(0, m, OBJPROP_TOOLTIP, P_NAME[i] + " " + lv[j] + " " + DoubleToString(pr[j], 2));
      }
   }
   ChartRedraw();
}

void ComputeOffset()
{
   gOffset = InpPriceOffset; gOffsetNote = "manual " + DoubleToString(gOffset, 2);
   if(!InpAutoOffset) return;
   datetime ts = REF_TIME + (TimeTradeServer() - TimeGMT());
   int sh = iBarShift(_Symbol, PERIOD_M5, ts, false);
   if(sh < 0) { gOffsetNote += " (data M5 broker tidak tersedia)"; return; }
   datetime bt = iTime(_Symbol, PERIOD_M5, sh);
   double c = iClose(_Symbol, PERIOD_M5, sh);
   if(c <= 0 || MathAbs((double)(bt - ts)) > 900) { gOffsetNote += " (candle acuan tidak ditemukan)"; return; }
   double o = c - REF_PRICE;
   if(MathAbs(o) > OFFSET_MAX) { gOffsetNote += " (selisih " + DoubleToString(o, _Digits) + " terlalu besar, diabaikan)"; return; }
   gOffset = o; gOffsetNote = "otomatis " + DoubleToString(o, _Digits);
   PrintFormat("KPX selisih harga broker vs mapping: %.2f", o);
}

int OnInit()
{
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(50);
   GVP = "KPX_" + IntegerToString((long)InpMagic) + "_";
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   vDigits = (step > 0) ? (int)MathMax(0, MathCeil(-MathLog10(step) - 1e-9)) : 2;
   ArrayResize(lastTry, ArraySize(P_TYPE));
   for(int i = 0; i < ArraySize(lastTry); i++) lastTry[i] = 0;
   if(StringFind(_Symbol, "ADA") < 0) Alert("KPX: EA ini dibuat untuk ADAUSD. Simbol chart sekarang: ", _Symbol);
   if(TimeGMT() >= MAP_END) Alert("KPX: Mapping ini sudah kedaluwarsa. Buat mapping baru di Kantor Pine.");
   if(AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_REAL && !InpAllowReal)
      Alert("KPX: Akun ini akun RIIL. EA hanya memantau, tidak entry. Uji di akun demo dulu; untuk riil aktifkan InpAllowReal.");
   ComputeOffset();
   if(InpDrawLevels) DrawLevels();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   ObjectsDeleteAll(0, "KPX_");
   Comment("");
}

void OnTick()
{
   datetime g = TimeGMT();
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   ManagePositions(bid, ask);
   if(InpCloseAtEnd && g >= MAP_END) CloseAll();

   string why = "";
   if(g >= MAP_END) why = "mapping berakhir";
   else if(InNoTrade(g)) why = "jam NO TRADE";
   else if(ask - bid > InpMaxSpread) why = "spread terlalu lebar";
   else if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) why = "Algo Trading mati";
   else if(AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_REAL && !InpAllowReal) why = "akun riil (aktifkan InpAllowReal)";
   else if(InpOnePosition && CountMyPositions() > 0) why = "posisi sedang berjalan";

   string st = "Kantor Pine ADAUSD - Auto Trade Mapping\nSelisih harga: " + gOffsetNote + "\n";
   for(int i = 0; i < ArraySize(P_TYPE); i++)
   {
      string s;
      double lo = Lv(P_ELO[i]), hi = Lv(P_EHI[i]), sl = Lv(P_SL[i]), tp1 = Lv(P_TP1[i]), tp2 = Lv(P_TP2[i]);
      if(Flag("done" + IntegerToString(i))) s = "sudah entry";
      else if(P_STR[i] < InpMinStrength) s = "dilewati (kekuatan " + IntegerToString(P_STR[i]) + "% < " + IntegerToString(InpMinStrength) + "%)";
      else if(g >= P_EXP[i]) s = "kedaluwarsa";
      else if(why != "") s = "menunggu (" + why + ")";
      else
      {
         s = "memantau zona " + DoubleToString(lo, 2) + "-" + DoubleToString(hi, 2);
         double tol = InpZoneTolerance;
         bool inZone = (P_TYPE[i] == 0) ? (ask >= lo - tol && ask <= hi + tol && ask > sl && ask < tp1)
                                        : (bid <= hi + tol && bid >= lo - tol && bid < sl && bid > tp1);
         if(inZone && g - lastTry[i] >= 60)
         {
            if(Confirmed(P_TYPE[i], lo, hi))
            {
               lastTry[i] = g;
               OpenPlan(i, P_TYPE[i] == 0 ? ask : bid, sl, tp2);
            }
            else s = "harga di zona, tunggu konfirmasi candle";
         }
      }
      st += P_NAME[i] + ": " + s + "\n";
   }
   long left = (long)(MAP_END - g);
   if(left > 0) st += "Sisa masa mapping: " + IntegerToString(left / 3600) + " jam " + IntegerToString((left % 3600) / 60) + " mnt\n";
   Comment(st);
}
//+------------------------------------------------------------------+
