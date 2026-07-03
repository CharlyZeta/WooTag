import React, { useState, useEffect, useRef } from 'react';
import { Product, WooConfig, WooCategory } from '../../types';
import { fetchProductBySku, fetchCategories, fetchProductsByCategory, fetchProductsByName } from '../../services/wooService';
import { downloadTemplate, parseXlsFile } from '../../utils/xlsImport';
import { logEvent } from '../../utils/ipLogger';
import { addProductToRoom } from '../../services/realtimeSession';
import {
  FileSpreadsheet, Download, Upload, AlertTriangle, AlertCircle, CheckCircle2,
  ScanLine, Smartphone, Globe, Search, Eraser, LayoutGrid, ChevronRight, BookOpen, Plus
} from 'lucide-react';

interface ImportTabProps {
  wooConfig: WooConfig | null;
  currentUser: any;
  isMobile: boolean;
  activeRoomId: string | null;
  roomRole: 'host' | 'guest' | null;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  onAddUniqueProduct: (p: Product) => void;
  onOpenConnection: () => void;
  onOpenHostModal: () => void;
  onOpenJoinModal: () => void;
  onOpenQrScanner: () => void;
  deviceId: string;
}

export const ImportTab: React.FC<ImportTabProps> = ({
  wooConfig,
  currentUser,
  isMobile,
  activeRoomId,
  roomRole,
  products,
  setProducts,
  onAddUniqueProduct,
  onOpenConnection,
  onOpenHostModal,
  onOpenJoinModal,
  onOpenQrScanner,
  deviceId,
}) => {
  const [skuSearch, setSkuSearch] = useState('');
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [categories, setCategories] = useState<WooCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);

  // Name search state
  const [nameSearch, setNameSearch] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState<Product[]>([]);
  const [isNameSearchLoading, setIsNameSearchLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // XLS Import state
  const [isXlsProcessing, setIsXlsProcessing] = useState(false);
  const [xlsErrors, setXlsErrors] = useState<string[]>([]);
  const [xlsWarnings, setXlsWarnings] = useState<string[]>([]);
  const [xlsSuccess, setXlsSuccess] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const xlsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wooConfig?.url) {
      fetchCategories(wooConfig).then(setCategories);
    }
  }, [wooConfig]);

  // Debounced name search
  const handleNameSearchChange = (value: string) => {
    setNameSearch(value);
    setNameSuggestions([]);
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    if (!value.trim() || value.trim().length < 2 || !wooConfig) {
      setShowSuggestions(false);
      return;
    }
    setIsNameSearchLoading(true);
    setShowSuggestions(true);
    nameDebounceRef.current = setTimeout(async () => {
      const results = await fetchProductsByName(value, wooConfig);
      setNameSuggestions(results);
      setIsNameSearchLoading(false);
    }, 400);
  };

  const handleSelectSuggestion = (product: Product) => {
    onAddUniqueProduct(product);
    setNameSearch('');
    setNameSuggestions([]);
    setShowSuggestions(false);
  };

  // XLS import handler
  const handleXlsFile = async (file: File) => {
    setIsXlsProcessing(true);
    setXlsErrors([]);
    setXlsWarnings([]);
    setXlsSuccess(null);
    try {
      const result = await parseXlsFile(file);
      setXlsErrors(result.errors);
      setXlsWarnings(result.warnings);
      if (result.products.length > 0) {
        // Asignar IDs únicos para permitir múltiples importaciones
        const withIds = result.products.map(p => ({ ...p, id: `${p.id}-${Date.now()}-${Math.random()}` }));
        setProducts(prev => [...prev, ...withIds]);
        setXlsSuccess(result.products.length);
        logEvent('xls_upload', { f: file.name, n: result.products.length });
      }
    } catch (e) {
      setXlsErrors(['Ocurrió un error inesperado al procesar el archivo.']);
    } finally {
      setIsXlsProcessing(false);
      if (xlsInputRef.current) xlsInputRef.current.value = '';
    }
  };

  const handleXlsDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleXlsFile(file);
  };

  const handleXlsInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleXlsFile(file);
  };

  const handleSearch = async () => {
    if (!skuSearch) return;
    if (!wooConfig) {
      setFetchError("Debes conectar una tienda primero.");
      return;
    }
    setIsSearchLoading(true);
    setFetchError(null);
    try {
      const wooProduct = await fetchProductBySku(skuSearch, wooConfig);
      if (wooProduct) {
        onAddUniqueProduct(wooProduct);
        setSkuSearch('');
      } else {
        setFetchError("SKU no encontrado.");
      }
    } catch (err) {
      setFetchError("Error de red.");
    } finally {
      setIsSearchLoading(false);
    }
  };

  const handleImportCategory = async () => {
    if (!selectedCat || !wooConfig) return;
    setIsImporting(true);
    try {
      const catProducts = await fetchProductsByCategory(Number(selectedCat), wooConfig);
      const newItems = catProducts.map(p => ({ ...p, id: `${p.id}-${Date.now()}-${Math.random()}` }));
      setProducts(prev => [...prev, ...newItems]);
    } catch (err) {
      setFetchError("Error al importar categoría.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
      {/* XLS Import (siempre disponible) */}
      <div className="space-y-3">
        <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> IMPORTAR PLANILLA XLS
        </label>

        {/* Botón descargar plantilla */}
        <button
          onClick={downloadTemplate}
          className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-emerald-200 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-black hover:bg-emerald-100 hover:border-emerald-400 transition-all"
        >
          <Download className="w-4 h-4" />
          Descargar Plantilla (.xlsx)
        </button>

        {/* Área drag & drop */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleXlsDrop}
          onClick={() => xlsInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-6 px-4 cursor-pointer transition-all
            ${isDragOver
              ? 'border-emerald-500 bg-emerald-50 scale-[1.01]'
              : isXlsProcessing
                ? 'border-indigo-300 bg-indigo-50 cursor-default'
                : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/50'
            }`}
        >
          <input
            ref={xlsInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleXlsInputChange}
            disabled={isXlsProcessing}
          />
          {isXlsProcessing ? (
            <>
              <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-indigo-600">Procesando planilla...</span>
            </>
          ) : (
            <>
              <Upload className={`w-6 h-6 transition-colors ${isDragOver ? 'text-emerald-600' : 'text-slate-400'}`} />
              <div className="text-center">
                <p className="text-xs font-black text-slate-700">Arrastrá el archivo aquí</p>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">o hacé clic para seleccionarlo</p>
              </div>
              <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">.xlsx / .xls · máx 5 MB</span>
            </>
          )}
        </div>

        {/* Errores */}
        {xlsErrors.length > 0 && (
          <div className="space-y-1">
            {xlsErrors.map((err, i) => (
              <div key={i} className="flex gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-700 font-bold leading-snug">{err}</p>
              </div>
            ))}
          </div>
        )}

        {/* Advertencias */}
        {xlsWarnings.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {xlsWarnings.map((w, i) => (
              <div key={i} className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 font-bold leading-snug">{w}</p>
              </div>
            ))}
          </div>
        )}

        {/* Éxito */}
        {xlsSuccess !== null && xlsSuccess > 0 && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <p className="text-xs text-emerald-700 font-black">
              {xlsSuccess} producto{xlsSuccess !== 1 ? 's' : ''} importado{xlsSuccess !== 1 ? 's' : ''} exitosamente
            </p>
          </div>
        )}
      </div>

      {/* QR Scanner (solo con tienda conectada) */}
      {wooConfig && (
        <div className="space-y-3">
          <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-violet-600" /> ESCANEAR QR
          </label>
          <button
            onClick={onOpenQrScanner}
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-black text-sm hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-violet-100 active:scale-[0.98]"
          >
            <ScanLine className="w-5 h-5" />
            Abrir Cámara y Escanear
          </button>
          <p className="text-[10px] text-slate-400 font-bold text-center">
            Escaneá los QR de tus etiquetas para reimprimir con precios actualizados
          </p>
        </div>
      )}

      {/* Companion Mode: solo se muestra si NO hay usuario logueado como método alternativo */}
      {!isMobile && !currentUser && !activeRoomId && (
        <div className="space-y-3 pt-6 border-t-2 border-slate-100">
          <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-500" /> VINCULAR CELULAR INVITADO
          </label>
          <button
            onClick={onOpenHostModal}
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-emerald-50 text-emerald-700 border-2 border-emerald-200 rounded-xl font-black text-sm hover:bg-emerald-100 transition-all active:scale-[0.98]"
          >
            <Smartphone className="w-5 h-5" />
            Generar QR de PC
          </button>
          <p className="text-[10px] text-slate-400 font-bold text-center">
            Usá esta opción para que un celular externo escanee sin iniciar sesión.
          </p>
        </div>
      )}

      {isMobile && !currentUser && !wooConfig && (
        <div className="space-y-3 pt-6 border-t-2 border-slate-100">
          <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-500" /> UNIRSE A PC
          </label>
          <button
            onClick={onOpenJoinModal}
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-emerald-50 text-emerald-700 border-2 border-emerald-200 rounded-xl font-black text-sm hover:bg-emerald-100 transition-all active:scale-[0.98]"
          >
            <Smartphone className="w-5 h-5" />
            Escanear QR de PC
          </button>
        </div>
      )}

      {/* API WooCommerce */}
      {!wooConfig ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center space-y-4">
          <div className="bg-indigo-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto text-indigo-500">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Importar desde WooCommerce</h3>
            <p className="text-xs text-slate-500 mt-1 px-4">Conecta tu tienda para buscar e importar productos por SKU, nombre o categoría.</p>
          </div>
          <button
            onClick={onOpenConnection}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Conectar Tienda
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Separador */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> WooCommerce API
            </span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Buscar por SKU */}
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-500" /> IMPORTAR POR SKU
            </label>
            <div className="flex gap-2">
              <div className="relative flex-grow">
                <input
                  type="text"
                  value={skuSearch}
                  onChange={(e) => setSkuSearch(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Ej: T-SHIRT-001"
                  className="w-full pl-3 pr-10 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none text-sm font-bold text-slate-800 transition-all placeholder-slate-400"
                />
                {skuSearch && (
                  <button onClick={() => setSkuSearch('')} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600">
                    <Eraser className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={handleSearch}
                disabled={!skuSearch || isSearchLoading}
                className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-indigo-100"
              >
                {isSearchLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-5 h-5" />}
              </button>
            </div>
            {fetchError && (
              <p className="text-xs text-red-600 font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> {fetchError}
              </p>
            )}
          </div>

          {/* Buscar por nombre */}
          <div className="space-y-2 pt-4 border-t-2 border-slate-100">
            <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-500" /> BUSCAR POR NOMBRE
            </label>
            <div className="relative">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={nameSearch}
                  onChange={(e) => handleNameSearchChange(e.target.value)}
                  onFocus={() => nameSearch.trim().length >= 2 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                  placeholder="Escribí el nombre del producto..."
                  className="w-full pl-9 pr-10 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none text-sm font-bold text-slate-800 transition-all placeholder-slate-400"
                />
                {isNameSearchLoading && (
                  <div className="absolute right-3 top-3.5">
                    <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {nameSearch && !isNameSearchLoading && (
                  <button
                    onClick={() => { setNameSearch(''); setShowSuggestions(false); setNameSuggestions([]); }}
                    className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
                  >
                    <Eraser className="w-4 h-4" />
                  </button>
                )}
              </div>
              {showSuggestions && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-white border-2 border-indigo-200 rounded-2xl shadow-2xl shadow-indigo-100 overflow-hidden max-h-64 overflow-y-auto">
                  {nameSuggestions.length === 0 && !isNameSearchLoading && (
                    <div className="px-4 py-6 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">
                      Sin resultados para "{nameSearch}"
                    </div>
                  )}
                  {isNameSearchLoading && (
                    <div className="px-4 py-6 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">Buscando...</div>
                  )}
                  {nameSuggestions.map((p) => (
                    <button
                      key={p.id}
                      onMouseDown={() => handleSelectSuggestion(p)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-0 text-left group"
                    >
                      <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                        {p.image
                          ? <img src={p.image} alt={p.name} className="w-full h-full object-contain" />
                          : <div className="w-full h-full flex items-center justify-center text-slate-300 text-[10px]">—</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-black text-slate-800 truncate group-hover:text-indigo-700">{p.name}</div>
                        <div className="text-[10px] font-mono text-slate-400 font-bold">SKU: {p.sku}</div>
                      </div>
                      <Plus className="w-4 h-4 text-indigo-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Importar por categoría */}
          <div className="space-y-2 pt-4 border-t-2 border-slate-100">
            <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-indigo-500" /> IMPORTAR CATEGORÍA
            </label>
            <div className="flex gap-2">
              <div className="relative flex-grow">
                <select
                  value={selectedCat}
                  onChange={(e) => setSelectedCat(e.target.value)}
                  className="w-full appearance-none border-2 border-slate-200 rounded-xl py-3 pl-4 pr-10 text-sm font-bold text-slate-700 focus:border-indigo-500 outline-none bg-white transition-all cursor-pointer"
                >
                  <option value="">Seleccionar Categoría...</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.count})</option>
                  ))}
                </select>
                <ChevronRight className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none rotate-90" />
              </div>
              <button
                onClick={handleImportCategory}
                disabled={!selectedCat || isImporting}
                className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-indigo-100"
              >
                {isImporting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
