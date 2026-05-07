import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Smartphone, Loader2, CheckCircle2 } from 'lucide-react';
import { createRoom, closeRoom, subscribeToRoom } from '../services/realtimeSession';
import { AuthSession } from '../types';

interface HostRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  wooSession: AuthSession;
  hostUid: string;
  initialProducts: Product[];
  onRoomCreated: (roomId: string) => void;
}

export const HostRoomModal: React.FC<HostRoomModalProps> = ({ isOpen, onClose, wooSession, hostUid, initialProducts, onRoomCreated }) => {
  const [roomId, setLocalRoomId] = useState<string | null>(null);
  const [isGuestConnected, setIsGuestConnected] = useState(false);

  useEffect(() => {
    if (isOpen && !roomId) {
      createRoom(hostUid, wooSession, initialProducts).then(id => {
        setLocalRoomId(id);
        onRoomCreated(id);
      });
    }
  }, [isOpen, roomId, hostUid, wooSession, initialProducts, onRoomCreated]);

  // Suscribirse a la sala para detectar cuando el invitado se une
  useEffect(() => {
    if (!roomId || isGuestConnected) return;
    
    const unsub = subscribeToRoom(roomId, (room) => {
      if (room?.guestJoined) {
        setIsGuestConnected(true);
        // Cerrar automáticamente después de unos segundos
        const timer = setTimeout(() => onClose(), 3000);
        return () => clearTimeout(timer);
      }
    });
    return unsub;
  }, [roomId, isGuestConnected, onClose]);

  const handleClose = () => {
    if (roomId) {
      closeRoom(roomId);
    }
    setLocalRoomId(null);
    setIsGuestConnected(false);
    onClose();
  };

  if (!isOpen) return null;

  const joinUrl = `${window.location.origin}?joinRoom=${roomId}`;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl transition-colors ${isGuestConnected ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
              {isGuestConnected ? <CheckCircle2 className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 leading-tight">
                {isGuestConnected ? '¡Conectado!' : 'Emparejar Celular'}
              </h2>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${isGuestConnected ? 'text-emerald-500' : 'text-slate-400'}`}>
                {isGuestConnected ? 'Dispositivo vinculado' : 'Sala Activa'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center">
          {!roomId ? (
            <div className="py-12 flex flex-col items-center">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Generando sala segura...</p>
            </div>
          ) : isGuestConnected ? (
            <div className="py-8 flex flex-col items-center text-center animate-in zoom-in">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <p className="text-sm font-black text-slate-800 mb-1">Celular vinculado con éxito</p>
              <p className="text-xs text-slate-500 font-bold mb-6">Ya podés empezar a escanear productos</p>
              <button
                onClick={onClose}
                className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest"
              >
                Cerrar y Empezar
              </button>
            </div>
          ) : (
            <>
              <div className="bg-white p-4 rounded-3xl border-4 border-slate-100 shadow-sm mb-6">
                <QRCodeSVG value={joinUrl} size={200} level="M" includeMargin={false} />
              </div>
              <p className="text-center text-sm font-bold text-slate-600 px-4 mb-2">
                Abrí WooTag en tu celular y elegí <br/><strong>"Escanear QR de PC"</strong>
              </p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-6 text-center">
                Todo lo que escanees en tu celular aparecerá en esta pantalla en tiempo real.
              </p>
              <div className="w-full">
                <button
                  onClick={onClose}
                  className="w-full py-3.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-black text-sm transition-all"
                >
                  Ocultar QR (La sala seguirá activa)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
