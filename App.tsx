import React, { useState, useEffect, useRef, useCallback } from 'react';
import { APP_VERSION, DEFAULT_CONFIG, PrintRecord, Product, TagConfig, WooConfig, AuthSession, WpUser, DesignProfile } from './types';
import { TagSheet } from './components/TagSheet';
import { Controls } from './components/Controls';
import { ConnectionModal } from './components/ConnectionModal';
import { optimizeDescription } from './services/geminiService';
import { encrypt, decrypt } from './utils/security';
import { useAuth } from './contexts/AuthContext';
import { loadCloudProfile, updateCloudProfile } from './services/cloudProfiles';
import { subscribeToRoom, syncRoomProducts, closeRoom } from './services/realtimeSession';

const SESSION_KEY = 'wootag_session_v2';
const CONFIG_KEY = 'wootag_config_v2';
const PROFILES_KEY = 'wootag_profiles';
const PRINT_LOG_KEY = 'wootag_print_log';
const SESSION_DURATION = 24 * 60 * 60 * 1000;

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const { currentUser } = useAuth();

  // Tag Config
  const [config, setConfig] = useState<TagConfig>(() => {
    try {
      const saved = localStorage.getItem(CONFIG_KEY);
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
    } catch (e) {
      return DEFAULT_CONFIG;
    }
  });

  // Profiles
  const [profiles, setProfiles] = useState<DesignProfile[]>(() => {
    try {
      const saved = localStorage.getItem(PROFILES_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [optimizingId, setOptimizingId] = useState<string | null>(null);
  
  // Room Matching State
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  activeRoomIdRef.current = activeRoomId;

  // Print history
  const [printLog, setPrintLog] = useState<PrintRecord[]>(() => {
    try {
      const saved = localStorage.getItem(PRINT_LOG_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(PRINT_LOG_KEY, JSON.stringify(printLog));
  }, [printLog]);

  const handlePrint = () => {
    if (products.length > 0) {
      const record: PrintRecord = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        items: products.map(p => ({ sku: p.sku, name: p.name, image: p.image }))
      };
      // Actualizar el log y luego imprimir en el siguiente tick para que React
      // persista el estado en localStorage antes de que window.print() bloquee.
      setPrintLog(prev => [record, ...prev].slice(0, 200));
      setTimeout(() => window.print(), 0);
    } else {
      window.print();
    }
  };

  // Page indicator
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = products.length === 0
    ? 1
    : Math.ceil(products.length / (config.layoutRows * config.layoutCols));

  // A4 page slot height: 297mm @ ~3.7795px/mm + gap-8 (32px between pages)
  const PAGE_SLOT_HEIGHT = 297 * 3.7795 + 32;

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // scrollTop 0 = page 1; each page slot ≈ 1154px in layout
    const page = Math.min(
      totalPages,
      Math.max(1, Math.floor(el.scrollTop / PAGE_SLOT_HEIGHT) + 1)
    );
    setCurrentPage(page);
  }, [totalPages, PAGE_SLOT_HEIGHT]);

  // Load Session (Decrypted)
  useEffect(() => {
    try {
      const savedEncrypted = localStorage.getItem(SESSION_KEY);
      if (savedEncrypted) {
        const parsed = decrypt(savedEncrypted) as AuthSession;
        if (parsed && Date.now() < parsed.expiresAt) {
          setSession(parsed);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch (e) {
      console.error("Session load error", e);
    } finally {
      setLoadingSession(false);
    }
  }, []);

  // Load Cloud Profile when user logs in
  useEffect(() => {
    if (currentUser) {
      loadCloudProfile(currentUser.uid).then(cloudData => {
        if (cloudData.tagConfig) setConfig(cloudData.tagConfig);
        if (cloudData.designProfiles.length > 0) setProfiles(cloudData.designProfiles);
        if (cloudData.wooSession) setSession(cloudData.wooSession);
      }).catch(err => console.error("Error loading cloud profile", err));
    }
  }, [currentUser]);

  // Room subscription
  useEffect(() => {
    if (!activeRoomId) return;
    const unsubscribe = subscribeToRoom(activeRoomId, (room) => {
      if (room) {
        setProducts(room.products);
      } else {
        // La sala se cerró u host desconectó
        setActiveRoomId(null);
        alert("La sesión enlazada ha finalizado.");
      }
    });
    return () => unsubscribe();
  }, [activeRoomId]);

  // Persist State
  useEffect(() => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    if (currentUser) updateCloudProfile(currentUser.uid, { tagConfig: config });
  }, [config, currentUser]);

  useEffect(() => {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    if (currentUser) updateCloudProfile(currentUser.uid, { designProfiles: profiles });
  }, [profiles, currentUser]);

  // Auth Handlers
  const handleConnect = (wooConfig: WooConfig, user: WpUser, remember: boolean) => {
    const newSession: AuthSession = {
      user,
      config: wooConfig,
      expiresAt: Date.now() + SESSION_DURATION
    };
    setSession(newSession);

    if (currentUser) {
      updateCloudProfile(currentUser.uid, { wooSession: newSession });
    }

    if (remember) {
      const encrypted = encrypt(newSession);
      localStorage.setItem(SESSION_KEY, encrypted);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  };

  const handleDisconnect = () => {
    if (activeRoomIdRef.current) {
      closeRoom(activeRoomIdRef.current).catch(console.error);
      setActiveRoomId(null);
    }
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
    if (currentUser) updateCloudProfile(currentUser.uid, { wooSession: null });
    wrappedSetProducts([]);
  };

  const handleOptimizeDescription = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    setOptimizingId(productId);
    try {
      const optimizedDesc = await optimizeDescription(product.name, product.description);
      wrappedSetProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, description: optimizedDesc } : p
      ));
    } catch (error) {
      console.error("Failed to optimize", error);
    } finally {
      setOptimizingId(null);
    }
  };

  const wrappedSetProducts: React.Dispatch<React.SetStateAction<Product[]>> = useCallback((val) => {
    setProducts((prev) => {
      const updated = typeof val === 'function' ? val(prev) : val;
      if (activeRoomIdRef.current) {
        syncRoomProducts(activeRoomIdRef.current, updated).catch(console.error);
      }
      return updated;
    });
  }, []);

  const handleSaveProfile = (name: string) => {
    const newProfile: DesignProfile = {
      id: Date.now().toString(),
      name,
      config: { ...config }
    };
    setProfiles(prev => [...prev, newProfile]);
  };

  const handleDeleteProfile = (id: string) => {
    setProfiles(prev => prev.filter(p => p.id !== id));
  };

  const handleLoadProfile = (id: string) => {
    const profile = profiles.find(p => p.id === id);
    if (profile) {
      setConfig(profile.config);
    }
  };

  const handleImportProfile = (importedProfile: DesignProfile) => {
    const newProfile = { ...importedProfile, id: Date.now().toString() };
    setProfiles(prev => [...prev, newProfile]);
  };

  // Skip loading screen, app is always accessible
  // Debug: Show a loading screen instead of null
  if (loadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold">Cargando aplicación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col md:flex-row bg-gray-100 print:bg-white print:h-auto print:overflow-visible relative">

      <ConnectionModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        onConnect={handleConnect}
        currentConfig={session?.config ?? null}
      />

      {/* Controles: Ocultos en impresión */}
      <div className="no-print w-full md:w-auto z-50">
        <Controls
          config={config}
          setConfig={setConfig}
          products={products}
          setProducts={wrappedSetProducts}
          wooConfig={session?.config || null} // Pass null if guest
          user={session?.user || null}       // Pass null if guest
          onOptimize={handleOptimizeDescription}
          optimizingId={optimizingId}
          onLogout={handleDisconnect}
          profiles={profiles}
          onSaveProfile={handleSaveProfile}
          onLoadProfile={handleLoadProfile}
          onDeleteProfile={handleDeleteProfile}
          onImportProfile={handleImportProfile}
          onOpenConnection={() => setIsConnectionModalOpen(true)}
          onPrint={handlePrint}
          printLog={printLog}
          onClearPrintLog={() => setPrintLog([])}
          activeRoomId={activeRoomId}
          onRoomCreated={setActiveRoomId}
          onRoomJoined={(id: string, newSession: AuthSession) => {
            setActiveRoomId(id);
            setSession(newSession); // Se hereda la sesión de Woo desde el host
          }}
        />
      </div>

      {/* Area de Previsualización: único contenedor de scroll */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-4 md:p-8 flex justify-center print:p-0 print:overflow-visible print:block bg-gray-100"
      >
        <div className="w-full flex justify-center">
          <div className="origin-top scale-[0.45] sm:scale-[0.58] md:scale-[0.72] lg:scale-[0.88] xl:scale-100 print:scale-100 print:transform-none print:origin-top-left transition-transform duration-300 min-w-[210mm]">
            <TagSheet products={products} config={config} />
          </div>
        </div>
      </div>

      {/* Floating Page Indicator */}
      {totalPages > 1 && (
        <div className="no-print absolute bottom-5 right-5 z-40 pointer-events-none print:hidden">
          <div className="flex items-center gap-2 bg-slate-900/85 backdrop-blur-sm text-white px-4 py-2 rounded-full shadow-2xl border border-white/10">
            <div className="flex gap-1 items-center">
              {Array.from({ length: totalPages }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${i + 1 === currentPage
                    ? 'w-4 h-2 bg-indigo-400'
                    : 'w-2 h-2 bg-white/30'
                    }`}
                />
              ))}
            </div>
            <span className="text-xs font-black tracking-wider text-white/90">
              {currentPage} / {totalPages}
            </span>
          </div>
        </div>
      )}

    </div>
  );
}
