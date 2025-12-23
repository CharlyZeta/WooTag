
import React, { useState, useEffect } from 'react';
import { WooConfig, WpUser } from '../types';
import { validateConnection } from '../services/wooService';
import { ShoppingBag, Lock, Key, Globe, AlertCircle, ArrowRight, Save } from 'lucide-react';

const REMEMBERED_CREDS_KEY = 'wootag_remembered_creds';

interface LoginScreenProps {
  onLoginSuccess: (config: WooConfig, user: WpUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar credenciales guardadas al iniciar
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBERED_CREDS_KEY);
      if (saved) {
        const creds = JSON.parse(saved) as WooConfig;
        setUrl(creds.url || '');
        setKey(creds.consumerKey || '');
        setSecret(creds.consumerSecret || '');
      }
    } catch (e) {
      console.error("Error loading remembered credentials", e);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const config: WooConfig = {
      url: url.trim(),
      consumerKey: key.trim(),
      consumerSecret: secret.trim()
    };

    try {
      const user = await validateConnection(config);
      
      // Guardar o limpiar credenciales según la preferencia del usuario
      if (remember) {
        localStorage.setItem(REMEMBERED_CREDS_KEY, JSON.stringify(config));
      } else {
        localStorage.removeItem(REMEMBERED_CREDS_KEY);
      }

      onLoginSuccess(config, user);
    } catch (err: any) {
      setError(err.message || "Error al conectar. Verifica tus datos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
        <div className="bg-indigo-600 p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <ShoppingBag className="w-32 h-32 rotate-12" />
          </div>
          <div className="bg-white/20 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md relative z-10 border border-white/30">
            <ShoppingBag className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white relative z-10 tracking-tight">WooTag AI</h1>
          <p className="text-indigo-100 text-sm mt-2 relative z-10 font-medium">Panel de Generación de Etiquetas</p>
        </div>

        <div className="p-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm font-bold flex items-start gap-3 border-2 border-red-100 animate-in fade-in zoom-in duration-300">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-widest ml-1">URL de la Tienda</label>
                <div className="relative group">
                  <Globe className="w-5 h-5 absolute left-4 top-3.5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                  <input
                    type="url"
                    required
                    placeholder="https://mitienda.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none text-sm font-bold text-slate-900 transition-all placeholder-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-widest ml-1">Consumer Key</label>
                <div className="relative group">
                  <Key className="w-5 h-5 absolute left-4 top-3.5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                  <input
                    type="text"
                    required
                    placeholder="ck_xxxxxxxx..."
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none text-sm font-bold text-slate-900 transition-all placeholder-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-widest ml-1">Consumer Secret</label>
                <div className="relative group">
                  <Lock className="w-5 h-5 absolute left-4 top-3.5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                  <input
                    type="password"
                    required
                    placeholder="cs_xxxxxxxx..."
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none text-sm font-bold text-slate-900 transition-all placeholder-slate-400"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center">
                  <input 
                    type="checkbox" 
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-5 h-5 text-indigo-600 bg-slate-50 border-slate-300 rounded-lg focus:ring-indigo-500 focus:ring-2 transition-all cursor-pointer" 
                  />
                </div>
                <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Recordar mis credenciales</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed mt-4 transform active:scale-95 text-base"
            >
              {loading ? (
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Conectando...</span>
                </div>
              ) : (
                <>
                  Entrar al Panel <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-slate-100">
            <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
              <div className="bg-slate-100 p-2.5 rounded-full text-indigo-600">
                <Lock className="w-4 h-4" />
              </div>
              <p className="leading-relaxed">
                Tus claves se guardan localmente para mayor seguridad. No compartimos tus credenciales con terceros.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
