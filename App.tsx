import React, { useState, useEffect } from 'react';
import { DEFAULT_CONFIG, Product, TagConfig, WooConfig, AuthSession, WpUser } from './types';
import { TagSheet } from './components/TagSheet';
import { Controls } from './components/Controls';
import { LoginScreen } from './components/LoginScreen';
import { optimizeDescription } from './services/geminiService';

const SESSION_KEY = 'wootag_session';
const CONFIG_KEY = 'wootag_config';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 Hours

export default function App() {
  // Application State
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Tag Configuration
  const [config, setConfig] = useState<TagConfig>(() => {
    try {
      const saved = localStorage.getItem(CONFIG_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    } catch (e) {
      return DEFAULT_CONFIG;
    }
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Initialize Session
  useEffect(() => {
    try {
      const savedSession = localStorage.getItem(SESSION_KEY);
      if (savedSession) {
        const parsed: AuthSession = JSON.parse(savedSession);
        // Check Expiry
        if (Date.now() < parsed.expiresAt) {
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

  // Save Tag Config changes
  useEffect(() => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }, [config]);

  const handleLogin = (wooConfig: WooConfig, user: WpUser) => {
    const newSession: AuthSession = {
      user,
      config: wooConfig,
      expiresAt: Date.now() + SESSION_DURATION
    };
    setSession(newSession);
    localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
  };

  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
    setProducts([]);
  };

  // Gemini AI Integration handler
  const handleOptimizeDescription = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    setIsOptimizing(true);
    try {
      const optimizedDesc = await optimizeDescription(product.name, product.description);
      
      setProducts(prev => prev.map(p => 
        p.id === productId ? { ...p, description: optimizedDesc } : p
      ));
    } catch (error) {
      console.error("Failed to optimize", error);
    } finally {
      setIsOptimizing(false);
    }
  };

  if (loadingSession) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Cargando...</div>;
  }

  if (!session) {
    return <LoginScreen onLoginSuccess={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      
      {/* Sidebar Controls - Hidden when printing */}
      <div className="w-full md:w-auto z-10 no-print">
        <Controls 
          config={config} 
          setConfig={setConfig} 
          products={products}
          setProducts={setProducts}
          wooConfig={session.config}
          user={session.user}
          onOptimize={handleOptimizeDescription}
          isOptimizing={isOptimizing}
          onLogout={handleLogout}
        />
      </div>

      {/* Main Preview Area */}
      <main className="flex-1 bg-gray-200 overflow-auto flex justify-center p-8 print:p-0 print:bg-white print:overflow-hidden print:w-auto print:h-auto">
        
        {/* The Printable Sheet Container */}
        <div className="print-only origin-top-left transform print:scale-100 scale-[0.6] sm:scale-[0.7] lg:scale-[0.85] transition-transform duration-300">
          <TagSheet products={products} config={config} />
        </div>

      </main>

    </div>
  );
}