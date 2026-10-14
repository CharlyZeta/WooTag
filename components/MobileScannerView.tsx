import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  CameraOff,
  Search,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Trash2,
  Plus,
  Monitor,
  Layers,
  ShoppingBag,
  ArrowRight,
  RefreshCw,
  Printer,
  ChevronRight,
  ExternalLink,
  Volume2
} from 'lucide-react';
import { Product, TagConfig, WooConfig, PricePendingItem } from '../types';
import { fetchProductBySku } from '../services/wooService';
import { calculateSheetOptimization } from '../utils/sheetOptimizer';
import { playScanSuccessFeedback, triggerHaptic } from '../services/soundHapticService';

interface MobileScannerViewProps {
  products: Product[];
  config: TagConfig;
  wooConfig: WooConfig | null;
  siteName?: string;
  isCloudConnected?: boolean;
  pricePendings?: PricePendingItem[];
  onAddProduct: (product: Product) => void;
  onRemoveProduct: (productId: string) => void;
  onClearProducts: () => void;
  onSwitchToDesktopView: () => void;
  onPrint?: () => void;
}

export const MobileScannerView: React.FC<MobileScannerViewProps> = ({
  products,
  config,
  wooConfig,
  siteName = 'Tienda WooCommerce',
  isCloudConnected = false,
  pricePendings = [],
  onAddProduct,
  onRemoveProduct,
  onClearProducts,
  onSwitchToDesktopView,
  onPrint,
}) => {
  // Scanner state
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isStartingCamera, setIsStartingCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [autoAddOnScan, setAutoAddOnScan] = useState<boolean>(true);

  // Manual search input
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Last scanned product info & comparison
  const [lastScannedResult, setLastScannedResult] = useState<{
    product: Product;
    auditPending?: PricePendingItem;
    timestamp: number;
  } | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedSkuRef = useRef<string>('');
  const cooldownRef = useRef<boolean>(false);

  // Optimizer calculation
  const optimizer = useMemo(() => {
    return calculateSheetOptimization(products.length, config.layoutCols, config.layoutRows);
  }, [products.length, config.layoutCols, config.layoutRows]);

  // Auditoría: Map rápido por productId y por SKU para detección instantánea
  const pendingsMap = useMemo(() => {
    const byId = new Map<number, PricePendingItem>();
    const bySku = new Map<string, PricePendingItem>();
    pricePendings.forEach(item => {
      byId.set(item.productId, item);
      if (item.sku) bySku.set(item.sku.trim().toUpperCase(), item);
    });
    return { byId, bySku };
  }, [pricePendings]);

  // Handler para procesar y agregar producto con feedback
  const handleProcessProduct = useCallback((product: Product) => {
    const numId = Number(product.id);
    const skuKey = (product.sku || '').trim().toUpperCase();
    const auditPending = pendingsMap.byId.get(numId) || pendingsMap.bySku.get(skuKey);

    setLastScannedResult({
      product,
      auditPending,
      timestamp: Date.now(),
    });

    onAddProduct(product);
    playScanSuccessFeedback();
  }, [pendingsMap, onAddProduct]);

  // Handle scan from camera
  const handleDecodedText = useCallback(async (decodedText: string) => {
    const sku = decodedText.trim().toUpperCase();
    if (!sku) return;

    if (cooldownRef.current || sku === lastScannedSkuRef.current) return;
    cooldownRef.current = true;
    lastScannedSkuRef.current = sku;

    if (!wooConfig) {
      setCameraError('Conectá una tienda WooCommerce para escanear');
      setTimeout(() => { cooldownRef.current = false; }, 2000);
      return;
    }

    try {
      setSearchError(null);
      const product = await fetchProductBySku(sku, wooConfig);
      if (product) {
        if (autoAddOnScan) {
          handleProcessProduct(product);
        } else {
          const numId = Number(product.id);
          const auditPending = pendingsMap.byId.get(numId) || pendingsMap.bySku.get(sku);
          setLastScannedResult({ product, auditPending, timestamp: Date.now() });
          triggerHaptic(30);
        }
      } else {
        setSearchError(`SKU no encontrado: ${sku}`);
      }
    } catch (err: any) {
      setSearchError(`Error al buscar SKU ${sku}: ${err?.message || 'Error de conexión'}`);
    } finally {
      setTimeout(() => {
        cooldownRef.current = false;
        lastScannedSkuRef.current = '';
      }, 1800);
    }
  }, [wooConfig, autoAddOnScan, handleProcessProduct, pendingsMap]);

  // Iniciar cámara
  const startCamera = useCallback(async () => {
    if (scannerRef.current) return;
    setIsStartingCamera(true);
    setCameraError(null);

    try {
      const elementId = 'gondola-camera-viewport';
      const scanner = new Html5Qrcode(elementId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 12,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1,
        },
        (decodedText) => {
          handleDecodedText(decodedText);
        },
        () => { /* ignorar frames sin código */ }
      );

      setIsCameraActive(true);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setCameraError('Permiso de cámara denegado en el navegador.');
      } else if (msg.includes('NotFound') || msg.includes('Requested device not found')) {
        setCameraError('No se encontró cámara disponible en el dispositivo.');
      } else {
        setCameraError(`No se pudo iniciar la cámara: ${msg}`);
      }
      scannerRef.current = null;
      setIsCameraActive(false);
    } finally {
      setIsStartingCamera(false);
    }
  }, [handleDecodedText]);

  // Detener cámara
  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) { // SCANNING
          await scannerRef.current.stop();
        }
      } catch {}
      try {
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Búsqueda manual
  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim().toUpperCase();
    if (!query || !wooConfig || isSearching) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const product = await fetchProductBySku(query, wooConfig);
      if (product) {
        handleProcessProduct(product);
        setSearchQuery('');
      } else {
        setSearchError(`No se encontró ningún producto con el código o SKU "${query}"`);
      }
    } catch (err: any) {
      setSearchError(`Error al consultar producto: ${err?.message || 'Error de red'}`);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans pb-16">
      {/* 1. Header Móvil */}
      <header className="sticky top-0 z-30 bg-slate-800/95 backdrop-blur border-b border-slate-700/80 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
            <ShoppingBag className="w-4 h-4 text-white" />
          </div>
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
              <span>{siteName}</span>
              {isCloudConnected ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Sincronizado en la Nube" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Modo Local" />
              )}
            </h1>
            <p className="text-[11px] text-slate-400 truncate">Modo Góndola / Operador</p>
          </div>
        </div>

        <button
          onClick={onSwitchToDesktopView}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 shrink-0 transition-colors shadow-sm"
          title="Cambiar a Vista Completa (PC / Tablet)"
        >
          <Monitor className="w-3.5 h-3.5 text-indigo-400" />
          <span>Vista PC</span>
        </button>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto p-4 space-y-4">
        {/* 2. Tarjeta Optimizadora de Hojas A4 */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Aprovechamiento Hoja A4
              </span>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
              {optimizer.labelsPerPage} etiquetas/hoja
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
              <p className="text-[11px] text-slate-400 font-medium">Cargadas</p>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-black text-white">{optimizer.totalLabels}</span>
                <span className="text-xs text-slate-400">etiquetas</span>
              </div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
              <p className="text-[11px] text-slate-400 font-medium">
                {optimizer.isComplete ? 'Estado' : 'Faltan para cerrar hoja'}
              </p>
              <div className="flex items-baseline gap-1 mt-0.5">
                {optimizer.isComplete ? (
                  <span className="text-sm font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Hoja completa
                  </span>
                ) : (
                  <>
                    <span className="text-2xl font-black text-amber-400">{optimizer.remainingToComplete}</span>
                    <span className="text-xs text-slate-400">para hoja {optimizer.totalPages || 1}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Barra de progreso */}
          <div className="space-y-1">
            <div className="w-full bg-slate-700/80 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  optimizer.isComplete ? 'bg-emerald-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${optimizer.progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 font-medium pt-0.5">
              <span>Hoja actual: {optimizer.currentSheetFilled} / {optimizer.labelsPerPage}</span>
              <span>{Math.round(optimizer.progressPercent)}% optimizada</span>
            </div>
          </div>
        </div>

        {/* 3. Área de Escaneo / Cámara */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-indigo-400" />
              Lector QR / Código de Barras
            </span>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoAddOnScan}
                onChange={(e) => setAutoAddOnScan(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
              />
              <span>Auto-agregar</span>
            </label>
          </div>

          {/* Viewport para Html5Qrcode */}
          <div className="relative overflow-hidden rounded-xl bg-black border border-slate-700 min-h-[220px] flex flex-col items-center justify-center">
            <div
              id="gondola-camera-viewport"
              className={`w-full max-w-[280px] aspect-square ${!isCameraActive ? 'hidden' : ''}`}
            />

            {!isCameraActive && (
              <div className="p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
                  <CameraOff className="w-6 h-6" />
                </div>
                <p className="text-xs text-slate-400 max-w-xs">
                  {isStartingCamera ? 'Iniciando cámara...' : 'La cámara está pausada para ahorrar batería.'}
                </p>
                <button
                  type="button"
                  onClick={startCamera}
                  disabled={isStartingCamera}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-md flex items-center gap-2 mx-auto disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  <span>{isStartingCamera ? 'Abriendo visor...' : 'Activar Cámara'}</span>
                </button>
              </div>
            )}

            {isCameraActive && (
              <button
                type="button"
                onClick={stopCamera}
                className="absolute top-2 right-2 z-10 px-2.5 py-1 rounded-lg bg-black/60 hover:bg-black/80 text-white text-xs font-medium border border-slate-600/60 backdrop-blur transition-colors"
              >
                Pausar Cámara
              </button>
            )}
          </div>

          {cameraError && (
            <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Entrada de búsqueda rápida manual */}
          <form onSubmit={handleManualSearch} className="flex gap-2 pt-1">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ingresar SKU o Código..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
            >
              {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Buscar</span>
            </button>
          </form>

          {searchError && (
            <div className="p-2 rounded-lg bg-amber-950/50 border border-amber-800 text-amber-300 text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>{searchError}</span>
            </div>
          )}
        </div>

        {/* 4. Tarjeta de Último Producto Escaneado / Auditoría FEAT-0001 */}
        {lastScannedResult && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 shadow-lg space-y-2.5 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Último Producto Detectado
              </span>
              <span className="text-[10px] text-slate-500">
                {new Date(lastScannedResult.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <div className="flex gap-3 items-center">
              {lastScannedResult.product.image ? (
                <img
                  src={lastScannedResult.product.image}
                  alt={lastScannedResult.product.name}
                  className="w-12 h-12 object-cover rounded-lg border border-slate-700 shrink-0 bg-slate-900"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0 text-slate-500">
                  <ShoppingBag className="w-5 h-5" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-white truncate">{lastScannedResult.product.name}</h3>
                <p className="text-[11px] text-slate-400">SKU: <span className="font-mono text-slate-200">{lastScannedResult.product.sku || 'N/A'}</span></p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-sm font-extrabold text-emerald-400">
                    ${lastScannedResult.product.salePrice ?? lastScannedResult.product.price}
                  </span>
                  {lastScannedResult.product.salePrice && (
                    <span className="text-xs text-slate-500 line-through">
                      ${lastScannedResult.product.price}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Detección de Auditoría de Precios FEAT-0001 */}
            {lastScannedResult.auditPending ? (
              <div className="mt-2 p-2.5 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-200 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {lastScannedResult.auditPending.type === 'PRICE_CHANGED'
                      ? '¡Diferencia de precio en góndola!'
                      : '¡Producto nuevo sin etiqueta previa!'}
                  </span>
                </div>
                {lastScannedResult.auditPending.type === 'PRICE_CHANGED' && (
                  <p className="text-[11px] text-amber-300/90">
                    Precio anterior en góndola: <span className="line-through">${lastScannedResult.auditPending.oldRegularPrice}</span> → Precio actual: <span className="font-bold text-white">${lastScannedResult.auditPending.newRegularPrice}</span>
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Precio al día respecto al catálogo.</span>
              </div>
            )}

            {!autoAddOnScan && (
              <button
                type="button"
                onClick={() => handleProcessProduct(lastScannedResult.product)}
                className="w-full mt-2 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar a la lista de impresión</span>
              </button>
            )}
          </div>
        )}

        {/* 5. Lista de Etiquetas Cargadas */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Etiquetas en la cola ({products.length})
            </span>
            {products.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('¿Seguro que deseas vaciar todas las etiquetas cargadas?')) {
                    onClearProducts();
                  }
                }}
                className="text-xs text-red-400 hover:text-red-300 font-medium flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Vaciar</span>
              </button>
            )}
          </div>

          {products.length === 0 ? (
            <div className="py-8 text-center text-slate-500 space-y-1">
              <ShoppingBag className="w-8 h-8 mx-auto opacity-40 mb-1" />
              <p className="text-xs font-medium">No hay etiquetas cargadas aún</p>
              <p className="text-[11px] text-slate-500">Escaneá un código de barras o buscá por SKU para comenzar.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/60 max-h-[320px] overflow-y-auto pr-1">
              {products.map((p, idx) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[11px] font-mono text-slate-500 w-5 text-right">{idx + 1}.</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-400">
                        SKU: <span className="font-mono text-slate-300">{p.sku || 'N/A'}</span> • ${p.salePrice ?? p.price}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onAddProduct(p);
                        playScanSuccessFeedback();
                      }}
                      className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                      title="Duplicar etiqueta"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveProduct(p.id)}
                      className="p-1.5 rounded-lg bg-slate-700 hover:bg-red-950 text-slate-400 hover:text-red-300 transition-colors"
                      title="Eliminar de la lista"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Botón de acción final: Impresión o aviso de sincronización */}
          {products.length > 0 && (
            <div className="pt-2">
              {onPrint ? (
                <button
                  type="button"
                  onClick={onPrint}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Etiquetas ({products.length})</span>
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 text-center text-xs text-slate-300">
                  <p className="font-medium text-emerald-400">✓ Sincronizado con la PC</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Podés enviar la impresión directamente desde la pantalla principal de WooTag en tu computadora.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
