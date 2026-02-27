
import React, { useState, useEffect, useRef } from 'react';
import { APP_VERSION, PrintRecord, TagConfig, Product, WooConfig, WpUser, WooCategory, DesignProfile } from '../types';
import { fetchProductBySku, fetchCategories, fetchProductsByCategory, fetchProductsByName } from '../services/wooService';
import { downloadTemplate, parseXlsFile } from '../utils/xlsImport';
import {
  Settings, Layout, Type, Palette, Printer, Plus, Trash2, Sparkles, AlertCircle, LogOut, Image as ImageIcon, Layers, Calculator, Eye, Save, FolderOpen, Download, MessageSquare, Globe, Search, Eraser, LayoutGrid, ChevronRight, Tags, BookOpen, History, Clock, Package, FileSpreadsheet, Upload, AlertTriangle, CheckCircle2, PackagePlus
} from 'lucide-react';

interface ControlsProps {
  config: TagConfig;
  setConfig: (config: TagConfig) => void;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  wooConfig: WooConfig | null;
  user: WpUser | null;
  onOptimize: (productId: string) => void;
  optimizingId: string | null;
  onLogout: () => void;
  profiles: DesignProfile[];
  onSaveProfile: (name: string) => void;
  onLoadProfile: (id: string) => void;
  onDeleteProfile: (id: string) => void;
  onOpenConnection: () => void;
  onPrint: () => void;
  printLog: PrintRecord[];
  onClearPrintLog: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  config,
  setConfig,
  products,
  setProducts,
  wooConfig,
  user,
  onOptimize,
  optimizingId,
  onLogout,
  profiles,
  onSaveProfile,
  onLoadProfile,
  onDeleteProfile,
  onOpenConnection,
  onPrint,
  printLog,
  onClearPrintLog
}) => {
  const [activeTab, setActiveTab] = useState<'data' | 'import' | 'layout' | 'design' | 'history'>('data');
  const [skuSearch, setSkuSearch] = useState('');
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [categories, setCategories] = useState<WooCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileName, setProfileName] = useState('');

  // Name search state
  const [nameSearch, setNameSearch] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState<Product[]>([]);
  const [isNameSearchLoading, setIsNameSearchLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const nameDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // XLS Import state
  const [isXlsProcessing, setIsXlsProcessing] = useState(false);
  const [xlsErrors, setXlsErrors] = useState<string[]>([]);
  const [xlsWarnings, setXlsWarnings] = useState<string[]>([]);
  const [xlsSuccess, setXlsSuccess] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const xlsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wooConfig?.url && activeTab === 'data') {
      fetchCategories(wooConfig).then(setCategories);
    }
  }, [wooConfig, activeTab]);

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
    addUniqueProduct(product);
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
      }
    } catch (e) {
      setXlsErrors(['Ocurrió un error inesperado al procesar el archivo.']);
    } finally {
      setIsXlsProcessing(false);
      // Limpiar el input para permitir subir el mismo archivo de nuevo
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

  // History filter state
  const [historyFilter, setHistoryFilter] = useState('');

  const handleSaveCurrentProfile = () => {
    if (!profileName.trim()) return;
    onSaveProfile(profileName.trim());
    setProfileName('');
  };

  const addUniqueProduct = (p: Product) => {
    const isDuplicate = products.some(existing => existing.sku === p.sku);
    if (isDuplicate) {
      if (!confirm(`El producto con SKU ${p.sku} ya está en la lista. ¿Deseas agregar otra etiqueta igual?`)) {
        return;
      }
    }
    const uniqueProduct = { ...p, id: `${p.id}-${Date.now()}-${Math.random()}` };
    setProducts(prev => [...prev, uniqueProduct]);
  };

  const handleSearch = async () => {
    if (!skuSearch) return;
    // Bug 4 fix: explicit guard instead of non-null assertion
    if (!wooConfig) {
      setFetchError("Debes conectar una tienda primero.");
      return;
    }
    setIsSearchLoading(true);
    setFetchError(null);
    try {
      const wooProduct = await fetchProductBySku(skuSearch, wooConfig);
      if (wooProduct) {
        addUniqueProduct(wooProduct);
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
    if (!selectedCat) return;
    setIsImporting(true);
    try {
      const catProducts = await fetchProductsByCategory(Number(selectedCat), wooConfig!);
      const newItems = catProducts.map(p => ({ ...p, id: `${p.id}-${Date.now()}-${Math.random()}` }));
      setProducts(prev => [...prev, ...newItems]);
    } catch (err) {
      setFetchError("Error al importar categoría.");
    } finally {
      setIsImporting(false);
    }
  };

  const updateConfig = (key: keyof TagConfig, value: any) => setConfig(prev => ({ ...prev, [key]: value }));

  // ─── Componente XLS Import Block (inline para acceder al estado del closure) ─
  const XlsImportBlock = () => (
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
  );

  const VisibilityToggle = ({ label, propKey }: { label: string, propKey: keyof TagConfig }) => (
    <label className="flex items-center justify-between cursor-pointer py-2 group border-b border-gray-100 last:border-0">
      <span className="text-sm text-slate-900 group-hover:text-indigo-700 transition-colors font-bold">{label}</span>
      <input
        type="checkbox"
        checked={config[propKey] as boolean}
        onChange={(e) => updateConfig(propKey, e.target.checked)}
        className="rounded text-indigo-600 h-5 w-5 transition-transform active:scale-90 border-slate-300 focus:ring-indigo-500"
      />
    </label>
  );

  const ColorInput = ({ label, propKey }: { label: string, propKey: keyof TagConfig }) => (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-slate-900 font-bold">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">{config[propKey] as string}</span>
        <input
          type="color"
          value={config[propKey] as string}
          onChange={(e) => updateConfig(propKey, e.target.value)}
          className="h-8 w-12 block bg-white border border-slate-300 cursor-pointer rounded-md overflow-hidden p-0.5 shadow-sm"
        />
      </div>
    </div>
  );

  return (
    <div className="bg-white h-screen flex flex-col border-r border-gray-300 w-full md:w-96 lg:w-[450px] shadow-2xl z-20 overflow-hidden">
      {/* Header & Connection Status */}
      {/* Header & Connection Status */}
      <div className="p-5 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-5">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-indigo-600 to-violet-600 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-200">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 leading-none tracking-tight">WooTag</h1>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Generador AI</span>
            </div>
          </div>

          {/* User Profile / Status */}
          {user ? (
            <div className="flex items-center gap-3 pl-4 border-l-2 border-slate-100">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-black text-slate-800 leading-tight">{user.name}</div>
                <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Conectado</div>
              </div>
              <button
                onClick={onLogout}
                className="group p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border-2 border-transparent hover:border-red-100"
                title="Cerrar Sesión"
              >
                <LogOut className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenConnection}
              className="text-xs font-black bg-slate-100 text-slate-600 px-3 py-2 rounded-xl hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-2 border-2 border-slate-200 hover:border-indigo-600"
            >
              <span className="w-2 h-2 bg-slate-400 rounded-full group-hover:bg-white" />
              Conectar
            </button>
          )}
        </div>

        {/* Global Actions */}
        <button
          type="button"
          onClick={onPrint}
          disabled={products.length === 0}
          className="w-full bg-slate-900 hover:bg-black disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-xl shadow-slate-200 disabled:shadow-none cursor-pointer group"
        >
          <span>IMPRIMIR ETIQUETAS</span>
          <Printer className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {[
          { id: 'data', icon: Layers, label: 'Lista' },
          { id: 'import', icon: PackagePlus, label: 'Importar' },
          { id: 'layout', icon: Settings, label: 'Ajustes' },
          { id: 'design', icon: Palette, label: 'Diseño' },
          { id: 'history', icon: History, label: 'Historial', badge: printLog.length > 0 ? printLog.length : null }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2.5 text-[9px] font-black uppercase tracking-tight flex flex-col items-center gap-1 transition-all border-b-2 relative ${activeTab === tab.id ? 'text-indigo-600 border-indigo-600 bg-indigo-50/50' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50'
              }`}
          >
            <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400'}`} />
            {tab.label}
            {'badge' in tab && tab.badge && (
              <span className="absolute top-1.5 right-1 bg-indigo-500 text-white text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-8 bg-white scrollbar-thin scrollbar-thumb-slate-200">
        {/* ─── TAB: LISTA DE PRODUCTOS ─────────────────────────────────── */}
        {activeTab === 'data' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
                <Tags className="w-4 h-4 text-indigo-500" /> PRODUCTOS ({products.length})
              </label>
              {products.length > 0 && (
                <button onClick={() => setProducts([])} className="text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded bg-transparent transition-colors">
                  LIMPIAR TODO
                </button>
              )}
            </div>
            <div className="space-y-3">
              {products.map((p) => (
                <div key={p.id} className="bg-white border-2 border-slate-200 rounded-2xl p-3 flex items-center gap-3 group hover:border-indigo-200 transition-all shadow-sm">
                  <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden flex-shrink-0 border border-slate-100">
                    <img src={p.image || ''} className="w-full h-full object-contain" alt={p.name} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black truncate text-slate-900">{p.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-600 font-mono font-black">SKU: {p.sku}</span>
                      {p.manageStock && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${Number(p.stockQuantity) <= 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {p.stockQuantity ?? 0}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onOptimize(p.id)} disabled={optimizingId !== null} className="text-indigo-600 p-2 hover:bg-indigo-50 rounded-xl transition-colors" title="Optimizar con IA">
                      {optimizingId === p.id ? <div className="w-5 h-5 border-2 border-t-transparent border-indigo-600 rounded-full animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    </button>
                    <button onClick={() => setProducts(products.filter(i => i.id !== p.id))} className="text-slate-400 hover:text-red-700 p-2 transition-colors"><Trash2 className="w-5 h-5" /></button>
                  </div>
                </div>
              ))}
              {products.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                  <Tags className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm font-black">Tu lista está vacía</p>
                  <p className="text-slate-400 text-[10px] mt-1 font-bold">Usá la pestaña <strong>Importar</strong> para agregar productos</p>
                  <button
                    onClick={() => setActiveTab('import')}
                    className="mt-3 text-xs font-black text-indigo-600 hover:text-indigo-800 underline underline-offset-2 transition-colors"
                  >
                    Ir a Importar →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB: IMPORTAR ───────────────────────────────────────────── */}
        {activeTab === 'import' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">

            {/* XLS Import (siempre disponible) */}
            <XlsImportBlock />

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
        )}

        {activeTab === 'layout' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="space-y-4">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2"><Layout className="w-4 h-4 text-indigo-500" /> DISTRIBUCIÓN A4</label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-700 font-black uppercase ml-1">Columnas</label>
                  <select value={config.layoutCols} onChange={(e) => updateConfig('layoutCols', Number(e.target.value))} className="w-full border-2 border-slate-300 rounded-xl p-3 text-sm font-black bg-white text-slate-900 focus:border-indigo-500 outline-none transition-all shadow-sm">{[1, 2, 3, 4].map(n => <option key={n}>{n}</option>)}</select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-700 font-black uppercase ml-1">Filas</label>
                  <select value={config.layoutRows} onChange={(e) => updateConfig('layoutRows', Number(e.target.value))} className="w-full border-2 border-slate-300 rounded-xl p-3 text-sm font-black bg-white text-slate-900 focus:border-indigo-500 outline-none transition-all shadow-sm">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n}>{n}</option>)}</select>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t-2 border-slate-100 space-y-4">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2"><Eye className="w-4 h-4 text-indigo-500" /> CAMPOS VISIBLES</label>
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

            <div className="space-y-4 pt-6 border-t-2 border-slate-100">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2"><Calculator className="w-4 h-4 text-indigo-500" /> PRECIO ESPECIAL</label>
              <div className="bg-indigo-50 p-4 rounded-2xl border-2 border-indigo-200 shadow-sm space-y-4">
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm font-black text-indigo-900">Activar Precio Extra</span>
                  <input type="checkbox" checked={config.showCustomPrice} onChange={(e) => updateConfig('showCustomPrice', e.target.checked)} className="rounded text-indigo-700 h-6 w-6 border-indigo-400 focus:ring-indigo-500" />
                </label>
                {config.showCustomPrice && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-indigo-800 font-black uppercase ml-1">Etiqueta Personalizada</label>
                      <input type="text" value={config.customPriceLabel} onChange={(e) => updateConfig('customPriceLabel', e.target.value)} placeholder="Ej: Mayorista" className="w-full text-sm font-black border-2 border-indigo-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-slate-900" />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] text-indigo-800 font-black uppercase ml-1">Variación %</label>
                        <input type="number" value={config.customPricePercent} onChange={(e) => updateConfig('customPricePercent', Number(e.target.value))} className="w-full text-sm font-black border-2 border-indigo-200 p-3 rounded-xl bg-white text-slate-900" />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] text-indigo-800 font-black uppercase ml-1">Base</label>
                        <select value={config.customPriceBase} onChange={(e) => updateConfig('customPriceBase', e.target.value)} className="w-full text-sm font-black border-2 border-indigo-200 p-3 rounded-xl bg-white text-slate-900 shadow-sm"><option value="regular">Regular</option><option value="sale">Oferta</option></select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-indigo-800 font-black uppercase ml-1">Posición</label>
                      <select value={config.customPricePosition} onChange={(e) => updateConfig('customPricePosition', e.target.value)} className="w-full text-sm font-black border-2 border-indigo-200 p-3 rounded-xl bg-white text-slate-900 shadow-sm">
                        <option value="top">Arriba del precio</option>
                        <option value="bottom">Debajo del precio</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t-2 border-slate-100">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2"><MessageSquare className="w-4 h-4 text-indigo-500" /> LEYENDA DE PRECIO</label>
              <div className="bg-indigo-50 p-4 rounded-2xl border-2 border-indigo-200 shadow-sm space-y-4">
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm font-black text-indigo-900">Mostrar Leyenda</span>
                  <input type="checkbox" checked={config.showPriceLegend} onChange={(e) => updateConfig('showPriceLegend', e.target.checked)} className="rounded text-indigo-700 h-6 w-6 border-indigo-400 focus:ring-indigo-500" />
                </label>
                {config.showPriceLegend && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-indigo-800 font-black uppercase ml-1">Texto</label>
                      <input type="text" value={config.priceLegendText} onChange={(e) => updateConfig('priceLegendText', e.target.value)} placeholder="Ej: IVA Incluido" className="w-full text-sm font-black border-2 border-indigo-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-slate-900" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'design' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
            {/* Profiles */}
            <div className="space-y-4">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2"><FolderOpen className="w-4 h-4 text-indigo-500" /> PERFILES DE DISEÑO</label>
              <div className="bg-slate-50 p-4 rounded-2xl space-y-5 border-2 border-slate-200">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Nuevo nombre..."
                    className="flex-1 text-sm font-black border-2 border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900 placeholder-slate-500 shadow-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveCurrentProfile()}
                  />
                  <button onClick={handleSaveCurrentProfile} className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md active:scale-95">
                    <Save className="w-6 h-6" />
                  </button>
                </div>
                {profiles.length > 0 ? (
                  <div className="space-y-2">
                    {profiles.map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-white p-3 rounded-xl border-2 border-slate-200 text-sm shadow-sm hover:border-indigo-400 transition-all group">
                        <span className="font-black text-slate-900 truncate mr-2">{p.name}</span>
                        <div className="flex gap-2">
                          <button onClick={() => onLoadProfile(p.id)} className="text-indigo-700 hover:bg-indigo-700 hover:text-white px-3 py-1.5 rounded-lg border-2 border-indigo-200 font-black text-xs transition-all uppercase">Cargar</button>
                          <button onClick={() => onDeleteProfile(p.id)} className="text-slate-400 hover:text-red-700 p-1.5 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 text-center font-black py-2 uppercase tracking-wider">Sin perfiles guardados</p>
                )}
              </div>
            </div>

            {/* Typography */}
            <div className="pt-6 border-t-2 border-slate-100 space-y-4">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2"><Type className="w-4 h-4 text-indigo-500" /> TAMAÑOS DE FUENTE</label>
              <div className="space-y-6 bg-slate-50 p-5 rounded-2xl border-2 border-slate-200">
                {[
                  { key: 'fontSizeTitle', label: 'Nombre Producto' },
                  { key: 'fontSizePrice', label: 'Precio Normal' },
                  { key: 'fontSizeSalePrice', label: 'Precio Oferta' },
                  { key: 'fontSizeCustomPrice', label: 'Precio Especial' },
                  { key: 'fontSizeCustomLabel', label: 'Leyenda P. Especial' },
                  { key: 'fontSizePriceLegend', label: 'Leyenda Precio' },
                  { key: 'fontSizeDesc', label: 'Descripción' },
                  { key: 'qrSize', label: 'Tamaño QR' }
                ].map(item => (
                  <div key={item.key} className="space-y-3">
                    <div className="flex justify-between text-[11px] font-black text-slate-800 uppercase tracking-tighter">
                      <span>{item.label}</span>
                      <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-md shadow-sm">{config[item.key as keyof TagConfig]}px</span>
                    </div>
                    <input type="range" min="8" max="80" value={config[item.key as keyof TagConfig] as number} onChange={(e) => updateConfig(item.key as any, Number(e.target.value))} className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                  </div>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div className="pt-6 border-t-2 border-slate-100 space-y-4">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2"><Palette className="w-4 h-4 text-indigo-500" /> COLORES DE TEXTO</label>
              <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-200 space-y-1">
                <ColorInput label="Título" propKey="colorTitle" />
                <ColorInput label="Precio" propKey="colorPrice" />
                <ColorInput label="Precio Oferta" propKey="colorSalePrice" />
                <ColorInput label="Precio Especial" propKey="colorCustomPrice" />
                <ColorInput label="Leyenda P. Especial" propKey="colorCustomLabel" />
                <ColorInput label="Leyenda Precio" propKey="colorPriceLegend" />
                <ColorInput label="Descripción" propKey="colorDesc" />
                <ColorInput label="Bordes" propKey="colorBorder" />
                <ColorInput label="Código QR" propKey="colorAccent" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
            {/* Search */}
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
                  <p className="text-slate-400 text-[10px] mt-1 font-bold">Cada vez que imprimas quedará guardado aquí</p>
                </div>
              )}
              {printLog
                .filter(record => {
                  if (!historyFilter.trim()) return true;
                  const q = historyFilter.toLowerCase();
                  return record.items.some(
                    item => item.sku.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
                  );
                })
                .map(record => {
                  const date = new Date(record.timestamp);
                  const dateStr = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
                  const timeStr = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
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
                    <div key={record.id} className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:border-indigo-200 transition-all">
                      {/* Record Header */}
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-[11px] font-black text-slate-600">{dateStr} · {timeStr}</span>
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
                                {item.image
                                  ? <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                                  : <Package className="w-4 h-4 text-slate-300 m-auto mt-2" />
                                }
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-black text-slate-800 truncate leading-tight">{item.name}</div>
                                <div className="text-[10px] font-mono text-slate-400 font-bold">SKU: {item.sku}</div>
                              </div>
                              {count > 1 && (
                                <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md flex-shrink-0">×{count}</span>
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
        )}
      </div>

      {/* Footer: App Version */}
      <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between bg-white no-print">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">WooTag AI</span>
        <span className="text-[10px] font-black text-slate-300 font-mono">v{APP_VERSION}</span>
      </div>

    </div>
  );
};
