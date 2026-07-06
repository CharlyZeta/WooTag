import React, { useState, useEffect, useRef } from 'react';
import { Product, WooConfig, WooCategory } from '../../types';
import { fetchProductBySku, fetchCategories, fetchProductsByCategory, fetchProductsByName } from '../../services/wooService';
import { downloadTemplate, parseXlsFile } from '../../utils/xlsImport';
import { logEvent } from '../../utils/ipLogger';
import {
  FileSpreadsheet, Download, Upload, AlertTriangle, AlertCircle, CheckCircle2,
  ScanLine, Smartphone, Globe, Search, Eraser, ChevronRight, ChevronDown, BookOpen, Plus, Loader2, ListTree, RefreshCw
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

interface TreeCategory {
  id: number;
  name: string;
  count: number;
  parent: number;
  slug: string;
  subcategories: TreeCategory[];
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
  // Tabs Internos de Importación
  const [activeSubTab, setActiveSubTab] = useState<'woo' | 'xls' | 'scan'>('woo');

  // WooCommerce Search Mode
  const [wooMode, setWooMode] = useState<'search' | 'tree'>('search');

  // Search State
  const [skuSearch, setSkuSearch] = useState('');
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Autocomplete Name State
  const [nameSearch, setNameSearch] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState<Product[]>([]);
  const [isNameSearchLoading, setIsNameSearchLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Category Tree State
  const [categories, setCategories] = useState<WooCategory[]>([]);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<number, boolean>>({});
  const [loadingCategories, setLoadingCategories] = useState<Record<number, boolean>>({});
  const [categoryProducts, setCategoryProducts] = useState<Record<number, Product[]>>({});
  const [selectedProducts, setSelectedProducts] = useState<Record<string, Product>>({});

  // XLS Import state
  const [isXlsProcessing, setIsXlsProcessing] = useState(false);
  const [xlsErrors, setXlsErrors] = useState<string[]>([]);
  const [xlsWarnings, setXlsWarnings] = useState<string[]>([]);
  const [xlsSuccess, setXlsSuccess] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const xlsInputRef = useRef<HTMLInputElement>(null);

  // Load Categories on connection
  useEffect(() => {
    if (wooConfig?.url) {
      setIsCategoriesLoading(true);
      fetchCategories(wooConfig)
        .then(setCategories)
        .catch(err => console.error("Error loading categories", err))
        .finally(() => setIsCategoriesLoading(false));
    } else {
      setCategories([]);
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

  // Build hierarchical categories tree
  const buildTree = (flat: WooCategory[]): TreeCategory[] => {
    const map: Record<number, TreeCategory> = {};
    const roots: TreeCategory[] = [];

    flat.forEach(cat => {
      map[cat.id] = { ...cat, subcategories: [] };
    });

    flat.forEach(cat => {
      const node = map[cat.id];
      if (cat.parent === 0) {
        roots.push(node);
      } else {
        const parentNode = map[cat.parent];
        if (parentNode) {
          parentNode.subcategories.push(node);
        } else {
          roots.push(node);
        }
      }
    });

    return roots;
  };

  // Toggle category node expansion & load products
  const handleToggleCategory = async (catId: number) => {
    const nextExpanded = !expandedCategories[catId];
    setExpandedCategories(prev => ({ ...prev, [catId]: nextExpanded }));

    if (nextExpanded && !categoryProducts[catId] && wooConfig) {
      setLoadingCategories(prev => ({ ...prev, [catId]: true }));
      try {
        const prods = await fetchProductsByCategory(catId, wooConfig);
        setCategoryProducts(prev => ({ ...prev, [catId]: prods }));
      } catch (e) {
        console.error("Error loading products for category", catId, e);
      } finally {
        setLoadingCategories(prev => ({ ...prev, [catId]: false }));
      }
    }
  };

  // Select all products in category / subcategory
  const handleToggleCategoryCheckbox = async (catId: number, e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (!wooConfig) return;

    const catProducts = categoryProducts[catId] || [];
    const hasLoaded = !!categoryProducts[catId];

    if (!hasLoaded) {
      setLoadingCategories(prev => ({ ...prev, [catId]: true }));
      setExpandedCategories(prev => ({ ...prev, [catId]: true }));
      try {
        const prods = await fetchProductsByCategory(catId, wooConfig);
        setCategoryProducts(prev => ({ ...prev, [catId]: prods }));
        setSelectedProducts(prev => {
          const next = { ...prev };
          prods.forEach(p => {
            next[p.id] = p;
          });
          return next;
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingCategories(prev => ({ ...prev, [catId]: false }));
      }
    } else {
      const allSelected = catProducts.every(p => selectedProducts[p.id]);
      setSelectedProducts(prev => {
        const next = { ...prev };
        if (allSelected) {
          catProducts.forEach(p => {
            delete next[p.id];
          });
        } else {
          catProducts.forEach(p => {
            next[p.id] = p;
          });
        }
        return next;
      });
    }
  };

  const handleToggleProduct = (prod: Product) => {
    setSelectedProducts(prev => {
      const next = { ...prev };
      if (next[prod.id]) {
        delete next[prod.id];
      } else {
        next[prod.id] = prod;
      }
      return next;
    });
  };

  const handleImportSelected = () => {
    const selectedList = Object.values(selectedProducts);
    if (selectedList.length === 0) return;

    const withUniqueIds = selectedList.map(p => ({
      ...p,
      id: `${p.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    }));

    setProducts(prev => [...prev, ...withUniqueIds]);
    setSelectedProducts({});
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

  const categoryTree = buildTree(categories);

  const renderCategoryNode = (cat: TreeCategory, depth = 0) => {
    const isExpanded = expandedCategories[cat.id] || false;
    const isLoading = loadingCategories[cat.id] || false;
    const catProducts = categoryProducts[cat.id] || [];
    const hasSubcats = cat.subcategories.length > 0;

    const isChecked = catProducts.length > 0 && catProducts.every(p => selectedProducts[p.id]);
    const isIndeterminate = catProducts.length > 0 && catProducts.some(p => selectedProducts[p.id]) && !isChecked;

    return (
      <div key={cat.id} className="space-y-1">
        <div
          onClick={() => handleToggleCategory(cat.id)}
          className={`flex items-center justify-between p-2 rounded-xl cursor-pointer hover:bg-slate-50 border border-transparent transition-all ${
            isExpanded ? 'bg-slate-50/50' : ''
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="checkbox"
              checked={isChecked}
              ref={el => {
                if (el) el.indeterminate = isIndeterminate;
              }}
              onClick={e => e.stopPropagation()}
              onChange={e => handleToggleCategoryCheckbox(cat.id, e as any)}
              className="rounded text-indigo-600 h-4 w-4 border-slate-300 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="text-slate-400 flex-shrink-0">
              {hasSubcats || cat.count > 0 ? (
                isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <div className="w-3.5" />
              )}
            </span>
            <span className="text-xs font-black text-slate-800 truncate">{cat.name}</span>
            <span className="text-[10px] text-slate-400 font-bold flex-shrink-0">({cat.count})</span>
          </div>

          {isLoading && (
            <Loader2 className="w-3 h-3 text-indigo-600 animate-spin flex-shrink-0" />
          )}
        </div>

        {isExpanded && (
          <div className="space-y-1 mt-0.5 border-l-2 border-slate-100 ml-4 pl-2">
            {cat.subcategories.map(sub => renderCategoryNode(sub, depth + 1))}

            {isLoading && (
              <div className="py-2 pl-4 flex items-center gap-2 text-[10px] font-bold text-indigo-500 uppercase">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Cargando productos...
              </div>
            )}

            {!isLoading && catProducts.map(p => {
              const isProdSelected = !!selectedProducts[p.id];
              return (
                <div
                  key={p.id}
                  onClick={() => handleToggleProduct(p)}
                  className={`flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-all border ${
                    isProdSelected ? 'border-indigo-100 bg-indigo-50/20' : 'border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isProdSelected}
                    onChange={() => {}}
                    onClick={e => e.stopPropagation()}
                    className="rounded text-indigo-600 h-4 w-4 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="w-7 h-7 rounded bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
                    {p.image ? (
                      <img src={p.image} className="w-full h-full object-contain" alt={p.name} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-300 font-bold">—</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-black text-slate-800 truncate">{p.name}</div>
                    <div className="text-[9px] font-mono text-slate-400 font-bold">SKU: {p.sku}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Sub-Tabs Superiores */}
      <div className="flex border-b border-gray-100 bg-slate-50/80 p-1 rounded-xl">
        {[
          { id: 'woo', icon: Globe, label: 'WooCommerce' },
          { id: 'xls', icon: FileSpreadsheet, label: 'Planilla Excel' },
          { id: 'scan', icon: Smartphone, label: 'Escáner & Móvil' }
        ].map(subTab => (
          <button
            key={subTab.id}
            onClick={() => setActiveSubTab(subTab.id as any)}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-1.5 rounded-lg transition-all ${
              activeSubTab === subTab.id
                ? 'bg-white text-indigo-600 shadow-md shadow-slate-100'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
            }`}
          >
            <subTab.icon className="w-3.5 h-3.5" />
            {subTab.label}
          </button>
        ))}
      </div>

      {/* ── SUB-TAB: WOOCOMMERCE ────────────────────────────────────── */}
      <div className={activeSubTab === 'woo' ? 'space-y-6' : 'hidden'}>
        {!wooConfig ? (
          <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center space-y-4">
            <div className="bg-indigo-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto text-indigo-500">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Conectar WooCommerce</h3>
              <p className="text-xs text-slate-500 mt-1 px-4">
                Conecta tu tienda para buscar por SKU, autocompletar por nombre o explorar la jerarquía de categorías.
              </p>
            </div>
            <button
              onClick={onOpenConnection}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Conectar Tienda
            </button>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Buscador Global Consolidado */}
            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
                <Search className="w-4 h-4 text-indigo-500" /> BÚSQUEDA RÁPIDA
              </label>
              <div className="flex gap-2">
                <div className="relative flex-grow">
                  <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={nameSearch}
                    onChange={(e) => handleNameSearchChange(e.target.value)}
                    onFocus={() => nameSearch.trim().length >= 2 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                    placeholder="Buscar por Nombre o SKU..."
                    className="w-full pl-9 pr-10 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none text-sm font-bold text-slate-800 transition-all placeholder-slate-400"
                  />
                  {isNameSearchLoading && (
                    <div className="absolute right-3 top-3.5">
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
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

                <button
                  onClick={onOpenQrScanner}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 p-3 rounded-xl transition-all border-2 border-indigo-100 hover:border-indigo-200 flex-shrink-0"
                  title="Escanear con Cámara"
                >
                  <ScanLine className="w-5 h-5" />
                </button>
              </div>

              {/* Suggestions Dropdown */}
              {showSuggestions && (
                <div className="absolute left-5 right-5 z-50 bg-white border-2 border-indigo-200 rounded-2xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
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
                        {p.image ? (
                          <img src={p.image} alt={p.name} className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300 text-[10px]">—</div>
                        )}
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

            {/* Alternador de Modo de Exploración */}
            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                onClick={() => setWooMode('search')}
                className={`flex-1 py-1.5 text-xs font-black uppercase rounded-lg transition-all ${
                  wooMode === 'search' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Buscar SKU
              </button>
              <button
                onClick={() => setWooMode('tree')}
                className={`flex-1 py-1.5 text-xs font-black uppercase rounded-lg transition-all ${
                  wooMode === 'tree' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Explorar Árbol
              </button>
            </div>

            {/* MODO: BUSCADOR SKU MANUAL */}
            {wooMode === 'search' && (
              <div className="space-y-2 animate-in fade-in duration-200">
                <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
                  <Search className="w-4 h-4 text-indigo-500" /> IMPORTAR POR SKU EXACTO
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={skuSearch}
                    onChange={(e) => setSkuSearch(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Ej: T-SHIRT-001"
                    className="w-full px-3 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none text-sm font-bold text-slate-800 transition-all placeholder-slate-400"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={!skuSearch || isSearchLoading}
                    className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                  >
                    {isSearchLoading ? <Loader2 className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-5 h-5" />}
                  </button>
                </div>
                {fetchError && (
                  <p className="text-xs text-red-600 font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> {fetchError}
                  </p>
                )}
              </div>
            )}

            {/* MODO: EXPLORADOR ÁRBOL */}
            {wooMode === 'tree' && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center justify-between">
                  <span className="flex items-center gap-2"><ListTree className="w-4 h-4 text-indigo-500" /> ÁRBOL DE CATEGORÍAS</span>
                  <button
                    onClick={() => {
                      setIsCategoriesLoading(true);
                      fetchCategories(wooConfig)
                        .then(setCategories)
                        .finally(() => setIsCategoriesLoading(false));
                    }}
                    className="text-indigo-600 hover:text-indigo-800 transition-colors"
                    title="Actualizar catálogo"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </label>

                {isCategoriesLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    <p className="text-sm font-black text-slate-700">Cargando catálogo de WooCommerce...</p>
                    <p className="text-[10px] text-slate-400 font-bold">Esto puede demorar unos segundos</p>
                  </div>
                ) : (
                  <div className="border-2 border-slate-100 rounded-2xl p-3 bg-white space-y-1 max-h-96 overflow-y-auto">
                    {categoryTree.map(cat => renderCategoryNode(cat))}
                    {categoryTree.length === 0 && (
                      <p className="text-xs text-slate-400 font-bold text-center py-6">
                        No se encontraron categorías en la tienda.
                      </p>
                    )}
                  </div>
                )}

                {/* Floating Banner for Selected Items */}
                {Object.keys(selectedProducts).length > 0 && (
                  <div className="flex items-center justify-between bg-indigo-600 text-white px-4 py-3 rounded-2xl shadow-xl shadow-indigo-100 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex flex-col">
                      <span className="text-xs font-black">
                        {Object.keys(selectedProducts).length} producto{Object.keys(selectedProducts).length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[9px] text-indigo-200 font-bold">Seleccionados para importar</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedProducts({})}
                        className="text-xs font-bold px-3 py-1.5 hover:bg-indigo-700 rounded-xl transition-all"
                      >
                        Limpiar
                      </button>
                      <button
                        onClick={handleImportSelected}
                        className="text-xs font-black bg-white text-indigo-600 px-3 py-1.5 hover:bg-slate-50 rounded-xl transition-all shadow-md active:scale-95"
                      >
                        Importar a Lista
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SUB-TAB: PLANILLA EXCEL ─────────────────────────────────── */}
      <div className={activeSubTab === 'xls' ? 'space-y-6' : 'hidden'}>
        <div className="space-y-3 animate-in fade-in duration-300">
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
                <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
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
      </div>

      {/* ── SUB-TAB: ESCÁNER Y MÓVIL ────────────────────────────────── */}
      <div className={activeSubTab === 'scan' ? 'space-y-6' : 'hidden'}>
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* QR Scanner Trigger */}
          {wooConfig && (
            <div className="space-y-3">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-violet-600" /> ESCANEAR QR CON CÁMARA
              </label>
              <button
                onClick={onOpenQrScanner}
                className="w-full flex items-center justify-center gap-3 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-black text-sm hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-violet-100 active:scale-[0.98]"
              >
                <ScanLine className="w-5 h-5" />
                Abrir Cámara y Escanear
              </button>
              <p className="text-[10px] text-slate-400 font-bold text-center">
                Escaneá los QR de tus etiquetas para reimprimir con precios de la tienda
              </p>
            </div>
          )}

          {/* Companion Mode: Host QR */}
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

          {/* Companion Mode: Join Scanner */}
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
        </div>
      </div>
    </div>
  );
};
