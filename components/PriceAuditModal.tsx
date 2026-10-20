import React, { useState } from 'react';
import { PricePendingItem, Product } from '../types';
import { formatAuditAge } from '../services/priceSnapshotService';
import {
  Tag,
  TrendingUp,
  Sparkles,
  Plus,
  Check,
  CheckCheck,
  X,
  RefreshCw,
  AlertCircle,
  Loader2,
  PackagePlus
} from 'lucide-react';

interface PriceAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingItems: PricePendingItem[];
  isLoading: boolean;
  onRefreshAudit: () => void;
  onAddProductToSheet: (product: Product) => void;
  onAddAllToSheet: (products: Product[]) => void;
  onDismissItem: (item: PricePendingItem) => void;
  onDismissAll: () => void;
  siteName?: string;
  /** FIX-0014: marca de la última auditoría exitosa (ms epoch) para mostrar frescura. */
  lastAuditAt?: number | null;
}

export const PriceAuditModal: React.FC<PriceAuditModalProps> = ({
  isOpen,
  onClose,
  pendingItems,
  isLoading,
  onRefreshAudit,
  onAddProductToSheet,
  onAddAllToSheet,
  onDismissItem,
  onDismissAll,
  siteName,
  lastAuditAt
}) => {
  const [filter, setFilter] = useState<'all' | 'changed' | 'new'>('all');
  const [addedIds, setAddedIds] = useState<Record<number, boolean>>({});

  if (!isOpen) return null;

  const filteredItems = pendingItems.filter(item => {
    if (filter === 'changed') return item.type === 'PRICE_CHANGED';
    if (filter === 'new') return item.type === 'NEW_PRODUCT';
    return true;
  });

  const changedCount = pendingItems.filter(i => i.type === 'PRICE_CHANGED').length;
  const newCount = pendingItems.filter(i => i.type === 'NEW_PRODUCT').length;
  // FIX-0014 AC-005: marca de frescura válida para mostrar la antigüedad de la auditoría.
  const hasAuditMark = typeof lastAuditAt === 'number' && Number.isFinite(lastAuditAt);

  const handleAdd = (item: PricePendingItem) => {
    onAddProductToSheet(item.product);
    setAddedIds(prev => ({ ...prev, [item.productId]: true }));
  };

  const handleAddAll = () => {
    const productsToAdd = filteredItems.map(i => i.product);
    onAddAllToSheet(productsToAdd);
    const newAdded: Record<number, boolean> = {};
    filteredItems.forEach(i => { newAdded[i.productId] = true; });
    setAddedIds(prev => ({ ...prev, ...newAdded }));
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm bg-slate-900/60 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-amber-500 to-indigo-600 text-white p-2.5 rounded-2xl shadow-md">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  Auditoría de Precios y Catálogo
                </h2>
                <span className="text-xs font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                  {pendingItems.length} pendientes
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                {siteName ? `Tienda: ${siteName}` : 'Comparación contra el último snapshot'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onRefreshAudit}
              disabled={isLoading}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-200/60 rounded-xl transition-all disabled:opacity-50"
              title="Volver a escanear catálogo"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-5 pt-3 pb-2 bg-white flex items-center justify-between border-b border-slate-100 text-xs">
          <div className="flex gap-1.5">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-black transition-all ${
                filter === 'all'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              Todos ({pendingItems.length})
            </button>
            <button
              onClick={() => setFilter('changed')}
              className={`px-3 py-1.5 rounded-lg font-black transition-all flex items-center gap-1.5 ${
                filter === 'changed'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              Cambio de Precio ({changedCount})
            </button>
            <button
              onClick={() => setFilter('new')}
              className={`px-3 py-1.5 rounded-lg font-black transition-all flex items-center gap-1.5 ${
                filter === 'new'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              Nuevos ({newCount})
            </button>
          </div>

          {filteredItems.length > 0 && (
            <button
              onClick={onDismissAll}
              className="text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors"
            >
              Descartar todos
            </button>
          )}
        </div>

        {/* Estado de frescura de la auditoría (FIX-0014 AC-005) */}
        <div className="px-5 py-2 bg-white border-b border-slate-100 flex items-center gap-1.5 text-[11px] font-bold">
          {hasAuditMark ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3] flex-shrink-0" />
              <span className="text-emerald-700 truncate">
                Auditoría al día · {formatAuditAge(lastAuditAt)}
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <span className="text-amber-700 truncate">Auditoría pendiente</span>
            </>
          )}
          <span className="ml-auto text-slate-400 font-semibold truncate hidden sm:inline">
            {isLoading ? 'Escaneando catálogo…' : 'Forzá el escaneo con el botón de actualizar'}
          </span>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-slate-50/50">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="text-sm font-bold">Verificando catálogo con WooCommerce...</p>
              <p className="text-[11px] text-slate-400 font-semibold">Comparando con los precios guardados en Firestore</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <h3 className="text-base font-black text-slate-800">¡Precios 100% al día!</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
                No se detectaron diferencias entre el catálogo de tu tienda y el snapshot guardado.
              </p>
            </div>
          ) : (
            filteredItems.map(item => {
              const isAdded = !!addedIds[item.productId];
              const isPriceChange = item.type === 'PRICE_CHANGED';
              const oldPrice = item.oldRegularPrice ?? 0;
              const newPrice = item.newRegularPrice;
              const priceDiff = newPrice - oldPrice;
              const percentDiff = oldPrice > 0 ? ((priceDiff / oldPrice) * 100).toFixed(0) : '0';

              return (
                <div
                  key={item.productId}
                  className="bg-white border-2 border-slate-200 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm hover:border-slate-300 transition-all"
                >
                  {/* Left: Product Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                      ) : (
                        <Tag className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            isPriceChange
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {isPriceChange ? 'Precio Cambiado' : 'Nuevo Producto'}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-slate-400 truncate">
                          SKU: {item.sku}
                        </span>
                      </div>
                      <h4 className="text-sm font-black text-slate-900 truncate mt-0.5">
                        {item.name}
                      </h4>
                    </div>
                  </div>

                  {/* Center: Price difference */}
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                    <div className="text-left sm:text-right">
                      {isPriceChange ? (
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="line-through text-slate-400 font-bold">
                              ${oldPrice.toLocaleString('es-AR')}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="font-black text-slate-900 text-sm">
                              ${newPrice.toLocaleString('es-AR')}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-black ${
                              priceDiff > 0 ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {priceDiff > 0 ? `+${percentDiff}%` : `${percentDiff}%`}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-emerald-700">
                            ${newPrice.toLocaleString('es-AR')}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold">
                            Precio de Catálogo
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleAdd(item)}
                        disabled={isAdded}
                        className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm ${
                          isAdded
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
                        }`}
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> En lista
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" /> Agregar
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => onDismissItem(item)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        title="Descartar cambio (marcar como al día)"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {filteredItems.length > 0 && (
          <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-500">
              {filteredItems.length} producto{filteredItems.length !== 1 ? 's' : ''} listo{filteredItems.length !== 1 ? 's' : ''} para reimprimir
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={handleAddAll}
                className="px-4 py-2.5 text-xs font-black bg-slate-900 text-white hover:bg-black rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95"
              >
                <PackagePlus className="w-4 h-4" />
                Agregar Todos a la Hoja
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
