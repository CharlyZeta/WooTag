import React, { useState } from 'react';
import { PrintRecord } from '../../types';
import { History, Search, Clock, Package } from 'lucide-react';

interface HistoryTabProps {
  printLog: PrintRecord[];
  onClearPrintLog: () => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ printLog, onClearPrintLog }) => {
  const [historyFilter, setHistoryFilter] = useState('');

  const filteredLog = printLog.filter(record => {
    if (!historyFilter.trim()) return true;
    const q = historyFilter.toLowerCase();
    return record.items.some(
      item => item.sku.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
      {/* Search / Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-500" /> REGISTRO ({printLog.length})
          </label>
          {printLog.length > 0 && (
            <button
              onClick={onClearPrintLog}
              className="text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
            >
              BORRAR TODO
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={historyFilter}
            onChange={e => setHistoryFilter(e.target.value)}
            placeholder="Filtrar por SKU o nombre..."
            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none text-sm font-bold text-slate-800 placeholder-slate-400 transition-all"
          />
        </div>
      </div>

      {/* Log Grid */}
      <div className="space-y-3">
        {printLog.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
            <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-black">Sin registros aún</p>
            <p className="text-slate-400 text-[10px] mt-1 font-bold">
              Cada vez que imprimas quedará guardado aquí
            </p>
          </div>
        )}
        {filteredLog.map(record => {
          const date = new Date(record.timestamp);
          const dateStr = date.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
          });
          const timeStr = date.toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          });

          // Deduplicate items for display (same SKU = same product printed N times)
          const uniqueItems = record.items.filter((item, idx, arr) =>
            arr.findIndex(x => x.sku === item.sku) === idx
          );

          const filteredItems = historyFilter.trim()
            ? uniqueItems.filter(item => {
                const q = historyFilter.toLowerCase();
                return item.sku.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
              })
            : uniqueItems;

          return (
            <div
              key={record.id}
              className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:border-indigo-200 transition-all"
            >
              {/* Record Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px] font-black text-slate-600">
                    {dateStr} · {timeStr}
                  </span>
                </div>
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  {record.items.length} etiqueta{record.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              {/* Items */}
              <div className="divide-y divide-slate-50">
                {filteredItems.map((item, i) => {
                  const count = record.items.filter(x => x.sku === item.sku).length;
                  return (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                        ) : (
                          <Package className="w-4 h-4 text-slate-300 m-auto mt-2" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black text-slate-800 truncate leading-tight">
                          {item.name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 font-bold">
                          SKU: {item.sku}
                        </div>
                      </div>
                      {count > 1 && (
                        <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md flex-shrink-0">
                          ×{count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
