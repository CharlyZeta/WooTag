import React from 'react';
import { Product } from '../../types';
import { Trash2, Sparkles, Tags } from 'lucide-react';

interface DataTabProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  onOptimize: (productId: string) => void;
  optimizingId: string | null;
  onGoToImport: () => void;
}

export const DataTab: React.FC<DataTabProps> = ({
  products,
  setProducts,
  onOptimize,
  optimizingId,
  onGoToImport,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
          <Tags className="w-4 h-4 text-indigo-500" /> PRODUCTOS ({products.length})
        </label>
        {products.length > 0 && (
          <button
            onClick={() => setProducts([])}
            className="text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded bg-transparent transition-colors"
          >
            LIMPIAR TODO
          </button>
        )}
      </div>

      <div className="space-y-3">
        {products.map((p) => (
          <div
            key={p.id}
            className="bg-white border-2 border-slate-200 rounded-2xl p-3 flex items-center gap-3 group hover:border-indigo-200 transition-all shadow-sm"
          >
            <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden flex-shrink-0 border border-slate-100">
              <img src={p.image || ''} className="w-full h-full object-contain" alt={p.name} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-black truncate ${p.manageStock && Number(p.stockQuantity) <= 0 ? 'text-red-600 font-bold' : 'text-slate-900'}`}>
                {p.name}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-mono font-black ${p.manageStock && Number(p.stockQuantity) <= 0 ? 'text-red-400' : 'text-slate-600'}`}>SKU: {p.sku}</span>
                {p.manageStock && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                      Number(p.stockQuantity) <= 0
                        ? 'bg-red-100 text-red-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {p.stockQuantity ?? 0}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onOptimize(p.id)}
                disabled={optimizingId !== null}
                className="text-indigo-600 p-2 hover:bg-indigo-50 rounded-xl transition-colors"
                title="Optimizar con IA"
              >
                {optimizingId === p.id ? (
                  <div className="w-5 h-5 border-2 border-t-transparent border-indigo-600 rounded-full animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={() => setProducts((prev) => prev.filter((i) => i.id !== p.id))}
                className="text-slate-400 hover:text-red-700 p-2 transition-colors"
                title="Eliminar producto"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}

        {products.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
            <Tags className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-black">Tu lista está vacía</p>
            <p className="text-slate-400 text-[10px] mt-1 font-bold">
              Usá la pestaña <strong>Importar</strong> para agregar productos
            </p>
            <button
              onClick={onGoToImport}
              className="mt-3 text-xs font-black text-indigo-600 hover:text-indigo-800 underline underline-offset-2 transition-colors"
            >
              Ir a Importar →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
