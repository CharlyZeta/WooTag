
import React, { useState, useEffect, useRef } from 'react';
import { WooConfig, WpUser } from '../types';
import { validateConnection } from '../services/wooService';
import { logEvent } from '../utils/ipLogger';
import { ShoppingBag, Key, Lock, Globe, AlertCircle, ArrowRight, X } from 'lucide-react';

interface ConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConnect: (config: WooConfig, user: WpUser, remember: boolean) => void;
    currentConfig?: WooConfig | null; // Pre-fill with existing credentials
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({ isOpen, onClose, onConnect, currentConfig }) => {
    const [url, setUrl] = useState('');
    const [key, setKey] = useState('');
    const [secret, setSecret] = useState('');
    const [remember, setRemember] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const failCount = useRef(0);

    // Pre-fill fields with existing credentials when modal opens
    useEffect(() => {
        if (isOpen && currentConfig) {
            setUrl(currentConfig.url || '');
            setKey(currentConfig.consumerKey || '');
            setSecret(currentConfig.consumerSecret || '');
        }
        if (!isOpen) {
            setError(null);
            failCount.current = 0;
        }
    }, [isOpen, currentConfig]);

    if (!isOpen) return null;

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
            failCount.current = 0;
            onConnect(config, user, remember);
            onClose();
        } catch (err: any) {
            failCount.current++;
            setError(err.message || "Error al conectar. Verifica tus datos.");
            if (failCount.current >= 3) {
                logEvent('auth_fail_limit', { u: config.url, n: failCount.current });
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-slate-900/50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 p-2 rounded-lg text-white">
                            <ShoppingBag className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-800 leading-tight">Conectar Tienda</h2>
                            <p className="text-xs text-slate-500 font-medium">WooCommerce API Rest</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5" autoComplete="off">
                    {error && (
                        <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs font-bold flex items-start gap-2 border border-red-100">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">URL de la Tienda</label>
                            <div className="relative group">
                                <Globe className="w-4 h-4 absolute left-3 top-3 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                                <input
                                    type="url"
                                    required
                                    name="wootag-store-url"
                                    autoComplete="off"
                                    placeholder="https://mitienda.com"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none text-sm font-bold text-slate-900 transition-all placeholder-slate-400"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Consumer Key</label>
                            <div className="relative group">
                                <Key className="w-4 h-4 absolute left-3 top-3 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                                <input
                                    type="text"
                                    required
                                    name="wootag-consumer-key"
                                    autoComplete="off"
                                    placeholder="ck_xxxxxxxx..."
                                    value={key}
                                    onChange={(e) => setKey(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none text-sm font-bold text-slate-900 transition-all placeholder-slate-400"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Consumer Secret</label>
                            <div className="relative group">
                                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                                <input
                                    type="password"
                                    required
                                    name="wootag-consumer-secret"
                                    autoComplete="new-password"
                                    placeholder="cs_xxxxxxxx..."
                                    value={secret}
                                    onChange={(e) => setSecret(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none text-sm font-bold text-slate-900 transition-all placeholder-slate-400"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        <label className="flex items-center gap-2 cursor-pointer group py-2">
                            <input
                                type="checkbox"
                                checked={remember}
                                onChange={(e) => setRemember(e.target.checked)}
                                className="w-4 h-4 text-indigo-600 bg-slate-50 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Guardar credenciales localmente</span>
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 rounded-xl shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transform active:scale-95 text-sm"
                    >
                        {loading ? (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Validando...</span>
                            </div>
                        ) : (
                            <>
                                Conectar ahora <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>

            </div>
        </div>
    );
};
