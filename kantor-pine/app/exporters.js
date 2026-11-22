// =====================================================================
//  Kantor Pine XAUUSD — Ekspor: EA MQL5, indikator Pine v6, ringkasan
//  teks & gambar. Dipakai oleh aplikasi (browser) dan GitHub Actions.
// =====================================================================
export let lastEAName = 'KPX_Mapping.mq5';
export const wib = d => d.toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'});
// presisi harga mengikuti aset aktif (emas 2 desimal, DOGE 6 desimal, dst.)
let DG = 2, SYM = 'XAUUSD';
export function setAsset(r){ DG = Number.isInteger(r?.aset?.digit) ? r.aset.digit : 2; SYM = r?.aset?.id || 'XAUUSD'; }
export const num = v => Number.isFinite(+v) && v!==null && v!=='' ? (+v).toFixed(DG) : '-';
export const hzLabel = m => m<60 ? m+' mnt' : (m/60)+' jam';

export function mqDate(d){ const p=n=>String(n).padStart(2,'0'); return `D'${d.getUTCFullYear()}.${p(d.getUTCMonth()+1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00'`; }
const mqStr = s => String(s||'').replace(/[\r\n]+/g,' ').replace(/["\\]/g,"'").slice(0,120);
const mqCmt = s => String(s||'').replace(/[\r\n]+/g,' ').replace(/\*\//g,'* /').slice(0,200);
export function eaPlans(r){
  return (r.rencana||[]).filter(pl=>['BUY','SELL'].includes(pl.tipe) && [pl.entry_bawah,pl.entry_atas,pl.sl,pl.tp1,pl.tp2].every(v=>Number.isFinite(+v)))
    .filter(pl=> pl.tipe==='BUY' ? (+pl.sl < Math.min(+pl.entry_bawah,+pl.entry_atas) && +pl.tp1 > Math.max(+pl.entry_bawah,+pl.entry_atas)) : (+pl.sl > Math.max(+pl.entry_bawah,+pl.entry_atas) && +pl.tp1 < Math.min(+pl.entry_bawah,+pl.entry_atas)));
}
export function buildEA(r){
  setAsset(r); const gold=SYM==='XAUUSD', kelas=r.aset?.kelas||'emas', atrH=+r.statistik?.atrH1||1, px=+r.basis.price||1, dv=v=>(+v).toFixed(DG);
  const spreadMax = gold ? '0.50' : kelas==='forex' ? dv(0.0003) : kelas==='indeks' ? dv(px*0.0003) : dv(px*0.0015);
  const b=r.basis, t0=new Date(b.time), plans=eaPlans(r);
  if(!plans.length) return '';
  const T=m=>new Date(t0.getTime()+m*60000);
  const nt=(r.jadwal||[]).filter(j=>/^NO/i.test(String(j.aksi||'')) && Number.isFinite(+j.menit_mulai) && Number.isFinite(+j.menit_akhir) && +j.menit_akhir>+j.menit_mulai);
  const stamp=t0.toLocaleString('sv-SE',{timeZone:'Asia/Jakarta'}).replace(/[-: ]/g,'').slice(0,12);
  // magic tetap per aset: EA versi jam berikutnya tetap mengenali & mengelola posisi yang dibuka versi sebelumnya
  let hh=7; for(const ch of SYM) hh=(hh*31+ch.charCodeAt(0))>>>0;
  const magic=String(520000000+hh%9999999);
  lastEAName=gold?`KPX_Mapping_${stamp}.mq5`:`KPX_${SYM}_${stamp}.mq5`;
  const f2=v=>(+v).toFixed(DG);
  const arr=(fn)=>plans.map(fn).join(', ');
  return `//+------------------------------------------------------------------+
//| ${lastEAName.padEnd(65)}|
//| Dibuat otomatis oleh Kantor Pine XAUUSD                          |
//| Mapping: ${(t0.toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB · '+SYM+' '+b.price.toFixed(DG)).padEnd(56)}|
//| PERINGATAN: uji di akun DEMO dulu. Bukan nasihat keuangan.       |
//| EA hanya aktif selama 24 jam masa berlaku mapping ini.           |
//+------------------------------------------------------------------+
/* Bias: ${mqCmt(r.bias)} · Keyakinan ${mqCmt(r.keyakinan)}%
   Ringkasan: ${mqCmt(r.ringkasan)}
${plans.map((pl,i)=>`   Rencana ${i}: ${pl.tipe} ${f2(pl.entry_bawah)}-${f2(pl.entry_atas)} SL ${f2(pl.sl)} TP1 ${f2(pl.tp1)} TP2 ${f2(pl.tp2)}${kk(pl)?' · Kekuatan sinyal '+mqCmt(kk(pl)):''}
     Trigger: ${mqCmt(pl.trigger)}
     Manajemen: ${mqCmt(pl.manajemen)}`).join('\n')}
   Invalidasi: ${mqCmt(r.invalidasi)}
*/
#property copyright "Kantor Pine XAUUSD"
#property version   "1.00"
#property description "Eksekusi otomatis mapping ${SYM} ${stamp}"
#include <Trade/Trade.mqh>

input group "Risiko"
input double InpRiskPercent   = 0.5;   // Risiko per transaksi (% balance), 0 = lot tetap
input double InpFixedLot      = 0.01;  // Lot tetap (dipakai bila risiko = 0)
input double InpMaxRiskMult   = 2.0;   // Tolak entry bila lot minimum berisiko > N x risiko yang diatur (modal terlalu kecil)
input double InpMaxSpread     = ${spreadMax};  // Spread maksimal (harga)
input bool   InpOnePosition   = true;  // Hanya 1 posisi terbuka sekaligus
input group "Entry"
input bool   InpConfirmCandle = true;  // Tunggu candle konfirmasi di zona
input ENUM_TIMEFRAMES InpConfirmTF = PERIOD_M15; // Timeframe candle konfirmasi
input double InpZoneTolerance = ${gold?'1.00':dv(atrH*0.1)};  // Toleransi di luar zona entry (harga)
input bool   InpAutoOffset    = true;  // Hitung selisih harga broker vs mapping otomatis
input double InpPriceOffset   = 0.00;  // Selisih manual (dipakai bila otomatis mati/gagal)
input int    InpMinPeluang    = 50;    // Peluang backtest minimal (%) — sama dengan aturan keputusan di aplikasi
input int    InpMinStrength   = ${r.keunggulan&&r.keunggulan.ada===false?101:55};    // Kekuatan sinyal minimal (%) untuk entry${r.keunggulan&&r.keunggulan.ada===false?' (101 = tidak entry: backtest aset ini belum menguntungkan)':''}
input group "Manajemen posisi"
input double InpPartialPct    = 50;    // % lot ditutup saat TP1
input bool   InpMoveToBE      = true;  // Geser SL ke entry setelah TP1
input double InpBEBuffer      = ${gold?'0.20':dv(atrH*0.02)};  // Buffer break-even (harga)
input bool   InpCloseAtEnd    = false; // Tutup semua posisi saat mapping berakhir
input group "Keamanan"
input bool   InpAllowReal     = false; // Izinkan trading di akun RIIL (default: hanya akun demo)
input group "Lainnya"
input ulong  InpMagic         = ${magic}; // Magic number (tetap per aset)
input bool   InpDrawLevels    = true;  // Gambar zona & level di chart

//--- data mapping (waktu dalam GMT)
int      P_TYPE[] = {${arr(pl=>pl.tipe==='BUY'?0:1)}};   // 0=BUY 1=SELL
double   P_ELO[]  = {${arr(pl=>f2(Math.min(+pl.entry_bawah,+pl.entry_atas)))}};
double   P_EHI[]  = {${arr(pl=>f2(Math.max(+pl.entry_bawah,+pl.entry_atas)))}};
double   P_SL[]   = {${arr(pl=>f2(pl.sl))}};
double   P_TP1[]  = {${arr(pl=>f2(pl.tp1))}};
double   P_TP2[]  = {${arr(pl=>f2(pl.tp2))}};
datetime P_EXP[]  = {${arr(pl=>mqDate(T(Number.isFinite(+pl.berlaku_menit)?Math.min(+pl.berlaku_menit,1440):1440)))}};
string   P_NAME[] = {${arr(pl=>`"${mqStr(pl.tipe+' '+(pl.prioritas||''))}"`)}};
int      P_STR[]  = {${arr(pl=>String(Number.isFinite(+pl.kekuatan)?Math.round(+pl.kekuatan):50))}};   // kekuatan sinyal %
int      P_PEL[]  = {${arr(pl=>String(pl.peluang!=null&&pl.peluang_sampel>=30?Math.round(+pl.peluang*100):-1))}};   // peluang TP1 duluan dari backtest % (-1 = sampel belum cukup)
datetime REF_TIME   = ${mqDate(new Date(b.data_time||b.time))};   // waktu harga acuan mapping (GMT)
double   REF_PRICE  = ${(Number.isFinite(+b.data_price)?+b.data_price:+b.price).toFixed(DG)};
double   OFFSET_MAX = ${gold?'30':dv(px*0.01)};
datetime NT_START[] = {${nt.length?nt.map(j=>mqDate(T(+j.menit_mulai))).join(', '):"D'1970.01.01 00:00:00'"}};
datetime NT_END[]   = {${nt.length?nt.map(j=>mqDate(T(+j.menit_akhir))).join(', '):"D'1970.01.01 00:00:00'"}};
datetime MAP_START  = ${mqDate(t0)};
datetime MAP_END    = ${mqDate(T(1440))};

CTrade   trade;
string   GVP;
datetime lastTry[];
int      vDigits = 2;

double   gOffset = 0;
string   gOffsetNote = "";
double Lv(const double v){ return v + gOffset; }
bool   Flag(const string k){ return GlobalVariableCheck(GVP + k); }
string DoneKey(const int i){ return "done" + IntegerToString((long)MAP_START) + "_" + IntegerToString(i); }
string SkipKey(const int i){ return "skip" + IntegerToString((long)MAP_START) + "_" + IntegerToString(i); }
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
   if(InpRiskPercent > 0)
   {
      double pl = 0; ENUM_ORDER_TYPE ot = (P_TYPE[i] == 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      double want = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPercent / 100.0;
      if(OrderCalcProfit(ot, _Symbol, lots, price, sl, pl) && -pl > want * InpMaxRiskMult)
      {
         SetFlag(SkipKey(i));
         PrintFormat("KPX lewati %s: lot %.2f berisiko %.2f %s (%.1f%% saldo), batas %.2f. Modal terlalu kecil untuk SL ini.",
                     P_NAME[i], lots, -pl, AccountInfoString(ACCOUNT_CURRENCY), -pl / AccountInfoDouble(ACCOUNT_BALANCE) * 100.0, want * InpMaxRiskMult);
         return;
      }
   }
   string cm = "KPX T1=" + DoubleToString(NormalizeDouble(Lv(P_TP1[i]), d), d);   // TP1 disimpan di posisi
   bool ok = (P_TYPE[i] == 0) ? trade.Buy(lots, _Symbol, 0, sl, tp2, cm) : trade.Sell(lots, _Symbol, 0, sl, tp2, cm);
   uint rc = trade.ResultRetcode();
   if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED))
   {
      SetFlag(DoneKey(i));
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
      int pos = StringFind(cm, "T1=");
      if(pos < 0) continue;
      double tp1 = StringToDouble(StringSubstr(cm, pos + 3));
      if(tp1 <= 0) continue;
      string key = "tp1_" + IntegerToString((long)t);
      if(Flag(key)) continue;
      long   ptype = PositionGetInteger(POSITION_TYPE);
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
      PrintFormat("KPX TP1 tercapai (tiket %I64u): tutup %.2f lot, SL ke BE", t, cv);
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
   if(StringFind(_Symbol, "${SYM.replace(/USD$/,'')}") < 0) Alert("KPX: EA ini dibuat untuk ${SYM}. Simbol chart sekarang: ", _Symbol);
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

   string st = "Kantor Pine ${SYM} - Auto Trade Mapping\\nSelisih harga: " + gOffsetNote + "\\n";
   for(int i = 0; i < ArraySize(P_TYPE); i++)
   {
      string s;
      double lo = Lv(P_ELO[i]), hi = Lv(P_EHI[i]), sl = Lv(P_SL[i]), tp1 = Lv(P_TP1[i]), tp2 = Lv(P_TP2[i]);
      if(Flag(DoneKey(i))) s = "sudah entry";
      else if(Flag(SkipKey(i))) s = "dilewati (modal terlalu kecil untuk SL ini - lihat tab Experts)";
      else if(P_STR[i] < InpMinStrength) s = "dilewati (kekuatan " + IntegerToString(P_STR[i]) + "% < " + IntegerToString(InpMinStrength) + "%)";
      else if(P_PEL[i] >= 0 && P_PEL[i] < InpMinPeluang) s = "dilewati (peluang backtest " + IntegerToString(P_PEL[i]) + "% < " + IntegerToString(InpMinPeluang) + "%)";
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
      st += P_NAME[i] + ": " + s + "\\n";
   }
   long left = (long)(MAP_END - g);
   if(left > 0) st += "Sisa masa mapping: " + IntegerToString(left / 3600) + " jam " + IntegerToString((left % 3600) / 60) + " mnt\\n";
   Comment(st);
}
//+------------------------------------------------------------------+
`.replace(/·/g,'-').replace(/[–—]/g,'-').replace(/[^\x00-\x7F]/g,'');
}

/* minimal ZIP (stored, no compression) */
export function crc32(u8){ let c, crc=0xFFFFFFFF; for(let n=0;n<u8.length;n++){ c=(crc^u8[n])&0xFF; for(let k=0;k<8;k++) c=c&1?(c>>>1)^0xEDB88320:c>>>1; crc=(crc>>>8)^c; } return (crc^0xFFFFFFFF)>>>0; }
export function makeZip(files){
  const enc=new TextEncoder(), parts=[], central=[]; let offset=0;
  const d=new Date(), dosT=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1), dosD=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  for(const f of files){
    const name=enc.encode(f.name), data=enc.encode(f.text), crc=crc32(data);
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,0,true);
    lh.setUint16(10,dosT,true); lh.setUint16(12,dosD,true); lh.setUint32(14,crc,true); lh.setUint32(18,data.length,true); lh.setUint32(22,data.length,true);
    lh.setUint16(26,name.length,true); lh.setUint16(28,0,true);
    parts.push(new Uint8Array(lh.buffer),name,data);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x0800,true); ch.setUint16(10,0,true);
    ch.setUint16(12,dosT,true); ch.setUint16(14,dosD,true); ch.setUint32(16,crc,true); ch.setUint32(20,data.length,true); ch.setUint32(24,data.length,true);
    ch.setUint16(28,name.length,true); ch.setUint32(42,offset,true);
    central.push(new Uint8Array(ch.buffer),name);
    offset+=30+name.length+data.length;
  }
  const csize=central.reduce((s,a)=>s+a.length,0), end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true); end.setUint16(8,files.length,true); end.setUint16(10,files.length,true); end.setUint32(12,csize,true); end.setUint32(16,offset,true);
  return new Blob([...parts,...central,new Uint8Array(end.buffer)],{type:'application/zip'});
}
export const EA_README = `CARA PASANG EA (MT5 desktop / VPS)
1. Buka MT5 > File > Open Data Folder > MQL5 > Experts.
2. Salin file .mq5 ke folder itu.
3. Buka MetaEditor (F4), buka file .mq5, tekan Compile (F7).
4. Di MT5, buka chart simbol yang sesuai nama file (XAUUSD, BTCUSD, dst.), seret EA ke chart.
5. Centang "Allow Algo Trading", lalu aktifkan tombol Algo Trading.
6. Atur risiko di tab Inputs. Selisih harga broker dihitung otomatis dari candle M5 broker
   pada waktu mapping (lihat baris "Selisih harga" di pojok chart). Matikan bila ingin isi manual.
7. Kekuatan sinyal minimal (default 55%): rencana di bawah angka ini tidak dieksekusi.

PENTING
- Uji di akun DEMO dulu.
- EA hanya aktif selama masa berlaku mapping (24 jam). Buat mapping baru setiap hari.
- MT5 di HP tidak bisa menjalankan EA; gunakan MT5 di komputer atau VPS.
- Bukan nasihat keuangan. Trading berisiko kehilangan modal.
`;

