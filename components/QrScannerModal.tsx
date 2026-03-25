
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Product, WooConfig } from '../types';
import { fetchProductBySku } from '../services/wooService';
import { X, ScanLine, CheckCircle2, AlertCircle, Camera, Loader2 } from 'lucide-react';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  wooConfig: WooConfig;
  onProductScanned: (product: Product) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  wooConfig,
  onProductScanned,
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScannedRef = useRef<string>('');
  const cooldownRef = useRef(false);

  const [scannedItems, setScannedItems] = useState<{ sku: string; name: string; status: 'ok' | 'not_found' | 'loading' }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  const handleScan = useCallback(async (decodedText: string) => {
    const sku = decodedText.trim().toUpperCase();
    if (!sku) return;

    // Prevent duplicate consecutive scans
    if (cooldownRef.current || sku === lastScannedRef.current) return;
    cooldownRef.current = true;
    lastScannedRef.current = sku;

    // Vibrate if supported
    if (navigator.vibrate) navigator.vibrate(100);

    // Add loading entry
    setScannedItems(prev => [{ sku, name: 'Buscando...', status: 'loading' }, ...prev]);

    try {
      const product = await fetchProductBySku(sku, wooConfig);
      if (product) {
        setScannedItems(prev =>
          prev.map(item => item.sku === sku && item.status === 'loading'
            ? { sku, name: product.name, status: 'ok' as const }
            : item
          )
        );
        onProductScanned(product);
      } else {
        setScannedItems(prev =>
          prev.map(item => item.sku === sku && item.status === 'loading'
            ? { sku, name: 'SKU no encontrado', status: 'not_found' as const }
            : item
          )
        );
      }
    } catch {
      setScannedItems(prev =>
        prev.map(item => item.sku === sku && item.status === 'loading'
          ? { sku, name: 'Error de conexión', status: 'not_found' as const }
          : item
        )
      );
    }

    // Cooldown to avoid rapid re-scans
    setTimeout(() => {
      cooldownRef.current = false;
      lastScannedRef.current = '';
    }, 2000);
  }, [wooConfig, onProductScanned]);

  const startScanner = useCallback(async () => {
    if (!containerRef.current || scannerRef.current) return;

    setIsStarting(true);
    setError(null);

    try {
      const scannerId = 'wootag-qr-reader';
      containerRef.current.id = scannerId;

      const scanner = new Html5Qrcode(scannerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          handleScan(decodedText);
        },
        () => { /* ignore scan failures */ }
      );

      setCameraActive(true);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setError('Permiso de cámara denegado. Habilitá el acceso en la configuración del navegador.');
      } else if (msg.includes('NotFound') || msg.includes('Requested device not found')) {
        setError('No se detectó ninguna cámara en este dispositivo.');
      } else {
        setError(`No se pudo iniciar la cámara: ${msg}`);
      }
      scannerRef.current = null;
    } finally {
      setIsStarting(false);
    }
  }, [handleScan]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) { // SCANNING
          await scannerRef.current.stop();
        }
      } catch { /* already stopped */ }
      try {
        scannerRef.current.clear();
      } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Start camera when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => startScanner(), 300);
      return () => clearTimeout(timer);
    } else {
      stopScanner();
      setScannedItems([]);
      setError(null);
      lastScannedRef.current = '';
      cooldownRef.current = false;
    }
  }, [isOpen, startScanner, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  if (!isOpen) return null;

  const successCount = scannedItems.filter(i => i.status === 'ok').length;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-slate-900/80 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <ScanLine className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-white font-black text-base leading-tight">Escáner QR</h2>
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider">
              {successCount > 0 ? `${successCount} producto${successCount !== 1 ? 's' : ''} cargado${successCount !== 1 ? 's' : ''}` : 'Apuntá a un QR de etiqueta'}
            </p>
          </div>
        </div>
        <button
          onClick={() => { stopScanner(); onClose(); }}
          className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-all"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Camera viewport */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {error ? (
          <div className="text-center space-y-4 max-w-sm">
            <div className="bg-red-500/20 p-4 rounded-2xl border border-red-500/30">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <p className="text-red-300 text-sm font-bold">{error}</p>
            </div>
            <button
              onClick={() => { setError(null); startScanner(); }}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-700 transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <div className="relative w-full max-w-sm">
            {/* Scanner container */}
            <div
              ref={containerRef}
              className="w-full rounded-2xl overflow-hidden bg-black"
              style={{ minHeight: '300px' }}
            />

            {/* Overlay: scanning frame */}
            {cameraActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[250px] h-[250px] relative">
                  {/* Corner markers */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-400 rounded-br-lg" />

                  {/* Scanning line animation */}
                  <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-pulse"
                    style={{ top: '50%' }}
                  />
                </div>
              </div>
            )}

            {/* Starting overlay */}
            {isStarting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-2xl">
                <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mb-3" />
                <p className="text-white/70 text-sm font-bold">Iniciando cámara...</p>
              </div>
            )}

            {!cameraActive && !isStarting && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black rounded-2xl">
                <Camera className="w-12 h-12 text-white/30 mb-3" />
                <p className="text-white/40 text-sm font-bold">Preparando cámara...</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scanned items list */}
      {scannedItems.length > 0 && (
        <div className="bg-slate-800/80 border-t border-white/10 max-h-48 overflow-y-auto">
          <div className="p-3 space-y-1.5">
            {scannedItems.map((item, i) => (
              <div
                key={`${item.sku}-${i}`}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all ${
                  item.status === 'ok'
                    ? 'bg-emerald-500/20 border border-emerald-500/30'
                    : item.status === 'not_found'
                    ? 'bg-red-500/15 border border-red-500/20'
                    : 'bg-white/5 border border-white/10'
                }`}
              >
                {item.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                {item.status === 'not_found' && <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                {item.status === 'loading' && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />}

                <span className="font-mono font-black text-white/80 text-xs">{item.sku}</span>
                <span className="text-white/50 text-xs font-bold truncate flex-1">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
