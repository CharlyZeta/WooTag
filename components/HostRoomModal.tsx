import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Smartphone, Loader2 } from 'lucide-react';
import { createRoom, closeRoom } from '../services/realtimeSession';
import { AuthSession } from '../types';

interface HostRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  wooSession: AuthSession;
  hostUid: string;
  onRoomCreated: (roomId: string) => void;
}

export const HostRoomModal: React.FC<HostRoomModalProps> = ({ isOpen, onClose, wooSession, hostUid, onRoomCreated }) => {
  const [roomId, setLocalRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !roomId) {
      createRoom(hostUid, wooSession).then(id => {
        setLocalRoomId(id);
        onRoomCreated(id);
      });
    }
  }, [isOpen, roomId, hostUid, wooSession, onRoomCreated]);

  const handleClose = () => {
    if (roomId) {
      closeRoom(roomId);
    }
    setLocalRoomId(null);
    onClose();
  };

  if (!isOpen) return null;

  const joinUrl = `${window.location.origin}?joinRoom=${roomId}`;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 leading-tight">Emparejar Celular</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-emerald-500">
                Sala Activa
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