const kk=pl=>Number.isFinite(+pl?.kekuatan)?`${+pl.kekuatan}% (${pl.kekuatan_label||''})`:'';
const kcol=(k,C)=>k>=70?C.green:k>=50?C.gold:C.red;
export function mapSummary(r){
  setAsset(r);
  const b=r.basis, t0=new Date(b.time), p0=b.price;
  const at=m=>wib(new Date(t0.getTime()+m*60000));
  const day=t0.toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',weekday:'short',day:'numeric',month:'short',year:'numeric'});
  const bias=['BULLISH','BEARISH','SIDEWAYS'].includes(r.bias)?r.bias:'SIDEWAYS';
  const L=[];
  L.push(`📊 MAPPING ${SYM} — ${day}, ${at(0)} WIB`);
  L.push(`Harga: ${p0.toFixed(DG)} | Bias: ${bias}${Number.isFinite(+r.keyakinan)?` (${+r.keyakinan}%)`:''}`);
  const n=r.narasi;
  if(n){ L.push(''); L.push(`➡️ KEPUTUSAN: ${n.aksi}`); L.push(n.judul);
    const m=(r.rencana||[])[0]; if(m) L.push(`💪 Kekuatan ${kk(m)}${m.peluang!=null?` · Peluang TP1 duluan ${Math.round(m.peluang*100)}% (${m.peluang_sampel} sampel backtest)`:''}`);
    (n.kenapa||[]).forEach(x=>L.push(`✓ ${x}`)); (n.penghambat||[]).forEach(x=>L.push(`✕ Penghambat: ${x}`));
    if(n.batal) L.push(`❌ ${n.batal}`); if(n.waspada) L.push(`⚠️ ${n.waspada}`); }
  else if(r.ringkasan) L.push(String(r.ringkasan).trim());
  if(r.gap){ const g=r.gap; L.push(''); L.push(`🔔 Gap pembukaan (tutup ${num(g.penutupan)})`);
    g.skenario.forEach(x=>L.push(`• ${x.nama} — ${x.kondisi}: ${x.aksi}`)); }
  (r.rencana||[]).forEach(pl=>{
    L.push('');
    L.push(`🎯 ${pl.prioritas||'Rencana'}: ${pl.tipe} ${num(pl.entry_bawah)}–${num(pl.entry_atas)}`);
    if(kk(pl)) L.push(`💪 Kekuatan sinyal: ${kk(pl)}${pl.peluang!=null?` · peluang ${Math.round(pl.peluang*100)}%`:''} | RR 1:${pl.rr}`);
    L.push(`SL ${num(pl.sl)} | TP1 ${num(pl.tp1)} | TP2 ${num(pl.tp2)}${Number.isFinite(+pl.berlaku_menit)?` | s/d ${at(+pl.berlaku_menit)} WIB`:''}`);
    if(pl.trigger) L.push(`Trigger: ${pl.trigger}`);
    if(pl.manajemen) L.push(`Manajemen: ${pl.manajemen}`);
  });
  const P=r.proyeksi.filter(p=>[15,60,240,1440].includes(+p.menit)&&Number.isFinite(+p.harga)).sort((a,b)=>a.menit-b.menit);
  if(P.length){ L.push(''); L.push('📈 Proyeksi'); L.push(P.map(p=>`+${hzLabel(+p.menit)} (${at(+p.menit)}): ${num(p.harga)}`).join('\n')); }
  if(Array.isArray(r.jadwal)&&r.jadwal.length){ L.push(''); L.push('🕒 Jadwal'); r.jadwal.forEach(j=>L.push(`${at(+j.menit_mulai||0)}–${at(+j.menit_akhir||0)} ${String(j.aksi||'').toUpperCase()}${j.detail?': '+j.detail:''}`)); }
  const lv=(r.level||[]).filter(l=>Number.isFinite(+l.harga));
  if(lv.length){ L.push(''); L.push('🧱 Level: '+lv.map(l=>`${(l.jenis||'')[0]||'·'} ${num(l.harga)}`).join(' · ')); }
  if(r.invalidasi) L.push(`❌ Invalidasi: ${r.invalidasi}`);
  if(r.peringatan) L.push(`⚠️ ${r.peringatan}`);
  L.push(''); L.push(`— Kantor Pine · ${SYM} · Bukan nasihat keuangan, selalu pakai SL.`);
  return L.join('\n');
}

