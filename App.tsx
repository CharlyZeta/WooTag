import React, { useState, useEffect, useRef, useCallback } from 'react';
import { APP_VERSION, DEFAULT_CONFIG, PrintRecord, Product, TagConfig, WooConfig, AuthSession, WpUser, DesignProfile } from './types';
import { TagSheet } from './components/TagSheet';
import { Controls } from './components/Controls';
import { ConnectionModal } from './components/ConnectionModal';
import { optimizeDescription } from './services/geminiService';
import { encrypt, decrypt } from './utils/security';
import { useAuth } from './contexts/AuthContext';
import { loadCloudProfile, updateCloudProfile, subscribeToCloudProfile, addProductToCloudProfile } from './services/cloudProfiles';
import { subscribeToRoom, syncRoomProducts, closeRoom } from './services/realtimeSession';

// Identificador único por dispositivo/navegador — persiste en localStorage
const DEVICE_ID_KEY = 'wootag_device_id';
const getDeviceId = (): string => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};
const MY_DEVICE_ID = getDeviceId();

const SESSION_KEY = 'wootag_session_v2';
const CONFIG_KEY = 'wootag_config_v2';
const PROFILES_KEY = 'wootag_profiles';
const PRINT_LOG_KEY = 'wootag_print_log';
const ACTIVE_SITE_KEY = 'wootag_active_site';
const SESSION_DURATION = 24 * 60 * 60 * 1000;

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [wooSites, setWooSites] = useState<WooSite[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(() => localStorage.getItem(ACTIVE_SITE_KEY));
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
  const [roomRole, setRoomRole] = useState<'host' | 'guest' | null>(null);

  // Flag anti-loop: cuando actualizamos products DESDE Firestore, evitamos
  // escribir de vuelta en Firestore en ese mismo ciclo de React.
  const skipNextCloudWrite = useRef(false);

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
        if (cloudData.wooSites) setWooSites(cloudData.wooSites);
        
        // Sincronización de sesión activa
        const siteToLoad = activeSiteId 
          ? cloudData.wooSites?.find(s => s.id === activeSiteId) 
          : cloudData.wooSites?.[0];

        if (siteToLoad) {
          handleConnect(siteToLoad, { id: 0, name: 'Usuario Cloud', slug: '', roles: [] }, false, siteToLoad.id);
        } else if (cloudData.wooSession) {
          // Fallback para retrocompatibilidad
          setSession(cloudData.wooSession);
        }

        // Cargar productos iniciales desde la nube si los hay
        if (cloudData.products && cloudData.products.length > 0) {
          skipNextCloudWrite.current = true;
          setProducts(cloudData.products);
        }
      }).catch(err => console.error("Error loading cloud profile", err));
    }
  }, [currentUser]);

  // Suscripción en tiempo real a perfil (sync entre dispositivos)
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = subscribeToCloudProfile(currentUser.uid, (cloudData) => {
      // Sincronizar productos si el update lo hizo otro dispositivo
      if (cloudData.lastProductsDevice !== MY_DEVICE_ID && Array.isArray(cloudData.products)) {
        skipNextCloudWrite.current = true;
        setProducts(cloudData.products);
      }
      // Sincronizar sitios si cambiaron en otro dispositivo
      if (cloudData.wooSites) setWooSites(cloudData.wooSites);
    });
    return unsubscribe;
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
        setRoomRole(null);
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

  // Detección de dispositivo para lógica de autoridad
  const [isMobileDevice] = useState(() => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768);

  // Sync productos a la nube con debounce (Authority model)
  useEffect(() => {
    // 1. Si no hay usuario, no hay sync.
    // 2. Si somos GUEST en una sala, NO sobrescribimos la nube (el Host lo hará).
    // 3. Si somos MOBILE, evitamos sobrescribir el estado global para no pisar cambios del PC, 
    //    EXCEPTO si no hay sala y somos el único dispositivo (se maneja con lastProductsDevice).
    if (!currentUser || (activeRoomId && roomRole === 'guest')) return;
    
    // Si somos móvil fuera de sala, preferimos sync atómico en handleAddProduct.
    // Solo permitimos sobrescritura completa desde PC para permitir "Limpiar lista" o reordenar.
    if (isMobileDevice && !activeRoomId) return;

    if (skipNextCloudWrite.current) {
      skipNextCloudWrite.current = false;
      return;
    }
    const timer = setTimeout(() => {
      updateCloudProfile(currentUser.uid, {
        products,
        lastProductsDevice: MY_DEVICE_ID,
      }).catch(console.error);
    }, 2000); 
    return () => clearTimeout(timer);
  }, [products, currentUser, activeRoomId, roomRole, isMobileDevice]);

  // Auth Handlers
  const handleConnect = (wooConfig: WooConfig, user: WpUser, remember: boolean, siteId?: string) => {
    const newSession: AuthSession = {
      user,
      config: wooConfig,
      expiresAt: Date.now() + SESSION_DURATION,
      siteId
    };
    setSession(newSession);

    if (currentUser) {
      const siteData: WooSite = {
        id: siteId || Math.random().toString(36).substring(2, 9),
        name: new URL(wooConfig.url).hostname,
        url: wooConfig.url,
        consumerKey: wooConfig.consumerKey,
        consumerSecret: wooConfig.consumerSecret,
        lastUsed: Date.now()
      };

      // Si es un sitio nuevo, lo agregamos a la lista
      if (!siteId) {
        setWooSites(prev => {
          const updated = [siteData, ...prev.filter(s => s.url !== siteData.url)];
          updateCloudProfile(currentUser.uid, { wooSites: updated, activeSiteId: siteData.id });
          return updated;
        });
        setActiveSiteId(siteData.id);
        localStorage.setItem(ACTIVE_SITE_KEY, siteData.id);
      } else {
        setActiveSiteId(siteId);
        localStorage.setItem(ACTIVE_SITE_KEY, siteId);
        updateCloudProfile(currentUser.uid, { activeSiteId: siteId });
      }
      
      updateCloudProfile(currentUser.uid, { wooSession: newSession });
    }

    if (remember) {
      const encrypted = encrypt(newSession);
      localStorage.setItem(SESSION_KEY, encrypted);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  };

  const handleSelectSite = (site: WooSite) => {
    handleConnect(site, { id: 0, name: 'Usuario Cloud', slug: '', roles: [] }, true, site.id);
  };

  const handleDeleteSite = (siteId: string) => {
    const updated = wooSites.filter(s => s.id !== siteId);
    setWooSites(updated);
    if (currentUser) updateCloudProfile(currentUser.uid, { wooSites: updated });
    if (activeSiteId === siteId) {
      setSession(null);
      setActiveSiteId(null);
      localStorage.removeItem(ACTIVE_SITE_KEY);
    }
  };

  const handleDisconnect = () => {
    if (activeRoomIdRef.current) {
      closeRoom(activeRoomIdRef.current).catch(console.error);
      setActiveRoomId(null);
      setRoomRole(null);
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
      
      // Si somos Guest en sala, sync room
      if (activeRoomIdRef.current && roomRole === 'guest') {
        // En addUniqueProduct ya lo manejamos con addProductToRoom
        return updated;
      }
      
      // Si somos Host en sala, sync room completo
      if (activeRoomIdRef.current && roomRole === 'host') {
        syncRoomProducts(activeRoomIdRef.current, updated).catch(console.error);
      }

      // Sync atómico a la nube si un producto se agregó individualmente y somos móvil (o guest)
      // Nota: addUniqueProduct ahora llamará a addProductToCloudProfile directamente
      
      return updated;
    });
  }, [roomRole]);

  const handleAddProduct = useCallback((p: Product) => {
    // Si estamos logueados, usamos sync atómico para evitar pisar datos de otros dispositivos
    if (currentUser) {
      addProductToCloudProfile(currentUser.uid, p, MY_DEVICE_ID).catch(console.error);
    }
    
    // Actualización local inmediata para feedback
    setProducts(prev => [...prev, { ...p, id: `${p.id}-${Date.now()}` }]);
  }, [currentUser]);

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
        wooSites={wooSites}
        activeSiteId={activeSiteId}
        onSelectSite={handleSelectSite}
        onDeleteSite={handleDeleteSite}
      />

      {/* Controles: Ocultos en impresión */}
      <div className="no-print w-full md:w-auto z-50">
        <Controls
          config={config}
          setConfig={setConfig}
          products={products}
          setProducts={wrappedSetProducts}
          onAddProduct={handleAddProduct}
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
          roomRole={roomRole}
          onRoomCreated={(id) => {
            setActiveRoomId(id);
            setRoomRole('host');
          }}
          onRoomJoined={(id: string, newSession: AuthSession) => {
            setActiveRoomId(id);
            setSession(newSession); // Se hereda la sesión de Woo desde el host
            setRoomRole('guest');
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
