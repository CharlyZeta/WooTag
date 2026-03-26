import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Smartphone, AlertCircle, CheckCircle2 } from 'lucide-react';
import { joinRoom } from '../services/realtimeSession';
import { AuthSession } from '../types';

interface MobileJoinScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onRoomJoined: (roomId: string, wooSession: AuthSession) => void;
}

export const MobileJoinScanner: React.FC<MobileJoinScannerProps> = ({ isOpen, onClose, onRoomJoined }) => {
  const qrRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen && !scannerRef.current) {
      scannerRef.current = new Html5Qrcode("join-reader");
      
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      
      scannerRef.current.start(
        { facingMode: "environment" },
        config,
        async (decodedText) => {
          if (isProcessing) return;
          
          try {
            // Se espera que la url sea ?joinRoom=ABCDEF
            const url = new URL(decodedText);
            const roomId = url.searchParams.get('joinRoom');
            
            if (roomId) {
              setIsProcessing(true);
              scannerRef.current?.stop().catch(console.error); // Pausar lectura
              
              const roomSession = await joinRoom(roomId);
              if (roomSession) {
                setSuccess('¡Sala conectada con éxito!');
                setTimeout(() => {
                  onRoomJoined(roomId, roomSession.wooSession);
                }, 1000);
              } else {
                setError('La sala expiró o no existe. Intentá de nuevo.');
                setIsProcessing(false);
                scannerRef.current?.start({ facingMode: "environment" }, config, () => {}, () => {}); // Reset
              }
            } else {
              setError('Código QR no válido para emparejamiento.');
            }
          } catch (e) {
            setError('Código irreconocible.');
          }
        },
        (errorMessage) => {
          // Ignorar errores de scan frame a frame
        }
      ).catch(err => {
        setError('No se pudo acceder a la cámara.');
      });
    }

    return () => {
      if (!isOpen && scannerRef.current) {
        scannerRef.current.stop().then(() => {
          scannerRef.current?.clear();
          scannerRef.current = null;
        }).catch(console.error);
        setIsProcessing(false);
        setError('');
        setSuccess('');
      }
    };
  }, [isOpen, onRoomJoined, isProcessing]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900 z-[200] flex flex-col animate-in slide-in-from-bottom-full duration-300">
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <div id="join-reader" ref={qrRef} className="w-full h-full object-cover"></div>
        
        {/* Overlay Overlay Scan Area */}
        <div className="absolute inset-0 pointer-events-none border-[40px] border-slate-900/50 flex flex-col">
          <div className="flex-1 flex items-center justify-center">
            <div className="w-[250px] h-[250px] border-2 border-indigo-500 rounded-3xl relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white -translate-x-1 -translate-y-1 rounded-tl-xl"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white translate-x-1 -translate-y-1 rounded-tr-xl"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white -translate-x-1 translate-y-1 rounded-bl-xl"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white translate-x-1 translate-y-1 rounded-br-xl"></div>
              
              {isProcessing && (
                <div className="absolute inset-0 bg-indigo-500/20 backdrop-blur-sm flex items-center justify-center rounded-3xl">
                  <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Top actions */}
        <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-center bg-gradient-to-b from-slate-900/80 to-transparent">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-500/20 backdrop-blur-md rounded-full flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-black text-sm tracking-wide">EMPAREJAMIENTO</span>
          </div>
          <button onClick={onClose} className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Messages */}
        <div className="absolute bottom-12 inset-x-6">
          {error && (
            <div className="bg-red-500/90 text-white p-4 rounded-2xl flex items-center gap-3 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <p className="text-sm font-bold leading-tight">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-emerald-500/90 text-white p-4 rounded-2xl flex items-center gap-3 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4">
              <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
              <p className="text-sm font-bold leading-tight">{success}</p>
            </div>
          )}
          {!error && !success && (
            <div className="bg-slate-900/80 backdrop-blur-md text-white p-5 rounded-3xl border border-white/10 text-center shadow-2xl">
              <p className="text-sm font-bold">Apuntá al código QR brillante en la pantalla de tu PC.</p>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-2 block">
                Te unirás a la sesión maestra automáticamente
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