export async function makeMapImage(r, opt={}){
  setAsset(r);
  try{ await Promise.all([document.fonts.load('700 48px Inter'), document.fonts.load('500 24px Inter'), document.fonts.load('400 24px Inter')]); }catch(e){}
  const W=1080, P=64, IW=W-2*P;
  const c=document.createElement('canvas'); c.width=W; c.height=3600;
  const x=c.getContext('2d');
  const C={bg:'#FFFFFF',text:'#111111',muted:'#71717A',line:'#E7E7E4',soft:'#F5F5F3',green:'#15803D',red:'#DC2626',gold:'#A87B1F',blue:'#2563EB',
    gS:'#E9F6EE',rS:'#FDEDED',oS:'#F8F1E2',bS:'#EAF1FE',band:'rgba(168,123,31,.15)'};
  const F=(w,s)=>`${w} ${s}px Inter, system-ui, -apple-system, sans-serif`;
  const b=r.basis, t0=new Date(b.time), p0=b.price;
  const at=m=>wib(new Date(t0.getTime()+m*60000));
  const bias=['BULLISH','BEARISH','SIDEWAYS'].includes(r.bias)?r.bias:'SIDEWAYS';
  const bc=bias==='BULLISH'?C.green:bias==='BEARISH'?C.red:C.gold, bs=bias==='BULLISH'?C.gS:bias==='BEARISH'?C.rS:C.oS;
  const T=(s,X,Y,font,col,al='left')=>{x.font=font;x.fillStyle=col;x.textAlign=al;x.textBaseline='alphabetic';x.fillText(String(s),X,Y);};
  const M=(s,font)=>{x.font=font;return x.measureText(String(s)).width;};
  const wrap=(s,font,maxW,maxL)=>{ x.font=font; const words=String(s||'').split(/\s+/).filter(Boolean); const L=[]; let cur='';
    for(const w of words){ const t=cur?cur+' '+w:w; if(x.measureText(t).width>maxW && cur){ L.push(cur); cur=w; } else cur=t; }
    if(cur) L.push(cur);
    if(L.length>maxL){ L.length=maxL; let l=L[maxL-1]; while(l && x.measureText(l+'…').width>maxW) l=l.slice(0,-1); L[maxL-1]=l+'…'; }
    return L; };
  const RR=(X,Y,w,h,rad,fill,stroke)=>{ x.beginPath(); x.roundRect(X,Y,w,h,rad); if(fill){x.fillStyle=fill;x.fill();} if(stroke){x.strokeStyle=stroke;x.lineWidth=2;x.stroke();} };
  const sec=(label,Y)=>{ T(label.toUpperCase(),P,Y,F(600,20),C.muted); return Y+20; };
  x.fillStyle=C.bg; x.fillRect(0,0,W,c.height);
  let y=P;

  // header
  RR(P,y,60,60,16,C.text); T('Au',P+30,y+39,F(700,24),'#fff','center');
  T('Kantor Pine · '+SYM,P+80,y+26,F(700,26),C.text); T('Mapping strategi harian',P+80,y+56,F(400,22),C.muted);
  const day=t0.toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',weekday:'short',day:'numeric',month:'short',year:'numeric'});
  T(day,W-P,y+26,F(400,22),C.muted,'right'); T(at(0)+' WIB',W-P,y+56,F(700,26),C.text,'right');
  y+=60+56;

  // price + bias
  T(SYM,P,y,F(500,24),C.muted); y+=118;
  const pTxt=p0.toFixed(DG); let pf=116; while(M(pTxt,F(700,pf))>IW*0.55 && pf>60) pf-=4;
  T(pTxt,P,y,F(700,pf),C.text);
  const pw=M(pTxt,F(700,pf));
  const bl=(bias==='BULLISH'?'▲ ':bias==='BEARISH'?'▼ ':'— ')+bias, blw=M(bl,F(700,28))+40;
  RR(P+pw+32,y-80,blw,52,26,bs); T(bl,P+pw+32+blw/2,y-44,F(700,28),bc,'center');
  if(Number.isFinite(+r.keyakinan)) T(`Keyakinan ${+r.keyakinan}%`,P+pw+32,y-4,F(500,22),C.muted);
  y+=44;
  const src=b.manual?'harga manual':(r.sumber_harga||'pencarian online');
  wrap('Sumber harga: '+src,F(400,22),IW,1).forEach(l=>{ T(l,P,y,F(400,22),C.muted); });
  y+=50;
  const n=r.narasi, m0=(r.rencana||[])[0];
  if(n){
    const nc=n.warna==='green'?C.green:n.warna==='red'?C.red:C.gold, ns=n.warna==='green'?C.gS:n.warna==='red'?C.rS:C.oS;
    const jl=wrap(n.judul,F(600,30),IW-56,3), why=(n.kenapa||[]).slice(0,3);
    const bh=40+64+jl.length*42+(m0?96:0)+why.length*38+(n.batal?44:0)+28;
    RR(P,y,IW,bh,24,ns); let yy=y+40+44;
    T('KEPUTUSAN',P+28,y+40,F(600,20),C.muted); T(n.aksi,P+28,yy+10,F(800,60),nc); yy+=58;
    jl.forEach(l=>{ T(l,P+28,yy,F(600,30),C.text); yy+=42; });
    if(m0){ yy+=14; const k=+m0.kekuatan;
      T('Kekuatan sinyal',P+28,yy,F(500,20),C.muted); T(`${k}% · ${m0.kekuatan_label}`,P+28,yy+38,F(700,32),kcol(k,C));
      T('Peluang TP1 duluan',P+IW/2,yy,F(500,20),C.muted); T(m0.peluang!=null?`${Math.round(m0.peluang*100)}% · ${m0.peluang_sampel} sampel`:'belum terkalibrasi',P+IW/2,yy+38,F(700,32),C.text); yy+=82; }
    why.forEach(w=>{ T('✓ '+w,P+28,yy,F(400,26),C.text); yy+=38; });
    if(n.batal){ T(n.batal,P+28,yy+4,F(600,24),C.red); }
    y+=bh+28;
  } else { wrap(r.ringkasan||'',F(400,30),IW,3).forEach(l=>{ T(l,P,y,F(400,30),C.text); y+=44; }); y+=16; }

  // chart (detail)
  y=sec('Grafik proyeksi 24 jam',y)+14;
  const ch=700, cy0=y;
  RR(P,y,IW,ch,20,C.soft);
  const pts=[{m:0,h:p0,lo:p0,hi:p0}].concat(r.proyeksi.filter(p=>Number.isFinite(+p.harga)).sort((a,b)=>a.menit-b.menit)
    .map(p=>({m:+p.menit,h:+p.harga,lo:Number.isFinite(+p.bawah)?+p.bawah:+p.harga,hi:Number.isFinite(+p.atas)?+p.atas:+p.harga})));
  const plans=r.rencana||[], levels=(r.level||[]).filter(l=>Number.isFinite(+l.harga));
  const main0=plans[0]||null;
  let vals=pts.flatMap(p=>[p.lo,p.hi]);
  plans.forEach(pl=>[pl.entry_bawah,pl.entry_atas].forEach(v=>{ if(Number.isFinite(+v)) vals.push(+v); }));
  if(main0) [main0.sl,main0.tp1,main0.tp2].forEach(v=>{ if(Number.isFinite(+v)) vals.push(+v); });
  let lo=Math.min(...vals), hi=Math.max(...vals);
  levels.forEach(l=>{ const v=+l.harga; if(v>lo-(hi-lo)*.4 && v<hi+(hi-lo)*.4){ lo=Math.min(lo,v); hi=Math.max(hi,v); } });
  const pad=(hi-lo)*.08||1; lo-=pad; hi+=pad;
  // plot area: legend on top, price axis left, labels right, time axis + sessions below
  const L0=P+96, R0=P+IW-150, T0=cy0+70, B0=cy0+ch-150;
  const X=i=>L0+i*(R0-L0)/(pts.length-1), Y=v=>T0+(hi-v)*(B0-T0)/(hi-lo);
  const XM=m=>{ for(let i=1;i<pts.length;i++){ if(m<=pts[i].m){ const a=pts[i-1],b=pts[i]; return X(i-1)+(m-a.m)/(b.m-a.m||1)*(X(i)-X(i-1)); } } return X(pts.length-1); };
  const line=(x1,y1,x2,y2,col,w,dash)=>{ x.setLineDash(dash||[]); x.strokeStyle=col; x.lineWidth=w; x.beginPath(); x.moveTo(x1,y1); x.lineTo(x2,y2); x.stroke(); x.setLineDash([]); };
  // legend
  let lgx=P+28; const lgy=cy0+38;
  const lg=(draw,label)=>{ draw(lgx,lgy); T(label,lgx+40,lgy+7,F(500,19),C.muted); lgx+=40+M(label,F(500,19))+28; };
  lg((a,b)=>line(a,b,a+30,b,C.text,4),'Proyeksi');
  lg((a,b)=>{ x.fillStyle=C.band; x.fillRect(a,b-10,30,20); },'Rentang');
  lg((a,b)=>{ x.fillStyle='rgba(21,128,61,.18)'; x.fillRect(a,b-10,30,20); },'Zona entry');
  lg((a,b)=>line(a,b,a+30,b,C.red,3,[6,5]),'SL');
  lg((a,b)=>line(a,b,a+30,b,C.green,3,[2,5]),'TP');
  // sessions (shading + strip)
  const SES=[['Asia','Asia/Tokyo',9,18,'rgba(37,99,235,.04)',C.blue],['London','Europe/London',8,17,'rgba(168,123,31,.05)',C.gold],['New York','America/New_York',8,17,'rgba(21,128,61,.05)',C.green]];
  const hourIn=(tz,d)=>+new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'numeric',hourCycle:'h23'}).format(d);
  const sy=B0+64;
  SES.forEach(([nm,tz,h1,h2,fill,col],si)=>{
    let start=null;
    for(let m=0;m<=1440;m+=15){
      const hh=hourIn(tz,new Date(t0.getTime()+m*60000)), on=m<1440 && hh>=h1 && hh<h2;
      if(on && start===null) start=m;
      if((!on || m===1440) && start!==null){
        const xa=XM(start), xb=XM(m);
        x.fillStyle=fill; x.fillRect(xa,T0,xb-xa,B0-T0);
        RR(xa,sy+si*22,Math.max(xb-xa,4),16,8,fill.replace(/[\d.]+\)$/,'.45)'));
        start=null;
      }
    }
  });
  SES.forEach(([nm,,,,,col],si)=>T(nm,P+28,sy+si*22+14,F(600,15),col));
  // price grid + axis
  const step=[0.5,1,2,2.5,5,10,20,25,50,100].find(s=>(hi-lo)/s<=7)||100;
  for(let v=Math.ceil(lo/step)*step; v<=hi; v+=step){ line(L0,Y(v),R0,Y(v),'rgba(0,0,0,.07)',1.5); T(v.toFixed(step<1?2:0),L0-14,Y(v)+6,F(500,17),C.muted,'right'); }
  // time grid + axis
  pts.forEach((p,i)=>{ line(X(i),T0,X(i),B0,'rgba(0,0,0,.05)',1.5);
    T(i?'+'+(p.m<60?p.m+'m':(p.m/60)+'j'):'Kini',X(i),B0+26,F(700,17),i?C.text:C.gold,'center');
    T(at(p.m),X(i),B0+48,F(400,15),C.muted,'center'); });
  // entry zones
  plans.forEach(pl=>{ const a=+pl.entry_atas,bb=+pl.entry_bawah; if(!Number.isFinite(a)||!Number.isFinite(bb)) return;
    const top=Y(Math.min(Math.max(a,bb),hi)), bot=Y(Math.max(Math.min(a,bb),lo)), sell=pl.tipe==='SELL';
    const xe=Number.isFinite(+pl.berlaku_menit)?XM(Math.min(+pl.berlaku_menit,1440)):R0;
    x.fillStyle=sell?'rgba(220,38,38,.14)':'rgba(21,128,61,.16)'; x.fillRect(L0,top,xe-L0,Math.max(bot-top,5));
    line(xe,top,xe,top+Math.max(bot-top,5),sell?C.red:C.green,2);
    T(`${pl.tipe} ${num(Math.min(a,bb))}–${num(Math.max(a,bb))}`,L0+10,top-8,F(700,17),sell?C.red:C.green); });
  // horizontal lines with collision-free right labels
  const tags=[];
  levels.forEach(l=>{ const v=+l.harga; if(v<lo||v>hi) return; const col=l.jenis==='Resistance'?C.red:l.jenis==='Support'?C.green:C.muted;
    line(L0,Y(v),R0,Y(v),col,1.5,[10,8]); tags.push({y:Y(v),t:`${(l.jenis||'L')[0]} ${v.toFixed(DG)}`,c:col}); });
  if(main0){ [['SL',main0.sl,C.red,[6,5]],['TP1',main0.tp1,C.green,[2,5]],['TP2',main0.tp2,C.green,[2,5]]].forEach(([n,v,col,d])=>{ v=+v; if(!Number.isFinite(v)||v<lo||v>hi) return;
    line(L0,Y(v),R0,Y(v),col,3,d); tags.push({y:Y(v),t:`${n} ${v.toFixed(DG)}`,c:col,b:true}); }); }
  tags.push({y:Y(p0),t:`Kini ${p0.toFixed(DG)}`,c:C.gold,b:true});
  tags.sort((a,b)=>a.y-b.y); for(let i=1;i<tags.length;i++) if(tags[i].y-tags[i-1].y<24) tags[i].y=tags[i-1].y+24;
  tags.forEach(tg=>{ T(tg.t,R0+12,tg.y+6,F(tg.b?700:500,17),tg.c); });
  // band + path + points
  x.beginPath(); pts.forEach((p,i)=>i?x.lineTo(X(i),Y(p.hi)):x.moveTo(X(i),Y(p.hi))); for(let i=pts.length-1;i>=0;i--) x.lineTo(X(i),Y(pts[i].lo)); x.closePath(); x.fillStyle=C.band; x.fill();
  x.beginPath(); pts.forEach((p,i)=>i?x.lineTo(X(i),Y(p.hi)):x.moveTo(X(i),Y(p.hi))); x.strokeStyle='rgba(168,123,31,.45)'; x.lineWidth=1.5; x.stroke();
  x.beginPath(); pts.forEach((p,i)=>i?x.lineTo(X(i),Y(p.lo)):x.moveTo(X(i),Y(p.lo))); x.stroke();
  line(X(0),T0,X(0),B0,C.gold,2,[4,4]);
  x.beginPath(); pts.forEach((p,i)=>i?x.lineTo(X(i),Y(p.h)):x.moveTo(X(i),Y(p.h))); x.strokeStyle=C.text; x.lineWidth=4; x.lineJoin='round'; x.stroke();
  pts.forEach((p,i)=>{ x.beginPath(); x.arc(X(i),Y(p.h),i?7:11,0,7); x.fillStyle=i?C.text:C.gold; x.fill();
    if(i){ x.beginPath(); x.arc(X(i),Y(p.h),3,0,7); x.fillStyle=C.soft; x.fill(); }
    if([15,60,240,1440].includes(p.m)){ const s=p.h.toFixed(DG), w=M(s,F(700,16))+16, up=p.h>=p0;
      const ty=Math.max(T0+2,Y(p.h)-42), tx=Math.min(Math.max(X(i)-w/2,L0),R0-w);
      RR(tx,ty,w,26,13,'#fff',up?C.green:C.red); T(s,tx+w/2,ty+18,F(700,16),up?C.green:C.red,'center'); } });
  y+=ch+48;

  // main plan
  const main=plans[0];
  if(main){
    y=sec('Rencana utama',y)+14;
    const pc=main.tipe==='SELL'?C.red:C.green;
    const trig=wrap('Trigger: '+(main.trigger||'-'),F(400,24),IW-64,2), man=wrap('Manajemen: '+(main.manajemen||'-'),F(400,24),IW-64,3);
    const bh=24+44+20+110+18+(trig.length+man.length)*34+20;
    RR(P,y,IW,bh,20,null,C.line); x.fillStyle=pc; x.beginPath(); x.roundRect(P,y,10,bh,[20,0,0,20]); x.fill();
    let yy=y+24+34;
    const mt=(main.tipe==='SELL'?'▼ SELL':'▲ BUY')+(main.prioritas?' · '+main.prioritas:'');
    T(mt,P+36,yy,F(700,34),pc);
    if(Number.isFinite(+main.kekuatan)) T('Sinyal '+kk(main),P+36+M(mt,F(700,34))+22,yy,F(700,24),kcol(+main.kekuatan,C));
    if(Number.isFinite(+main.berlaku_menit)) T('berlaku s/d '+at(+main.berlaku_menit)+' WIB',W-P-28,yy,F(500,22),C.muted,'right');
    yy+=30;
    const cells=[['ENTRY',num(main.entry_bawah)+'–'+num(main.entry_atas),C.text],['STOP LOSS',num(main.sl),C.red],['TP1',num(main.tp1),C.green],['TP2',num(main.tp2),C.green]];
    const gx=P+36, gw=IW-64, cwid=[gw*.37,gw*.21,gw*.21,gw*.21];
    let cxp=gx;
    cells.forEach((cl,i)=>{ RR(cxp,yy,cwid[i]-10,110,14,C.soft); T(cl[0],cxp+16,yy+36,F(600,18),C.muted);
      let fs=34; while(M(cl[1],F(700,fs))>cwid[i]-42 && fs>20) fs-=2; T(cl[1],cxp+16,yy+84,F(700,fs),cl[2]); cxp+=cwid[i]; });
    yy+=110+18+26;
    trig.concat(man).forEach(l=>{ T(l,P+36,yy,F(400,24),C.text); yy+=34; });
    y+=bh+20;
    plans.slice(1,3).forEach(pl=>{
      const ac=pl.tipe==='SELL'?C.red:C.green;
      RR(P,y,IW,84,16,C.soft);
      const at2=(pl.tipe==='SELL'?'▼ SELL':'▲ BUY')+' · '+(pl.prioritas||'Alternatif');
      T(at2,P+24,y+34,F(700,24),ac);
      if(Number.isFinite(+pl.kekuatan)) T('Sinyal '+kk(pl),P+24+M(at2,F(700,24))+18,y+34,F(600,20),kcol(+pl.kekuatan,C));
      T(`Entry ${num(pl.entry_bawah)}–${num(pl.entry_atas)}  ·  SL ${num(pl.sl)}  ·  TP ${num(pl.tp1)} / ${num(pl.tp2)}`,P+24,y+66,F(500,22),C.text);
      y+=100; });
    y+=36;
  }

  // projection chips
  const PJ=r.proyeksi.filter(p=>[15,60,240,1440].includes(+p.menit)&&Number.isFinite(+p.harga)).sort((a,b)=>a.menit-b.menit);
  if(PJ.length){
    y=sec('Proyeksi harga',y)+14;
    const w4=(IW-(PJ.length-1)*14)/PJ.length;
    PJ.forEach((p,i)=>{ const X0=P+i*(w4+14), d=+p.harga-p0, col=d>=0?C.green:C.red;
      RR(X0,y,w4,128,16,C.soft); T('+'+hzLabel(+p.menit),X0+18,y+36,F(600,20),C.text); T(at(+p.menit)+' WIB',X0+w4-18,y+36,F(400,18),C.muted,'right');
      T(num(p.harga),X0+18,y+82,F(700,32),C.text); T((d>=0?'▲ +':'▼ ')+d.toFixed(DG),X0+18,y+112,F(600,20),col); });
    y+=128+44;
  }

  // schedule
  const J=(r.jadwal||[]).slice(0,6);
  if(J.length){
    y=sec('Jadwal aksi 24 jam',y)+10;
    const acol=a=>a.startsWith('ENTRY')?[C.blue,C.bS]:a.startsWith('HOLD')?[C.gold,C.oS]:a.startsWith('TAKE')||a.startsWith('TP')?[C.green,C.gS]:a.startsWith('NO')?[C.red,C.rS]:[C.muted,C.soft];
    J.forEach((j,i)=>{ const a=String(j.aksi||'').toUpperCase(), [fc,bgc]=acol(a);
      y+=16; T(`${at(+j.menit_mulai||0)}–${at(+j.menit_akhir||0)}`,P,y+30,F(600,24),C.text);
      const aw=M(a,F(700,18))+28; RR(P+200,y+6,aw,36,18,bgc); T(a,P+200+aw/2,y+30,F(700,18),fc,'center');
      const dl=wrap(j.detail||'',F(400,22),IW-200-aw-20,1); if(dl[0]) T(dl[0],P+200+aw+16,y+31,F(400,22),C.muted);
      y+=48; if(i<J.length-1){ x.fillStyle=C.line; x.fillRect(P,y+6,IW,2); } });
    y+=40;
  }

  // levels
  if(levels.length){
    y=sec('Level kunci',y)+14; let lx=P;
    levels.slice(0,6).forEach(l=>{ const col=l.jenis==='Resistance'?C.red:l.jenis==='Support'?C.green:C.muted, bg=l.jenis==='Resistance'?C.rS:l.jenis==='Support'?C.gS:C.soft;
      const s=`${(l.jenis||'Level')[0]} ${num(l.harga)}`, w=M(s,F(700,22))+32; if(lx+w>W-P){ lx=P; y+=58; }
      RR(lx,y,w,46,23,bg); T(s,lx+w/2,y+31,F(700,22),col,'center'); lx+=w+10; });
    y+=46+40;
  }

  // invalidation + warning
  const inv=wrap('Invalidasi: '+(r.invalidasi||'-'),F(500,24),IW-48,2), wr=r.peringatan?wrap('Peringatan: '+r.peringatan,F(400,22),IW-48,2):[];
  const ih=28+inv.length*34+(wr.length?12+wr.length*32:0)+20;
  RR(P,y,IW,ih,16,C.rS); let iy=y+28+14;
  inv.forEach(l=>{ T(l,P+24,iy,F(500,24),C.red); iy+=34; }); if(wr.length){ iy+=8; wr.forEach(l=>{ T(l,P+24,iy,F(400,22),C.text); iy+=32; }); }
  y+=ih+40;

  // footer
  x.fillStyle=C.line; x.fillRect(P,y,IW,2); y+=44;
  T('Kantor Pine · '+SYM,P,y,F(700,22),C.text); T('Bukan nasihat keuangan · selalu gunakan SL',W-P,y,F(400,20),C.muted,'right');
  y+=P-8;

  const out=document.createElement('canvas'); out.width=W; out.height=Math.ceil(y);
  out.getContext('2d').drawImage(c,0,0);
  return await new Promise(res=>out.toBlob(res,'image/png'));
}

