import React, { useState, useEffect } from 'react';
import { DEFAULT_CONFIG, Product, TagConfig, WooConfig, AuthSession, WpUser, DesignProfile } from './types';
import { TagSheet } from './components/TagSheet';
import { Controls } from './components/Controls';
import { ConnectionModal } from './components/ConnectionModal';
import { optimizeDescription } from './services/geminiService';
import { encrypt, decrypt } from './utils/security';

const SESSION_KEY = 'wootag_session_v2';
const CONFIG_KEY = 'wootag_config_v2';
const PROFILES_KEY = 'wootag_profiles';
const SESSION_DURATION = 24 * 60 * 60 * 1000;

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);

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

  // Persist State
  useEffect(() => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }, [profiles]);

  // Auth Handlers
  const handleConnect = (wooConfig: WooConfig, user: WpUser, remember: boolean) => {
    const newSession: AuthSession = {
      user,
      config: wooConfig,
      expiresAt: Date.now() + SESSION_DURATION
    };
    setSession(newSession);

    if (remember) {
      const encrypted = encrypt(newSession);
      localStorage.setItem(SESSION_KEY, encrypted);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  };

  const handleDisconnect = () => {
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
    setProducts([]);
  };

  const handleOptimizeDescription = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    setOptimizingId(productId);
    try {
      const optimizedDesc = await optimizeDescription(product.name, product.description);
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, description: optimizedDesc } : p
      ));
    } catch (error) {
      console.error("Failed to optimize", error);
    } finally {
      setOptimizingId(null);
    }
  };

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
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-100 print:bg-white">

      <ConnectionModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        onConnect={handleConnect}
      />

      {/* Controles: Ocultos en impresión */}
      <div className="no-print w-full md:w-auto z-50">
        <Controls
          config={config}
          setConfig={setConfig}
          products={products}
          setProducts={setProducts}
          wooConfig={session?.config || null} // Pass null if guest
          user={session?.user || null}       // Pass null if guest
          onOptimize={handleOptimizeDescription}
          optimizingId={optimizingId}
          onLogout={handleDisconnect}
          profiles={profiles}
          onSaveProfile={handleSaveProfile}
          onLoadProfile={handleLoadProfile}
          onDeleteProfile={handleDeleteProfile}
          onOpenConnection={() => setIsConnectionModalOpen(true)}
        />
      </div>

      {/* Area de Previsualización */}
      <main className="flex-1 overflow-auto p-4 md:p-8 flex justify-center print:p-0 print:overflow-visible print:block">
        <div className="print-container origin-top transform scale-[0.5] sm:scale-[0.6] md:scale-[0.7] lg:scale-[0.85] xl:scale-100 transition-transform duration-300">
          <TagSheet products={products} config={config} />
        </div>
      </main>

    </div>
  );
}
