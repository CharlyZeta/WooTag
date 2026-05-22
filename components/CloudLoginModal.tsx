import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { X, Cloud, Mail, Lock, AlertCircle, Eye, EyeOff, AlertTriangle, Globe, RefreshCw, CheckCircle2, Database, Smartphone, UploadCloud } from 'lucide-react';
import { WooSite } from '../types';

interface CloudLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  wooSites?: WooSite[];
  activeSiteId?: string | null;
  onForcePushWooSession?: () => Promise<void>;
  productsCount?: number;
  deviceId?: string;
}

export const CloudLoginModal: React.FC<CloudLoginModalProps> = ({
  isOpen,
  onClose,
  wooSites = [],
  activeSiteId = null,
  onForcePushWooSession,
  productsCount = 0,
  deviceId = '',
}) => {
  const { login, register, resetPassword, currentUser, logout } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  if (!isOpen) return null;

  const handleForcePush = async () => {
    if (onForcePushWooSession) {
      setPushing(true);
      try {
        await onForcePushWooSession();
        setPushSuccess(true);
        setTimeout(() => setPushSuccess(false), 3000);
      } catch (err) {
        console.error(err);
      } finally {
        setPushing(false);
      }
    }
  };

  const switchMode = (registering: boolean) => {
    setIsRegistering(registering);
    setError('');
    setMsg('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');

    // Validación de contraseña coincidente (solo en registro)
    if (isRegistering) {
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres');
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden');
        return;
      }
    }

    setLoading(true);
    try {
      if (isRegistering) {
        await register(email, password);
        onClose();
      } else {
        await login(email, password);
        onClose();
      }
    } catch (err: any) {
      const code: string = err?.code ?? '';
      if (code === 'auth/invalid-credential')           setError('Credenciales incorrectas');
      else if (code === 'auth/email-already-in-use')   setError('El correo ya está registrado. Probá iniciar sesión.');
      else if (code === 'auth/weak-password')           setError('La contraseña es muy débil (mínimo 6 caracteres)');
      else if (code === 'auth/invalid-email')           setError('El correo no tiene un formato válido');
      else if (code === 'auth/user-not-found')          setError('No existe una cuenta con ese correo');
      else if (code === 'auth/wrong-password')          setError('Contraseña incorrecta');
      else if (code === 'auth/too-many-requests')       setError('Demasiados intentos fallidos. Esperá unos minutos.');
      else if (code === 'auth/network-request-failed')  setError('Sin conexión a internet. Verificá tu red.');
      else if (code === 'auth/operation-not-allowed')   setError('El registro con email está deshabilitado en Firebase. Habilitalo en Firebase Console → Authentication → Sign-in method.');
      else if (code === 'auth/admin-restricted-operation') setError('El registro no está habilitado. Activá "Email/Password" en Firebase Console → Authentication.');
      else if (err?.message?.includes('CONFIGURATION_NOT_FOUND')) setError('Proyecto Firebase no configurado correctamente. Revisá las variables VITE_FIREBASE_* en el .env');
      else {
        console.error('[CloudLogin] Firebase error:', code, err?.message);
        setError(`Error inesperado (${code || 'desconocido'}). Revisá la consola para más detalles.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email) {
      setError('Escribí tu correo primero');
      return;
    }
    setError('');
    setMsg('');
    try {
      await resetPassword(email);
      setMsg('Correo de recuperación enviado');
    } catch {
      setError('Error al enviar el correo');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 leading-tight">Cuenta en la Nube</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {currentUser ? 'Conectado' : (isRegistering ? 'Crear Cuenta' : 'Iniciar Sesión')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {currentUser ? (
            <div className="space-y-5 text-slate-700">
              {/* Usuario info */}
              <div className="flex items-center gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600">
                  <Cloud className="w-6 h-6 animate-pulse" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Sesión en la Nube</p>
                  <p className="font-black text-slate-800 text-sm truncate">{currentUser.email}</p>
                </div>
              </div>

              {/* Diagnóstico de WooCommerce */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-500" /> Tiendas en la Nube
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                    Total: {wooSites.length}
                  </span>
                </div>

                {wooSites.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left space-y-2">
                    <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span>Sin credenciales en la nube</span>
                    </div>
                    <p className="text-[11px] text-amber-700 leading-normal">
                      No hay tiendas WooCommerce sincronizadas en tu perfil. Conectá tu tienda en la PC y hacé clic en el botón de abajo para sincronizarla.
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 max-h-32 overflow-y-auto">
                    {wooSites.map((site) => {
                      const isActive = site.id === activeSiteId;
                      return (
                        <div key={site.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors">
                          <div className="flex flex-col text-left min-w-0 pr-2">
                            <span className="font-bold text-slate-800 truncate">{site.name}</span>
                            <span className="text-[10px] text-slate-400 truncate">{site.url}</span>
                          </div>
                          {isActive ? (
                            <span className="flex-shrink-0 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-black text-[9px] uppercase tracking-wider border border-emerald-200">
                              Activa
                            </span>
                          ) : (
                            <span className="flex-shrink-0 bg-slate-50 text-slate-400 px-2 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wider border border-slate-200">
                              Guardada
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Botón de Sincronización Forzada */}
              {onForcePushWooSession && (
                <div className="space-y-1">
                  <button
                    onClick={handleForcePush}
                    disabled={pushing}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 border-2 transition-all active:scale-[0.98] ${
                      pushSuccess
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-100 hover:border-indigo-200'
                    }`}
                  >
                    {pushing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                        <span>Subiendo credenciales...</span>
                      </>
                    ) : pushSuccess ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>¡Sincronizado correctamente!</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4 text-indigo-600" />
                        <span>Subir Credenciales a la Nube</span>
                      </>
                    )}
                  </button>
                  <p className="text-[9px] text-slate-400 leading-normal px-2">
                    Si estás en la PC, usá este botón para subir tus credenciales locales WooCommerce y que el móvil las herede automáticamente al loguearse.
                  </p>
                </div>
              )}

              {/* Stats Técnicas */}
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-[10px] text-left">
                <div className="space-y-0.5">
                  <span className="text-slate-400 font-bold block">Dispositivo</span>
                  <span className="font-mono text-slate-600 font-black truncate block" title={deviceId}>
                    {deviceId ? `${deviceId.substring(0, 10)}...` : 'N/D'}
                  </span>
                </div>
                <div className="space-y-0.5 pl-2 border-l border-slate-200">
                  <span className="text-slate-400 font-bold block">Productos locales</span>
                  <span className="font-mono text-slate-600 font-black block">
                    {productsCount} item{productsCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Botón de Logout */}
              <div className="pt-2 border-t border-slate-100 flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-xs transition-colors"
                >
                  Cerrar Ventana
                </button>
                <button
                  onClick={async () => { await logout(); onClose(); }}
                  className="flex-1 py-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  Cerrar Sesión
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl flex gap-2 items-center text-xs font-bold border border-red-100">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
              {msg && (
                <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl flex gap-2 items-center text-xs font-bold border border-emerald-100">
                  {msg}
                </div>
              )}

              <div className="space-y-3">
                {/* Email */}
                <div className="relative">
                  <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Correo electrónico"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:bg-white outline-none font-bold text-sm text-slate-800 transition-all placeholder-slate-400"
                  />
                </div>

                {/* Contraseña */}
                <div className="relative">
                  <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contraseña"
                    className="w-full pl-10 pr-10 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:bg-white outline-none font-bold text-sm text-slate-800 transition-all placeholder-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Confirmar contraseña (solo en registro) */}
                {isRegistering && (
                  <div className="relative animate-in fade-in slide-in-from-top-2 duration-200">
                    <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirmar contraseña"
                      className={`w-full pl-10 pr-10 py-3 bg-slate-50 border-2 rounded-xl focus:bg-white outline-none font-bold text-sm text-slate-800 transition-all placeholder-slate-400 ${
                        confirmPassword && confirmPassword !== password
                          ? 'border-red-300 focus:border-red-400'
                          : confirmPassword && confirmPassword === password
                            ? 'border-emerald-400 focus:border-emerald-500'
                            : 'border-slate-200 focus:border-indigo-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(v => !v)}
                      className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    {/* Indicador visual de coincidencia */}
                    {confirmPassword && (
                      <p className={`text-[10px] font-black mt-1 ml-1 ${confirmPassword === password ? 'text-emerald-600' : 'text-red-500'}`}>
                        {confirmPassword === password ? '✓ Las contraseñas coinciden' : '✗ Las contraseñas no coinciden'}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 transform active:scale-95 transition-all shadow-lg shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading
                  ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : (isRegistering ? 'Crear cuenta ahora' : 'Ingresar a mi cuenta')
                }
              </button>

              <div className="flex items-center justify-between text-xs pt-2">
                <button
                  type="button"
                  onClick={() => switchMode(!isRegistering)}
                  className="text-slate-500 hover:text-indigo-600 font-bold transition-colors"
                >
                  {isRegistering ? 'Ya tengo cuenta' : 'Crear una cuenta'}
                </button>
                {!isRegistering && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-slate-400 hover:text-indigo-600 font-bold transition-colors"
                  >
                    Olvidé mi contraseña
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
