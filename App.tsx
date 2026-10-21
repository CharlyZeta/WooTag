import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { APP_VERSION, DEFAULT_CONFIG, PrintRecord, Product, TagConfig, WooConfig, WooSite, AuthSession, WpUser, DesignProfile, PricePendingItem } from './types';
import { TagSheet } from './components/TagSheet';
import { Controls } from './components/Controls';
import { ConnectionModal } from './components/ConnectionModal';
import { PriceAuditModal } from './components/PriceAuditModal';
// FIX-0025: el modo móvil arrastra html5-qrcode (≈327 KB); se carga sólo en `#/mobile`.
const MobileScannerView = React.lazy(() =>
  import('./components/MobileScannerView').then(module => ({ default: module.MobileScannerView }))
);
import { optimizeDescription } from './services/geminiService';
import { encrypt, decrypt } from './utils/security';
import { useAuth } from './contexts/AuthContext';
import { loadCloudProfile, updateCloudProfile, subscribeToCloudProfile, addProductToCloudProfile, UserCloudProfile } from './services/cloudProfiles';
import { loadSnapshotState, markAuditRun, shouldRunPriceAudit, saveSnapshot, compareCatalogWithSnapshot, updateProductsInSnapshot, dismissPendingItem, collectPrintedSourceIds } from './services/priceSnapshotService';
import type { PriceSnapshotState } from './services/priceSnapshotService';
import { createCloudWriteBatcher, attachVisibilityFlush } from './utils/cloudWriteBatcher';
import { getPageFromScrollTop } from './utils/pageGeometry';
import { msUntilExpiry } from './utils/sessionTtl';
import { fetchAllCatalogProducts } from './services/wooService';
import { CheckCircle2, Smartphone } from 'lucide-react';


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
  const [isCloudProfileLoaded, setIsCloudProfileLoaded] = useState(false);

  // FIX-0013: referencias estables para que el batcher lea siempre el usuario y el
  // estado de carga actuales sin necesidad de recrearse en cada render.
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const cloudLoadedRef = useRef(isCloudProfileLoaded);
  cloudLoadedRef.current = isCloudProfileLoaded;

  // FIX-0013 (BR-001, BR-005): un único escritor con debounce de 1 s agrupa
  // `tagConfig` y `designProfiles` en el mismo `setDoc` por ventana.
  const cloudSyncBatcher = useMemo(() => createCloudWriteBatcher<{ tagConfig?: TagConfig; designProfiles?: DesignProfile[] }>({
    delayMs: 1000,
    onFlush: (patch) => {
      // BR-004: sin usuario o con el perfil cloud sin cargar no se escribe nada.
      if (!currentUserRef.current || !cloudLoadedRef.current) return;
      return updateCloudProfile(currentUserRef.current.uid, patch).catch(console.error);
    }
  }), []);

  // FEAT-0001: Auditoría de cambios de precio y baseline en Firestore
  const [pricePendings, setPricePendings] = useState<PricePendingItem[]>([]);
  const [isPriceAuditModalOpen, setIsPriceAuditModalOpen] = useState(false);
  const [isAuditingPrices, setIsAuditingPrices] = useState(false);
  // FIX-0014: marca de última auditoría (frescura visible en el modal, BR-005 / AC-005)
  const [priceAuditAt, setPriceAuditAt] = useState<number | null>(null);

  const addToast = useCallback((message: string, type: 'info' | 'success' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // FIX-0029: la sesión de 24 h vence en vivo, no sólo al recargar.
  // Cierra la sesión cuando llega `expiresAt` (aviso incluido) y limpia el
  // almacenamiento; los productos cargados se conservan.
  const expireSession = useCallback(() => {
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
    addToast('La sesión de WooCommerce expiró (24 h). Volvé a conectar la tienda.', 'info');
  }, [addToast]);

  useEffect(() => {
    if (!session) return;
    const delay = msUntilExpiry(session.expiresAt);
    if (delay === 0) {
      expireSession();
      return;
    }
    const timer = setTimeout(expireSession, delay);
    return () => clearTimeout(timer);
  }, [session, expireSession]);

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

  // Modo Operador Móvil / Góndola (FEAT-0002)
  const [isMobileMode, setIsMobileMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash.toLowerCase();
    const search = new URLSearchParams(window.location.search);
    return hash === '#/mobile' || hash === '#mobile' || search.get('mode') === 'mobile' || window.location.pathname === '/mobile';
  });

  useEffect(() => {
    const handleUrlChange = () => {
      const hash = window.location.hash.toLowerCase();
      const search = new URLSearchParams(window.location.search);
      setIsMobileMode(hash === '#/mobile' || hash === '#mobile' || search.get('mode') === 'mobile' || window.location.pathname === '/mobile');
    };

    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, []);

  const toggleMobileMode = (enable: boolean) => {
    setIsMobileMode(enable);
    if (enable) {
      window.location.hash = '/mobile';
    } else {
      if (window.location.hash.includes('mobile')) {
        history.pushState(null, '', window.location.pathname + window.location.search);
      }
    }
  };

  useEffect(() => {
    document.title = `WooTag AI Generator v${APP_VERSION}`;
  }, []);

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

      // FEAT-0001 (AC-005) / FIX-0011 (BR-005): solo los productos con ID real de
      // WooCommerce cuentan como "impresos"; el ID de instancia nunca se convierte a número.
      const printedSourceIds = collectPrintedSourceIds(products);

      // FEAT-0001 (AC-005): Actualizar snapshot en Firestore con los precios actuales impresos
      if (currentUser && activeSiteId && printedSourceIds.size > 0) {
        updateProductsInSnapshot(
          currentUser.uid,
          activeSiteId,
          products.map(p => ({
            id: p.id,
            sourceId: p.sourceId,
            regularPrice: p.price,
            salePrice: p.salePrice ?? null,
            sku: p.sku,
            name: p.name
          }))
        ).catch(err => console.error("Error al actualizar snapshot de precios tras impresión:", err));

        // Remover de pendientes los que acaban de ser impresos
        setPricePendings(prev => prev.filter(item => !printedSourceIds.has(item.productId)));
      }

      setTimeout(() => window.print(), 0);
    } else {
      window.print();
    }
  };

  // Page indicator (FIX-0015: geometría compartida con TagSheet)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = products.length === 0
    ? 1
    : Math.ceil(products.length / (config.layoutRows * config.layoutCols));

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCurrentPage(getPageFromScrollTop(el.scrollTop, totalPages));
  }, [totalPages]);

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
      setIsCloudProfileLoaded(false);
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
          // Fallback para retrocompatibilidad: Convertir wooSession heredada en un sitio de wooSites
          const legacySession = cloudData.wooSession;
          const legacySiteId = legacySession.siteId || Math.random().toString(36).substring(2, 9);
          const legacySite: WooSite = {
            id: legacySiteId,
            name: new URL(legacySession.config.url).hostname,
            url: legacySession.config.url,
            consumerKey: legacySession.config.consumerKey,
            consumerSecret: legacySession.config.consumerSecret,
            lastUsed: Date.now()
          };
          const updatedSites = [legacySite];
          const updatedSession = { ...legacySession, siteId: legacySiteId };

          lastSyncedData.current = {
            wooSites: updatedSites,
            activeSiteId: legacySiteId,
            wooSession: updatedSession
          };

          setWooSites(updatedSites);
          setActiveSiteId(legacySiteId);
          localStorage.setItem(ACTIVE_SITE_KEY, legacySiteId);
          setSession(updatedSession);

          // Persistir localmente la sesión cifrada
          const encrypted = encrypt(updatedSession);
          localStorage.setItem(SESSION_KEY, encrypted);

          // Subir a la nube de inmediato para migrar el perfil de la base de datos al formato multisitio
          updateCloudProfile(currentUser.uid, {
            wooSites: updatedSites,
            activeSiteId: legacySiteId,
            wooSession: updatedSession
          }).catch(err => console.error("Error migrating legacy cloud session to multisite", err));
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

        setIsCloudProfileLoaded(true);
      }).catch(err => console.error("Error loading cloud profile", err));
    }
  }, [currentUser]);

  const wrappedSetProducts: React.Dispatch<React.SetStateAction<Product[]>> = useCallback((val) => {
    setProducts(val);
  }, []);

  // Limpieza al cerrar sesión de Firebase (currentUser es null)
  useEffect(() => {
    if (!currentUser) {
      setIsCloudProfileLoaded(false);
      setWooSites([]);
      setActiveSiteId(null);
      setSession(null);
      wrappedSetProducts([]);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(ACTIVE_SITE_KEY);
    }
  }, [currentUser, wrappedSetProducts]);

  // Suscripción en tiempo real a perfil (sync entre dispositivos)
  useEffect(() => {
    if (!currentUser || !isCloudProfileLoaded) return;
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
  }, [currentUser, isCloudProfileLoaded, addToast]);

  // Sync de wooSites, activeSiteId y wooSession hacia la nube con debounce
  useEffect(() => {
    if (!currentUser || !isCloudProfileLoaded) return;

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
  }, [wooSites, activeSiteId, session, currentUser, isCloudProfileLoaded]);

  // FEAT-0001 / FIX-0014: Ejecución de la auditoría de precios contra el snapshot de Firestore.
  // `force = true` (botón del modal) saltea el TTL y siempre descarga el catálogo completo.
  const runPriceAudit = useCallback(async (force = false) => {
    if (!currentUser || !session?.config) return;
    const currentSiteId = activeSiteId || 'default';

    // BR-001 / BR-002: el estado del snapshot decide si corresponde auditar.
    let state: PriceSnapshotState;
    try {
      state = await loadSnapshotState(currentUser.uid, currentSiteId);
    } catch (e) {
      console.error(e);
      return;
    }

    setPriceAuditAt(state.lastAuditAt);

    // BR-005: si la auditoría está fresca no se emite ningún request ni escritura.
    if (!shouldRunPriceAudit({ force, lastAuditAt: state.lastAuditAt })) return;

    setIsAuditingPrices(true);
    try {
      const catalog = await fetchAllCatalogProducts(session.config);

      const { pendings, newSnapshot, isInitialBaseline } = compareCatalogWithSnapshot(catalog, state.entries);

      if (isInitialBaseline) {
        await saveSnapshot(currentUser.uid, currentSiteId, newSnapshot);
        setPricePendings([]);
        addToast('Línea base de precios guardada en Firestore (0 pendientes)', 'info');
      } else {
        setPricePendings(pendings);
        if (pendings.length > 0) {
          addToast(`Se detectaron ${pendings.length} cambios de precio o nuevos productos`, 'info');
        }
      }

      // BR-004: se persiste la marca sin reescribir las entradas (los pendientes no se pierden).
      await markAuditRun(currentUser.uid, currentSiteId);
      setPriceAuditAt(Date.now());
    } catch (err) {
      console.error('Error durante la auditoría de precios:', err);
    } finally {
      setIsAuditingPrices(false);
    }
  }, [currentUser, session, activeSiteId, addToast]);

  // Auditoría automática al conectar tienda y cuenta.
  // BR-006: depende de `runPriceAudit`; la frescura (TTL) evita re-descargas innecesarias.
  const activeWooConfig = session?.config ?? null;
  useEffect(() => {
    if (currentUser && activeWooConfig && activeSiteId) {
      runPriceAudit(false);
    }
  }, [currentUser, activeSiteId, activeWooConfig, runPriceAudit]);

  const handleDismissPendingItem = async (item: PricePendingItem) => {
    if (!currentUser || !activeSiteId) return;
    try {
      await dismissPendingItem(currentUser.uid, activeSiteId, item);
      setPricePendings(prev => prev.filter(i => i.productId !== item.productId));
      addToast(`Producto ${item.sku} marcado como al día`, 'info');
    } catch (e) {
      console.error(e);
    }
  };

  const handleDismissAllPendings = async () => {
    if (!currentUser || !activeSiteId || pricePendings.length === 0) return;
    try {
      await updateProductsInSnapshot(
        currentUser.uid,
        activeSiteId,
        pricePendings.map(i => ({
          id: i.productId,
          regularPrice: i.newRegularPrice,
          salePrice: i.newSalePrice,
          sku: i.sku,
          name: i.name
        }))
      );
      setPricePendings([]);
      addToast('Todos los cambios marcados como al día', 'success');
    } catch (e) {
      console.error(e);
    }
  };

  // Persist State: localStorage inmediato (BR-002) y escritura a la nube agrupada (BR-001).
  useEffect(() => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    if (currentUser && isCloudProfileLoaded) {
      cloudSyncBatcher.schedule({ tagConfig: config });
    }
  }, [config, currentUser, isCloudProfileLoaded, cloudSyncBatcher]);

  useEffect(() => {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    if (currentUser && isCloudProfileLoaded) {
      cloudSyncBatcher.schedule({ designProfiles: profiles });
    }
  }, [profiles, currentUser, isCloudProfileLoaded, cloudSyncBatcher]);

  // FIX-0013 (BR-003): el último cambio nunca se pierde; se envía lo pendiente al
  // pasar la pestaña a segundo plano o al desmontar el componente.
  useEffect(() => {
    const detach = attachVisibilityFlush(cloudSyncBatcher);
    return () => {
      detach();
      cloudSyncBatcher.flush();
    };
  }, [cloudSyncBatcher]);

  // Sync productos a la nube con debounce
  useEffect(() => {
    // 1. Si no hay usuario o no se ha cargado el perfil de la nube, no hay sync.
    if (!currentUser || !isCloudProfileLoaded) return;
    
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
  }, [products, currentUser, isCloudProfileLoaded]);

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
      const result = await optimizeDescription(product.name, product.description);
      if (result.ok) {
        wrappedSetProducts(prev => prev.map(p =>
          p.id === productId ? { ...p, description: result.description } : p
        ));
        addToast('Descripción optimizada con IA', 'success');
      } else {
        addToast(result.error ?? 'No se pudo optimizar con IA.', 'info');
      }
    } catch (error) {
      // Defensivo: optimizeDescription no lanza (BR-003), pero nunca dejamos la UI muda
      console.error("Failed to optimize", error);
      addToast('No se pudo optimizar con IA.', 'info');
    } finally {
      setOptimizingId(null);
    }
  };

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

    // 2. Actualización local inmediata (Feedback visual instantáneo en el móvil)
    setProducts(prev => [...prev, uniqueProduct]);
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
          wooSites={wooSites}
          activeSiteId={activeSiteId}
          onForcePushWooSession={handleForcePushWooSession}
          deviceId={MY_DEVICE_ID}
          pendingPriceChangesCount={pricePendings.length}
          onOpenPriceAudit={() => setIsPriceAuditModalOpen(true)}
          onSwitchToMobileMode={() => toggleMobileMode(true)}
        />
      </div>

      <PriceAuditModal
        isOpen={isPriceAuditModalOpen}
        onClose={() => setIsPriceAuditModalOpen(false)}
        pendingItems={pricePendings}
        isLoading={isAuditingPrices}
        onRefreshAudit={() => runPriceAudit(true)}
        lastAuditAt={priceAuditAt}
        onAddProductToSheet={handleAddProduct}
        onAddAllToSheet={(prods) => prods.forEach(handleAddProduct)}
        onDismissItem={handleDismissPendingItem}
        onDismissAll={handleDismissAllPendings}
        siteName={wooSites.find(s => s.id === activeSiteId)?.name}
      />

      {isMobileMode ? (
        <div className="w-full h-full overflow-y-auto z-10 bg-slate-900">
          <React.Suspense
            fallback={
              <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-slate-400 font-bold text-sm">Cargando modo móvil...</p>
                </div>
              </div>
            }
          >
            <MobileScannerView
              products={products}
              config={config}
              wooConfig={session?.config || null}
              siteName={wooSites.find(s => s.id === activeSiteId)?.name || (session?.config ? new URL(session.config.url).hostname : 'WooTag')}
              isCloudConnected={Boolean(currentUser)}
              pricePendings={pricePendings}
              onAddProduct={handleAddProduct}
              onRemoveProduct={(id) => wrappedSetProducts(prev => prev.filter(p => p.id !== id))}
              onClearProducts={() => wrappedSetProducts([])}
              onSwitchToDesktopView={() => toggleMobileMode(false)}
              onPrint={handlePrint}
            />
          </React.Suspense>
        </div>
      ) : (
        <>
          {/* Area de Previsualización: único contenedor de scroll */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto p-4 md:p-8 flex justify-center print:p-0 print:m-0 print:overflow-visible print:block bg-gray-100 print:bg-white"
          >
            <div className="w-full flex justify-center print:block print:w-auto">
              <div className="origin-top scale-[0.45] sm:scale-[0.58] md:scale-[0.72] lg:scale-[0.88] xl:scale-100 print:scale-100 print:transform-none print:origin-top-left transition-transform duration-300 min-w-[210mm] print:min-w-0 print:w-auto">
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
        </>
      )}

      <ToastContainer toasts={toasts} />

    </div>
  );
}

const ToastContainer = ({ toasts }: { toasts: Toast[] }) => (
  <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none no-print print:hidden">
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
