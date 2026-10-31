import React from 'react';
import { Printer, X } from 'lucide-react';
import { format } from 'date-fns';
import Barcode from 'react-barcode';
import { useAppStore } from '../store/useAppStore';

export interface ReceiptItem {
  id?: string;
  name: string;
  quantity: number;
  price: number;
  isGift?: boolean;
  unitLabel?: string;
}

export interface ReceiptData {
  id?: string;
  saleId?: string;
  date?: string | Date;
  cashierName?: string;
  customerName?: string;
  paymentMethod?: string;
  items: ReceiptItem[];
  subtotal?: number;
  discount?: number;
  totalAmount: number;
  amountPaid?: number;
  change?: number;
  customerRemainingDebt?: number;
}

interface ThermalReceiptProps {
  receipt: ReceiptData;
  onClose?: () => void;
  autoPrint?: boolean;
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({ receipt, onClose }) => {
  const settings = useAppStore(state => state.settings);

  const formattedDate = receipt.date 
    ? format(new Date(receipt.date), 'yyyy-MM-dd')
    : format(new Date(), 'yyyy-MM-dd');

  const formattedTime = receipt.date
    ? format(new Date(receipt.date), 'hh:mm:ss a')
    : format(new Date(), 'hh:mm:ss a');

  const rawId = receipt.id || receipt.saleId || '00000000';
  const receiptBarcodeValue = rawId.length >= 8 ? rawId.slice(0, 8).toUpperCase() : rawId.toUpperCase();
  const fullBarcodeText = `REC-${receiptBarcodeValue}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[96vh]">
        
        {/* Header Modal Bar (Hidden on print) */}
        <div className="flex justify-between items-center pb-3 mb-3 border-b border-slate-800 text-white no-print">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">پێشبینینی وەسڵی فەرمی کاشێر</h3>
              <p className="text-[10px] text-slate-400 font-mono">Thermal 80mm Premium Slip</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button 
              onClick={handlePrint}
              className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-lg shadow-teal-600/20 active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              چاپکردن
            </button>
            {onClose && (
              <button 
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Printable Thermal Receipt Container */}
        <div className="flex-1 overflow-y-auto p-1 sm:p-3 flex justify-center bg-slate-950/50 rounded-2xl border border-slate-800/60">
          <div className="printable-receipt w-full max-w-[80mm] bg-white text-black p-5 font-mono text-xs leading-tight select-text text-center border border-slate-300 shadow-2xl rounded-2xl">
            
            {/* Shop Logo */}
            {settings.logoUrl && (
              <div className="flex justify-center mb-2.5">
                <img 
                  src={settings.logoUrl} 
                  alt="Shop Logo" 
                  className="max-h-16 max-w-[110px] object-contain rounded-lg p-0.5 border border-slate-200"
                />
              </div>
            )}

            {/* Shop Name & Header */}
            <h2 className="font-black text-lg tracking-tight mb-0.5 text-black font-sans">
              {settings.shopName || 'سۆران هۆکە شۆپ'}
            </h2>
            
            {settings.receiptHeader && (
              <p className="text-[10px] text-slate-700 font-bold mb-1 font-sans">{settings.receiptHeader}</p>
            )}

            <div className="text-[9px] text-slate-600 space-y-0.5 mb-2 font-sans">
              {settings.address && <p>{settings.address}</p>}
              {settings.phone && <p className="font-mono font-bold text-slate-900" dir="ltr">{settings.phone}</p>}
            </div>

            {/* Top Double Border Divider */}
            <div className="border-b-2 border-slate-900 my-2"></div>

            {/* Receipt Meta Box */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[10px] text-slate-800 space-y-1 text-right font-sans mb-2">
              <div className="flex justify-between items-center font-bold">
                <span className="text-slate-500">ژمارەی وەصڵ:</span>
                <span className="font-mono font-black text-black text-xs" dir="ltr">#{receiptBarcodeValue}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">بەروار و کات:</span>
                <span className="font-mono text-[9px]" dir="ltr">{formattedDate} {formattedTime}</span>
              </div>
              {receipt.cashierName && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">کاشێر:</span>
                  <span className="font-bold text-slate-900">{receipt.cashierName}</span>
                </div>
              )}
              {receipt.customerName && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">کڕیار:</span>
                  <span className="font-bold text-slate-950">{receipt.customerName}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-0.5 border-t border-slate-200">
                <span className="text-slate-500">شێوازی پارەدان:</span>
                <span className="font-bold px-1.5 py-0.5 rounded text-[9px] bg-slate-200 text-slate-900">
                  {receipt.paymentMethod === 'Cash' ? 'کاش (نەقد)' : 
                   receipt.paymentMethod === 'FIB' ? 'FIB ئەلیکترۆنی' : 
                   receipt.paymentMethod === 'Debt' ? 'قەرز' : receipt.paymentMethod || 'کاش'}
                </span>
              </div>
            </div>

            {/* Items Table */}
            <table className="w-full text-right text-[11px] mb-2 font-sans">
              <thead>
                <tr className="border-b-2 border-slate-900 font-black text-black">
                  <th className="pb-1 text-right">کاڵا</th>
                  <th className="pb-1 text-center w-10">بڕ</th>
                  <th className="pb-1 text-left w-18">کۆی نرخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {receipt.items.map((item, idx) => {
                  const isWgt = (item as any).barcode?.startsWith('WGT-');
                  const isMtr = (item as any).barcode?.startsWith('MTR-');
                  const qtyLabel = isWgt 
                    ? `${(item.quantity / 1000).toFixed(3)}کگم` 
                    : isMtr 
                    ? `${(item.quantity / 100).toFixed(2)}م` 
                    : `${item.quantity}`;

                  const rawItemTotal = item.isGift ? 0 : (item.price * (isWgt ? item.quantity / 1000 : isMtr ? item.quantity / 100 : item.quantity));
                  const itemTotal = Math.round(rawItemTotal);

                  return (
                    <tr key={idx} className="py-1">
                      <td className="py-1.5 text-right font-bold text-slate-900 leading-snug">
                        {item.name}
                        {item.isGift && <span className="text-[9px] text-emerald-700 mr-1">(دیاری)</span>}
                        {item.unitLabel && <span className="text-[9px] text-slate-500 mr-1">({item.unitLabel})</span>}
                        {!isWgt && !isMtr && item.quantity > 1 && (
                          <div className="text-[9px] text-slate-500 font-mono" dir="ltr">
                            @{item.price.toLocaleString()} IQD
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 text-center font-mono font-bold text-[10px]" dir="ltr">
                        {qtyLabel}
                      </td>
                      <td className="py-1.5 text-left font-mono font-black text-slate-950" dir="ltr">
                        {item.isGift ? '0' : itemTotal.toLocaleString('en-US')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Subtotals & Grand Total Section */}
            <div className="border-t-2 border-slate-900 pt-2 space-y-1 text-[10px] text-slate-800 font-sans">
              
              {receipt.discount && receipt.discount > 0 ? (
                <>
                  <div className="flex justify-between">
                    <span>کۆی پێش داشکان:</span>
                    <span className="font-mono" dir="ltr">
                      {((receipt.totalAmount || 0) + (receipt.discount || 0)).toLocaleString('en-US')} IQD
                    </span>
                  </div>
                  <div className="flex justify-between text-rose-700 font-bold">
                    <span>داشکان:</span>
                    <span className="font-mono" dir="ltr">
                      -{receipt.discount.toLocaleString('en-US')} IQD
                    </span>
                  </div>
                </>
              ) : null}

              {/* Net Grand Total Box */}
              <div className="bg-slate-900 text-white p-2 rounded-xl flex justify-between items-baseline font-black my-1">
                <span className="text-xs">کۆی گشتی:</span>
                <span className="font-mono text-base tracking-tight" dir="ltr">
                  {receipt.totalAmount.toLocaleString('en-US')} IQD
                </span>
              </div>

              {receipt.amountPaid && receipt.amountPaid > receipt.totalAmount && (
                <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-[9px] space-y-0.5">
                  <div className="flex justify-between">
                    <span>پارەی دراو:</span>
                    <span className="font-mono font-bold" dir="ltr">{receipt.amountPaid.toLocaleString('en-US')} IQD</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-800">
                    <span>باقی گەڕاوە:</span>
                    <span className="font-mono" dir="ltr">{(receipt.amountPaid - receipt.totalAmount).toLocaleString('en-US')} IQD</span>
                  </div>
                </div>
              )}

              {receipt.paymentMethod === 'Debt' && receipt.customerRemainingDebt !== undefined && (
                <div className="bg-rose-50 p-1.5 rounded-lg border border-rose-200 text-[9px] flex justify-between font-bold text-rose-800">
                  <span>کۆی قەرزی ماوەی کڕیار:</span>
                  <span className="font-mono" dir="ltr">{receipt.customerRemainingDebt.toLocaleString('en-US')} IQD</span>
                </div>
              )}
            </div>

            {/* Footer Note / Shop Policy */}
            {settings.receiptFooter && (
              <div className="border-t border-dashed border-slate-300 pt-2 mt-2 text-[9px] text-slate-700 font-sans leading-normal">
                {settings.receiptFooter}
              </div>
            )}

            {/* OFFICIAL UNIQUE BARCODE (Scannable by 1D Laser Guns & 2D Cameras) */}
            <div className="mt-3 pt-2.5 border-t-2 border-dotted border-slate-400 flex flex-col items-center justify-center">
              <div className="bg-white p-1 rounded-lg">
                <Barcode 
                  value={fullBarcodeText} 
                  width={1.4} 
                  height={35} 
                  fontSize={10} 
                  margin={0} 
                  displayValue={true} 
                  font="monospace"
                />
              </div>
              <p className="text-[8px] text-slate-500 font-sans mt-1">
                بۆ گەڕاندنەوە یان گۆڕینەوە ئەم بارکۆدە سکان بکە
              </p>
            </div>

          </div>
        </div>

        {/* Modal Actions (No Print) */}
        <div className="pt-3 border-t border-slate-800 flex gap-2.5 no-print">
          {onClose && (
            <button 
              onClick={onClose}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors text-xs"
            >
              داخستن
            </button>
          )}
          <button 
            onClick={handlePrint}
            className="flex-[2] py-3 bg-teal-600 hover:bg-teal-500 text-white font-black rounded-xl transition-all shadow-lg shadow-teal-600/30 flex items-center justify-center gap-2 text-xs active:scale-98"
          >
            <Printer className="w-4 h-4" />
            چاپکردنی وەسڵ (Print)
          </button>
        </div>

      </div>
    </div>
  );
};
