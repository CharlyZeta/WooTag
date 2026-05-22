import React, { useState, useEffect, useRef, useCallback } from 'react';
import { APP_VERSION, DEFAULT_CONFIG, PrintRecord, Product, TagConfig, WooConfig, WooSite, AuthSession, WpUser, DesignProfile } from './types';
import { TagSheet } from './components/TagSheet';
import { Controls } from './components/Controls';
import { ConnectionModal } from './components/ConnectionModal';
import { optimizeDescription } from './services/geminiService';
import { encrypt, decrypt } from './utils/security';
import { useAuth } from './contexts/AuthContext';
import { loadCloudProfile, updateCloudProfile, subscribeToCloudProfile, addProductToCloudProfile } from './services/cloudProfiles';
import { subscribeToRoom, closeRoom, syncRoomProducts, addProductToRoom } from './services/realtimeSession';
import { ShoppingBag, Bell, CheckCircle2, Smartphone, Loader2, X } from 'lucide-react';


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

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success';
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [wooSites, setWooSites] = useState<WooSite[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(() => localStorage.getItem(ACTIVE_SITE_KEY));
  const [loadingSession, setLoadingSession] = useState(true);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const { currentUser } = useAuth();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: 'info' | 'success' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

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
  const productsRef = useRef<Product[]>([]);
  productsRef.current = products;

  const [optimizingId, setOptimizingId] = useState<string | null>(null);
  
  // Room Matching State
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  activeRoomIdRef.current = activeRoomId;
  const [roomRole, setRoomRole] = useState<'host' | 'guest' | null>(null);

  // Flag anti-loop: cuando actualizamos products DESDE Firestore, evitamos
  // escribir de vuelta en Firestore en ese mismo ciclo de React.
  const skipNextCloudWrite = useRef(false);

  // Referencias para controlar la sincronización de WooCommerce y evitar bucles de escritura
  const sessionRef = useRef<AuthSession | null>(null);
  sessionRef.current = session;

  const lastSyncedData = useRef<{
    wooSites?: WooSite[];
    activeSiteId?: string | null;
    wooSession?: AuthSession | null;
  }>({});

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
        
        const currentSites = cloudData.wooSites || [];
        const currentActiveSiteId = cloudData.activeSiteId || null;

        if (currentSites.length > 0) {
          const localActiveSiteId = localStorage.getItem(ACTIVE_SITE_KEY);
          const targetSiteId = currentActiveSiteId || localActiveSiteId || currentSites[0].id;
          const siteToLoad = currentSites.find(s => s.id === targetSiteId) || currentSites[0];

          if (siteToLoad) {
            const wooConfig: WooConfig = {
              url: siteToLoad.url,
              consumerKey: siteToLoad.consumerKey,
              consumerSecret: siteToLoad.consumerSecret,
            };
            const newSession: AuthSession = {
              user: { id: 0, name: 'Usuario Cloud', slug: '', roles: [] },
              config: wooConfig,
              expiresAt: Date.now() + SESSION_DURATION,
              siteId: siteToLoad.id
            };

            // Sincronizar referencia con el estado final esperado
            lastSyncedData.current = {
              wooSites: currentSites,
              activeSiteId: siteToLoad.id,
              wooSession: newSession
            };

            setWooSites(currentSites);
            setActiveSiteId(siteToLoad.id);
            localStorage.setItem(ACTIVE_SITE_KEY, siteToLoad.id);
            setSession(newSession);

            // Persistir localmente la sesión cifrada
            const encrypted = encrypt(newSession);
            localStorage.setItem(SESSION_KEY, encrypted);
          }
        } else if (sessionRef.current) {
          // No hay sitios en la nube, pero el usuario tiene una sesión local activa (modo invitado previo)
          // Migrar la sesión local de WooCommerce al perfil del usuario en la nube
          const localSession = sessionRef.current;
          const localSite: WooSite = {
            id: localSession.siteId || Math.random().toString(36).substring(2, 9),
            name: new URL(localSession.config.url).hostname,
            url: localSession.config.url,
            consumerKey: localSession.config.consumerKey,
            consumerSecret: localSession.config.consumerSecret,
            lastUsed: Date.now()
          };
          const updatedSites = [localSite];
          
          lastSyncedData.current = {
            wooSites: updatedSites,
            activeSiteId: localSite.id,
            wooSession: { ...localSession, siteId: localSite.id }
          };

          setWooSites(updatedSites);
          setActiveSiteId(localSite.id);
          localStorage.setItem(ACTIVE_SITE_KEY, localSite.id);
          setSession({
            ...localSession,
            siteId: localSite.id
          });

          // Subir a la nube de inmediato para consolidar
          updateCloudProfile(currentUser.uid, {
            wooSites: updatedSites,
            activeSiteId: localSite.id,
            wooSession: { ...localSession, siteId: localSite.id }
          }).catch(err => console.error("Error migrating local session to cloud", err));
        } else if (cloudData.wooSession) {
          // Fallback para retrocompatibilidad (perfiles sin wooSites)
          lastSyncedData.current = {
            wooSites: [],
            activeSiteId: null,
            wooSession: cloudData.wooSession
          };
          setSession(cloudData.wooSession);
          if (cloudData.wooSession.siteId) {
            setActiveSiteId(cloudData.wooSession.siteId);
            localStorage.setItem(ACTIVE_SITE_KEY, cloudData.wooSession.siteId);
          }
        } else {
          // No hay datos de sesión en la nube ni sesión local previa.
          // Inicializamos la referencia de sincronización con estados vacíos para evitar escrituras en bucle.
          lastSyncedData.current = {
            wooSites: [],
            activeSiteId: null,
            wooSession: null
          };
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
        const newCount = cloudData.products.length;
        const currentCount = productsRef.current.length;
        
        if (newCount > currentCount) {
          const added = cloudData.products[newCount - 1];
          addToast(`Producto recibido: ${added.sku}`, 'info');
        }

        skipNextCloudWrite.current = true;
        setProducts(cloudData.products);
      }

      // Sincronizar sitios si cambiaron en otro dispositivo
      if (cloudData.wooSites) {
        lastSyncedData.current = {
          ...lastSyncedData.current,
          wooSites: cloudData.wooSites,
          activeSiteId: cloudData.activeSiteId || null
        };
        setWooSites(cloudData.wooSites);

        // Si el dispositivo actual no tiene sesión WooCommerce activa o si el sitio activo en la nube cambió,
        // conectar de forma automática
        const activeSite = cloudData.wooSites.find(s => s.id === cloudData.activeSiteId) || cloudData.wooSites[0];
        
        if (activeSite && (!sessionRef.current || sessionRef.current.siteId !== activeSite.id)) {
          const wooConfig: WooConfig = {
            url: activeSite.url,
            consumerKey: activeSite.consumerKey,
            consumerSecret: activeSite.consumerSecret,
          };
          const newSession: AuthSession = {
            user: { id: 0, name: 'Usuario Cloud', slug: '', roles: [] },
            config: wooConfig,
            expiresAt: Date.now() + SESSION_DURATION,
            siteId: activeSite.id
          };

          lastSyncedData.current.wooSession = newSession;
          lastSyncedData.current.activeSiteId = activeSite.id;

          setSession(newSession);
          setActiveSiteId(activeSite.id);
          localStorage.setItem(ACTIVE_SITE_KEY, activeSite.id);
          
          const encrypted = encrypt(newSession);
          localStorage.setItem(SESSION_KEY, encrypted);
          addToast(`Conectado automáticamente a ${activeSite.name}`, 'success');
        }
      }
    });
    return unsubscribe;
  }, [currentUser, addToast]);

  // Sync de wooSites, activeSiteId y wooSession hacia la nube con debounce
  useEffect(() => {
    if (!currentUser) return;

    const prev = lastSyncedData.current;
    const isSameSites = JSON.stringify(prev.wooSites) === JSON.stringify(wooSites);
    const isSameActiveId = prev.activeSiteId === activeSiteId;
    const isSameSession = JSON.stringify(prev.wooSession) === JSON.stringify(session);

    if (isSameSites && isSameActiveId && isSameSession) {
      return;
    }

    const timer = setTimeout(() => {
      // Re-verificar antes de escribir para asegurar consistencia
      const currentPrev = lastSyncedData.current;
      const currentIsSameSites = JSON.stringify(currentPrev.wooSites) === JSON.stringify(wooSites);
      const currentIsSameActiveId = currentPrev.activeSiteId === activeSiteId;
      const currentIsSameSession = JSON.stringify(currentPrev.wooSession) === JSON.stringify(session);

      if (currentIsSameSites && currentIsSameActiveId && currentIsSameSession) {
        return;
      }

      const dataToSync: Partial<UserCloudProfile> = {};
      if (!currentIsSameSites) dataToSync.wooSites = wooSites;
      if (!currentIsSameActiveId) dataToSync.activeSiteId = activeSiteId;
      if (!currentIsSameSession) dataToSync.wooSession = session;

      updateCloudProfile(currentUser.uid, dataToSync)
        .then(() => {
          lastSyncedData.current = {
            wooSites,
            activeSiteId,
            wooSession: session
          };
        })
        .catch(console.error);
    }, 1000);

    return () => clearTimeout(timer);
  }, [wooSites, activeSiteId, session, currentUser]);

  // Room subscription
  useEffect(() => {
    if (!activeRoomId) return;
    const unsubscribe = subscribeToRoom(activeRoomId, (room) => {
      if (room) {
        if (room.products.length > productsRef.current.length) {
           addToast("Etiqueta recibida vía sala", 'success');
        }
        setProducts(room.products);
      } else {
        // La sala se cerró u host desconectó
        setActiveRoomId(null);
        setRoomRole(null);
        addToast("Sincronización de sala finalizada", 'info');
      }
    });
    return () => unsubscribe();
  }, [activeRoomId, addToast]);

  // Persist State
  useEffect(() => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    if (currentUser) updateCloudProfile(currentUser.uid, { tagConfig: config });
  }, [config, currentUser]);

  useEffect(() => {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    if (currentUser) updateCloudProfile(currentUser.uid, { designProfiles: profiles });
  }, [profiles, currentUser]);

  // Sync productos a la nube con debounce
  useEffect(() => {
    // 1. Si no hay usuario, no hay sync.
    // 2. Si somos GUEST en una sala manual (fallback), NO sobrescribimos la nube (el Host lo hará).
    if (!currentUser || (activeRoomId && roomRole === 'guest')) return;
    
    // Si el update vino de la nube, salteamos la escritura de vuelta (Anti-loop)
    if (skipNextCloudWrite.current) {
      skipNextCloudWrite.current = false;
      return;
    }

    const timer = setTimeout(() => {
      updateCloudProfile(currentUser.uid, {
        products,
        lastProductsDevice: MY_DEVICE_ID,
      }).catch(console.error);
    }, 1000); // Reducido a 1s para mayor agilidad
    return () => clearTimeout(timer);
  }, [products, currentUser, activeRoomId, roomRole]);

  // Auth Handlers
  const handleConnect = (wooConfig: WooConfig, user: WpUser, remember: boolean, siteId?: string) => {
    const targetSiteId = siteId || Math.random().toString(36).substring(2, 9);
    const newSession: AuthSession = {
      user,
      config: wooConfig,
      expiresAt: Date.now() + SESSION_DURATION,
      siteId: targetSiteId
    };
    setSession(newSession);

    const siteData: WooSite = {
      id: targetSiteId,
      name: new URL(wooConfig.url).hostname,
      url: wooConfig.url,
      consumerKey: wooConfig.consumerKey,
      consumerSecret: wooConfig.consumerSecret,
      lastUsed: Date.now()
    };

    setWooSites(prev => {
      const filtered = prev.filter(s => s.id !== targetSiteId && s.url !== wooConfig.url);
      return [siteData, ...filtered];
    });

    setActiveSiteId(targetSiteId);
    localStorage.setItem(ACTIVE_SITE_KEY, targetSiteId);

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
    wrappedSetProducts([]);
  };

  const handleForcePushWooSession = async () => {
    if (!currentUser || !session) return;

    const targetSiteId = session.siteId || Math.random().toString(36).substring(2, 9);
    const siteData: WooSite = {
      id: targetSiteId,
      name: new URL(session.config.url).hostname,
      url: session.config.url,
      consumerKey: session.config.consumerKey,
      consumerSecret: session.config.consumerSecret,
      lastUsed: Date.now()
    };

    const updatedSites = [siteData, ...wooSites.filter(s => s.id !== targetSiteId && s.url !== session.config.url)];
    setWooSites(updatedSites);
    setActiveSiteId(targetSiteId);
    localStorage.setItem(ACTIVE_SITE_KEY, targetSiteId);

    const updatedSession = { ...session, siteId: targetSiteId };
    setSession(updatedSession);

    const encrypted = encrypt(updatedSession);
    localStorage.setItem(SESSION_KEY, encrypted);

    lastSyncedData.current = {
      wooSites: updatedSites,
      activeSiteId: targetSiteId,
      wooSession: updatedSession
    };

    await updateCloudProfile(currentUser.uid, {
      wooSites: updatedSites,
      activeSiteId: targetSiteId,
      wooSession: updatedSession
    });
    addToast("Credenciales subidas a la nube con éxito", "success");
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
      
      // Sincronizar con la sala si hay una activa
      if (activeRoomIdRef.current) {
        syncRoomProducts(activeRoomIdRef.current, updated).catch(err => {
          console.error("Error syncing room products:", err);
        });
      }
      return updated;
    });
  }, []);

  const handleAddProduct = useCallback((p: Product) => {
    // Generar un ID único una sola vez para ambos estados (local y nube)
    const uniqueId = `${p.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const uniqueProduct = { ...p, id: uniqueId };

    // 1. Sincronización atómica inmediata con la nube (Cloud Profile)
    if (currentUser) {
      // Bloqueamos el siguiente debounce de este dispositivo para no enviar el mismo producto 2 veces
      skipNextCloudWrite.current = true;
      addProductToCloudProfile(currentUser.uid, uniqueProduct, MY_DEVICE_ID).catch(err => {
        console.error("Fallo de inyección atómica:", err);
        // Si falla la atómica, el debounce de 1s servirá de respaldo
        skipNextCloudWrite.current = false;
      });
    }

    // 2. Sincronización con la sala manual (Fallback para invitados)
    if (activeRoomIdRef.current) {
      if (roomRole === 'guest') {
        addProductToRoom(activeRoomIdRef.current, uniqueProduct).catch(console.error);
      }
    }
    
    // 3. Actualización local inmediata (Feedback visual instantáneo en el móvil)
    setProducts(prev => [...prev, uniqueProduct]);
  }, [currentUser, roomRole]);

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
          wooSites={wooSites}
          activeSiteId={activeSiteId}
          onForcePushWooSession={handleForcePushWooSession}
          deviceId={MY_DEVICE_ID}
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

      <ToastContainer toasts={toasts} />

    </div>
  );
}

const ToastContainer = ({ toasts }: { toasts: Toast[] }) => (
  <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none">
    {toasts.map(t => (
      <div 
        key={t.id} 
        className={`px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300 backdrop-blur-md border border-white/20
          ${t.type === 'success' ? 'bg-emerald-600/90 text-white' : 'bg-slate-900/90 text-white'}`}
      >
        {t.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-300" /> : <Smartphone className="w-5 h-5 text-indigo-300" />}
        <span className="text-sm font-black tracking-tight">{t.message}</span>
      </div>
    ))}
  </div>
);