// ---------- Indikator Pine Script v6 untuk TradingView ----------
export function buildPine(r){
  const b=r.basis, t0=new Date(b.time);
  const stamp=t0.toLocaleString('sv-SE',{timeZone:'Asia/Jakarta'}).replace(/[-: ]/g,'').slice(0,12);
  setAsset(r); const f=v=>(+v).toFixed(DG);
  const q=s=>String(s||'').replace(/["\\\r\n]/g,' ').slice(0,60);
  const lv=(r.level||[]).filter(l=>Number.isFinite(+l.harga));
  const plans=(r.rencana||[]).filter(pl=>[pl.entry_bawah,pl.entry_atas,pl.sl,pl.tp1,pl.tp2].every(v=>Number.isFinite(+v)));
  const L=[];
  L.push('//@version=6');
  L.push(`indicator("KPX Mapping ${SYM} ${stamp}", overlay=true, max_lines_count=100, max_boxes_count=20, max_labels_count=60)`);
  L.push(`// Dibuat otomatis oleh Kantor Pine (${SYM}) dari mapping ${t0.toISOString()} (harga ${f(b.price)}).`);
  L.push('// Bukan nasihat keuangan. Konfirmasi di chart dan selalu gunakan stop loss.');
  L.push('offset = input.float(0.0, "Selisih harga broker - mapping (USD)", group="Umum", tooltip="Isi bila harga broker berbeda dari harga mapping")');
  L.push('showLevels = input.bool(true, "Tampilkan level kunci", group="Tampilan")');
  L.push('showPlans = input.bool(true, "Tampilkan rencana entry", group="Tampilan")');
  L.push('');
  L.push('drawLine(float p, color c, string t, bool solid) =>');
  L.push('    line.new(bar_index - 1, p + offset, bar_index, p + offset, extend=extend.both, color=c, style=solid ? line.style_solid : line.style_dashed, width=1)');
  L.push('    label.new(bar_index + 3, p + offset, t + " " + str.tostring(p + offset, "#.00"), style=label.style_none, textcolor=c, size=size.small)');
  L.push('');
  L.push('var bool drawn = false');
  L.push('if barstate.islast and not drawn');
  L.push('    drawn := true');
  if(!lv.length && !plans.length) L.push('    label.new(bar_index, close, "KPX: belum ada level", style=label.style_label_down)');
  if(lv.length) L.push('    if showLevels');
  lv.forEach(l=>{ const c=l.jenis==='Resistance'?'color.red':l.jenis==='Support'?'color.green':'color.gray'; L.push(`        drawLine(${f(l.harga)}, ${c}, "${q((l.jenis||'')[0]+' '+(l.catatan||''))}", false)`); });
  if(plans.length) L.push('    if showPlans');
  plans.forEach(pl=>{ const buy=pl.tipe==='BUY', c=buy?'color.green':'color.red';
    L.push(`        box.new(bar_index - 20, ${f(Math.max(pl.entry_bawah,pl.entry_atas))} + offset, bar_index + 40, ${f(Math.min(pl.entry_bawah,pl.entry_atas))} + offset, border_color=${c}, bgcolor=color.new(${c}, 85), text="${pl.tipe} ${q(pl.prioritas)}${Number.isFinite(+pl.kekuatan)?' '+(+pl.kekuatan)+'%':''}", text_color=${c}, text_size=size.small)`);
    L.push(`        drawLine(${f(pl.sl)}, color.red, "SL ${pl.tipe}", true)`);
    L.push(`        drawLine(${f(pl.tp1)}, color.blue, "TP1 ${pl.tipe}", true)`);
    L.push(`        drawLine(${f(pl.tp2)}, color.blue, "TP2 ${pl.tipe}", true)`); });
  L.push('');
  plans.forEach((pl,i)=>{ const lo=f(Math.min(pl.entry_bawah,pl.entry_atas)), hi=f(Math.max(pl.entry_bawah,pl.entry_atas));
    L.push(`inZone${i} = close >= ${lo} + offset and close <= ${hi} + offset`);
    L.push(`alertcondition(inZone${i} and not inZone${i}[1], "KPX ${pl.tipe} ${q(pl.prioritas)}: masuk zona", "${SYM} masuk zona ${pl.tipe} {{close}} - tunggu konfirmasi")`); });
  L.push('plot(na, "KPX")');
  return { name:`KPX_Mapping_${stamp}.pine`, code: L.join('\n')+'\n' };
}
