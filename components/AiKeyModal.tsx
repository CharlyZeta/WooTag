import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, KeyRound, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { clearAiKey, getAiKey, maskAiKey, setAiKey } from '../utils/aiKeyStorage';
import { testGeminiApiKey } from '../services/geminiService';

interface AiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyChanged?: () => void;
}

type TestState = 'idle' | 'testing' | 'ok' | 'error';

/**
 * AiKeyModal — Configuración de la API key de Gemini (BYOK, FIX-0018).
 * La clave se prueba antes de guardarse (BR-005/BR-006) y vive sólo en este navegador (BR-001).
 */
export const AiKeyModal: React.FC<AiKeyModalProps> = ({ isOpen, onClose, onKeyChanged }) => {
  const [input, setInput] = useState('');
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [storedKey, setStoredKey] = useState('');

  // Al abrir el modal refrescamos el estado real de la clave almacenada
  useEffect(() => {
    if (!isOpen) return;
    setStoredKey(getAiKey());
    setInput('');
    setTestState('idle');
    setTestMessage('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInputChange = (value: string) => {
    setInput(value);
    // Toda edición invalida la prueba anterior: hay que volver a probar antes de guardar
    setTestState('idle');
    setTestMessage('');
  };

  const handleTest = async () => {
    const clean = input.trim();
    if (!clean || testState === 'testing') return;

    setTestState('testing');
    setTestMessage('');

    try {
      const result = await testGeminiApiKey(clean);
      if (result.ok) {
        setTestState('ok');
        setTestMessage('La clave funciona: ya podés guardarla.');
      } else {
        setTestState('error');
        setTestMessage(result.error ?? 'No se pudo validar la clave.');
      }
    } catch {
      setTestState('error');
      setTestMessage('No se pudo validar la clave. Revisá tu conexión e intentá de nuevo.');
    }
  };

  const canSave = input.trim().length > 0 && testState === 'ok' && !isSaving;

  const handleSave = () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      setAiKey(input);
      setStoredKey(getAiKey());
      onKeyChanged?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    clearAiKey();
    setStoredKey('');
    setInput('');
    setTestState('idle');
    setTestMessage('');
    onKeyChanged?.();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 leading-tight">Optimización con IA</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                API key de Gemini
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {storedKey ? (
            <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Clave guardada en este navegador
                  </p>
                  <p className="font-mono text-sm font-black text-slate-800 truncate">{maskAiKey(storedKey)}</p>
                </div>
              </div>
              <button
                onClick={handleDelete}
                className="w-full py-2.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
              >
                <Trash2 className="w-4 h-4" /> Eliminar clave
              </button>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-[11px] font-bold text-amber-800">
                Todavía no configuraste una clave
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] text-slate-700 font-black uppercase ml-1">API Key</label>
            <input
              type="password"
              autoComplete="off"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="AIza…"
              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:bg-white outline-none font-bold text-sm text-slate-800 transition-all placeholder-slate-400"
            />

            <button
              onClick={handleTest}
              disabled={!input.trim() || testState === 'testing'}
              className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-2 border-indigo-100 hover:border-indigo-200 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {testState === 'testing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Probando clave…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Probar API Key</span>
                </>
              )}
            </button>

            {testState === 'ok' && (
              <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl flex gap-2 items-center text-xs font-bold border border-emerald-100">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{testMessage || 'La clave funciona'}</span>
              </div>
            )}
            {testState === 'error' && (
              <div className="bg-red-50 text-red-700 p-3 rounded-xl flex gap-2 items-center text-xs font-bold border border-red-100">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{testMessage || 'No se pudo validar la clave'}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 transform active:scale-95 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar clave'}
          </button>

          <div className="pt-1 space-y-1.5">
            <p className="text-[10px] text-slate-400 leading-normal">
              La clave se guarda sólo en este navegador. Nunca se sincroniza a la nube.
            </p>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 transition-colors"
            >
              Obtener una API key gratis <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
