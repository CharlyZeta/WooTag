import React from 'react';
import { TagConfig } from '../../types';
import { Layout, Eye, Calculator, MessageSquare } from 'lucide-react';

interface LayoutTabProps {
  config: TagConfig;
  setConfig: React.Dispatch<React.SetStateAction<TagConfig>>;
}

export const LayoutTab: React.FC<LayoutTabProps> = ({ config, setConfig }) => {
  const updateConfig = (key: keyof TagConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const VisibilityToggle = ({ label, propKey }: { label: string; propKey: keyof TagConfig }) => (
    <label className="flex items-center justify-between cursor-pointer py-2 group border-b border-gray-100 last:border-0">
      <span className="text-sm text-slate-900 group-hover:text-indigo-700 transition-colors font-bold">
        {label}
      </span>
      <input
        type="checkbox"
        checked={config[propKey] as boolean}
        onChange={(e) => updateConfig(propKey, e.target.checked)}
        className="rounded text-indigo-600 h-5 w-5 transition-transform active:scale-90 border-slate-300 focus:ring-indigo-500"
      />
    </label>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
      {/* DISTRIBUTION A4 */}
      <div className="space-y-4">
        <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
          <Layout className="w-4 h-4 text-indigo-500" /> DISTRIBUCIÓN A4
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-700 font-black uppercase ml-1">Columnas</label>
            <select
              value={config.layoutCols}
              onChange={(e) => updateConfig('layoutCols', Number(e.target.value))}
              className="w-full border-2 border-slate-300 rounded-xl p-3 text-sm font-black bg-white text-slate-900 focus:border-indigo-500 outline-none transition-all shadow-sm"
            >
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-700 font-black uppercase ml-1">Filas</label>
            <select
              value={config.layoutRows}
              onChange={(e) => updateConfig('layoutRows', Number(e.target.value))}
              className="w-full border-2 border-slate-300 rounded-xl p-3 text-sm font-black bg-white text-slate-900 focus:border-indigo-500 outline-none transition-all shadow-sm"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* VISIBLE FIELDS */}
      <div className="pt-6 border-t-2 border-slate-100 space-y-4">
        <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
          <Eye className="w-4 h-4 text-indigo-500" /> CAMPOS VISIBLES
        </label>
        <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-200 shadow-inner space-y-1">
          <VisibilityToggle label="Nombre del Producto" propKey="showTitle" />
          <VisibilityToggle label="Código SKU" propKey="showSku" />
          <VisibilityToggle label="Imagen del Producto" propKey="showImage" />
          <VisibilityToggle label="Descripción Breve" propKey="showDescription" />
          <VisibilityToggle label="Código QR" propKey="showQRCode" />
          <VisibilityToggle label="Precio de Oferta" propKey="showSalePrice" />
          <VisibilityToggle label="Símbolo de Moneda" propKey="showCurrencySymbol" />
          <VisibilityToggle label="Borde de Corte" propKey="showBorder" />
          <VisibilityToggle label="Decimales (.00)" propKey="showDecimals" />
          <VisibilityToggle label="Separador de miles" propKey="showThousandsSeparator" />
        </div>
      </div>

      {/* CUSTOM PRICE */}
      <div className="space-y-4 pt-6 border-t-2 border-slate-100">
        <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
          <Calculator className="w-4 h-4 text-indigo-500" /> PRECIO ESPECIAL
        </label>
        <div className="bg-indigo-50 p-4 rounded-2xl border-2 border-indigo-200 shadow-sm space-y-4">
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-sm font-black text-indigo-900">Activar Precio Extra</span>
            <input
              type="checkbox"
              checked={config.showCustomPrice}
              onChange={(e) => updateConfig('showCustomPrice', e.target.checked)}
              className="rounded text-indigo-700 h-6 w-6 border-indigo-400 focus:ring-indigo-500"
            />
          </label>
          {config.showCustomPrice && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="space-y-1.5">
                <label className="text-[10px] text-indigo-800 font-black uppercase ml-1">Etiqueta Personalizada</label>
                <input
                  type="text"
                  value={config.customPriceLabel}
                  onChange={(e) => updateConfig('customPriceLabel', e.target.value)}
                  placeholder="Ej: Mayorista"
                  className="w-full text-sm font-black border-2 border-indigo-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-slate-900"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] text-indigo-800 font-black uppercase ml-1">Variación %</label>
                  <input
                    type="number"
                    value={config.customPricePercent}
                    onChange={(e) => updateConfig('customPricePercent', Number(e.target.value))}
                    className="w-full text-sm font-black border-2 border-indigo-200 p-3 rounded-xl bg-white text-slate-900"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] text-indigo-800 font-black uppercase ml-1">Base</label>
                  <select
                    value={config.customPriceBase}
                    onChange={(e) => updateConfig('customPriceBase', e.target.value)}
                    className="w-full text-sm font-black border-2 border-indigo-200 p-3 rounded-xl bg-white text-slate-900 shadow-sm"
                  >
                    <option value="regular">Regular</option>
                    <option value="sale">Oferta</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-indigo-800 font-black uppercase ml-1">Posición</label>
                <select
                  value={config.customPricePosition}
                  onChange={(e) => updateConfig('customPricePosition', e.target.value)}
                  className="w-full text-sm font-black border-2 border-indigo-200 p-3 rounded-xl bg-white text-slate-900 shadow-sm"
                >
                  <option value="top">Arriba del precio</option>
                  <option value="bottom">Debajo del precio</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PRICE LEGEND */}
      <div className="space-y-4 pt-6 border-t-2 border-slate-100">
        <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-500" /> LEYENDA DE PRECIO
        </label>
        <div className="bg-indigo-50 p-4 rounded-2xl border-2 border-indigo-200 shadow-sm space-y-4">
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-sm font-black text-indigo-900">Mostrar Leyenda</span>
            <input
              type="checkbox"
              checked={config.showPriceLegend}
              onChange={(e) => updateConfig('showPriceLegend', e.target.checked)}
              className="rounded text-indigo-700 h-6 w-6 border-indigo-400 focus:ring-indigo-500"
            />
          </label>
          {config.showPriceLegend && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="space-y-1.5">
                <label className="text-[10px] text-indigo-800 font-black uppercase ml-1">Texto</label>
                <input
                  type="text"
                  value={config.priceLegendText}
                  onChange={(e) => updateConfig('priceLegendText', e.target.value)}
                  placeholder="Ej: IVA Incluido"
                  className="w-full text-sm font-black border-2 border-indigo-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-slate-900"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
