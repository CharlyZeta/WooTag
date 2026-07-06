import React, { useState, useEffect } from 'react';
import { APP_VERSION, PrintRecord, TagConfig, Product, WooConfig, WpUser, DesignProfile, WooSite, AuthSession } from '../types';
import { QrScannerModal } from './QrScannerModal';
import { CloudLoginModal } from './CloudLoginModal';
import { useAuth } from '../contexts/AuthContext';
import { HostRoomModal } from './HostRoomModal';
import { MobileJoinScanner } from './MobileJoinScanner';
import { addProductToRoom } from '../services/realtimeSession';

// Subcomponents
import { DataTab } from './controls/DataTab';
import { ImportTab } from './controls/ImportTab';
import { LayoutTab } from './controls/LayoutTab';
import { DesignTab } from './controls/DesignTab';
import { HistoryTab } from './controls/HistoryTab';

import {
  Cloud, Printer, LogOut, Smartphone, Layers, PackagePlus, Settings, Palette, History
} from 'lucide-react';

interface ControlsProps {
  config: TagConfig;
  setConfig: React.Dispatch<React.SetStateAction<TagConfig>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  onAddProduct: (p: Product) => void;
  wooConfig: WooConfig | null;
  user: WpUser | null;
  onOptimize: (productId: string) => void;
  optimizingId: string | null;
  onLogout: () => void;
  profiles: DesignProfile[];
  onSaveProfile: (name: string) => void;
  onLoadProfile: (id: string) => void;
  onDeleteProfile: (id: string) => void;
  onImportProfile: (profile: DesignProfile) => void;
  onOpenConnection: () => void;
  onPrint: () => void;
  printLog: PrintRecord[];
  onClearPrintLog: () => void;
  activeRoomId: string | null;
  roomRole: 'host' | 'guest' | null;
  onRoomCreated: (id: string) => void;
  onRoomJoined: (id: string, wooConfig: AuthSession) => void;
  wooSites: WooSite[];
  activeSiteId: string | null;
  onForcePushWooSession: () => Promise<void>;
  deviceId: string;
}

export const Controls: React.FC<ControlsProps> = ({
  config,
  setConfig,
  products,
  setProducts,
  onAddProduct,
  wooConfig,
  user,
  onOptimize,
  optimizingId,
  onLogout,
  profiles,
  onSaveProfile,
  onLoadProfile,
  onDeleteProfile,
  onImportProfile,
  onOpenConnection,
  onPrint,
  printLog,
  onClearPrintLog,
  activeRoomId,
  roomRole,
  onRoomCreated,
  onRoomJoined,
  wooSites,
  activeSiteId,
  onForcePushWooSession,
  deviceId,
}) => {
  const [activeTab, setActiveTab] = useState<'data' | 'import' | 'layout' | 'design' | 'history'>('data');
  const { currentUser } = useAuth();
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isHostModalOpen, setIsHostModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);

  // Mobile detection: hide PC features on mobile viewports
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const addUniqueProduct = (p: Product) => {
    const isDuplicate = products.some(existing => existing.sku === p.sku);
    if (isDuplicate) {
      if (!confirm(`El producto con SKU ${p.sku} ya está en la lista. ¿Deseas agregar otra etiqueta igual?`)) {
        return;
      }
    }

    if (activeRoomId && roomRole === 'guest') {
      addProductToRoom(activeRoomId, p).catch(console.error);
    } else if (currentUser && !activeRoomId) {
      onAddProduct(p);
    } else {
      const uniqueProduct = { ...p, id: `${p.id}-${Date.now()}-${Math.random()}` };
      setProducts(prev => [...prev, uniqueProduct]);
    }
  };

  return (
    <div className="bg-white h-screen flex flex-col border-r border-gray-300 w-full md:w-96 lg:w-[450px] shadow-2xl z-20 overflow-hidden">
      {/* Header & Connection Status */}
      <div className="p-5 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-5">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-indigo-600 to-violet-600 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-200">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 leading-none tracking-tight">WooTag</h1>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Generador AI</span>
            </div>
          </div>

          {/* User Profile / Status */}
          <div className="flex items-center gap-2">
            <div className="flex gap-2 mr-2 border-r-2 border-slate-100 pr-2">
              {!isMobile && !currentUser && (
                <button
                  onClick={() => setIsHostModalOpen(true)}
                  disabled={activeRoomId !== null && isHostModalOpen === false}
                  className={`p-2 rounded-xl transition-all border-2 border-transparent hover:border-indigo-100 group relative ${activeRoomId ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}
                  title={activeRoomId ? `Sala ${activeRoomId} activa` : "Generar QR para invitado externo"}
                >
                  <Smartphone className={`w-5 h-5 transition-transform group-hover:-translate-y-0.5 ${activeRoomId ? 'text-emerald-500' : 'group-hover:text-indigo-500'}`} />
                  {activeRoomId && <div className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 border border-white rounded-full translate-x-1 -translate-y-1" />}
                </button>
              )}

              <button
                onClick={() => setIsCloudModalOpen(true)}
                className="p-2 rounded-xl transition-all border-2 border-transparent hover:border-indigo-100 flex items-center gap-2 group relative"
                title={currentUser ? "Cuenta Sincronizada Automáticamente" : "Iniciar Sesión en la Nube"}
              >
                <div className="relative">
                  <Cloud className={`w-5 h-5 transition-transform group-hover:-translate-y-0.5 ${currentUser ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-500'}`} />
                  {currentUser && (
                    <div className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 border border-white rounded-full translate-x-1 -translate-y-1 animate-pulse" />
                  )}
                </div>
              </button>
            </div>

            {user ? (
              <div className="flex items-center gap-2 pl-2 border-l-2 border-slate-100">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-black text-slate-800 leading-tight">{user.name}</div>
                  <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Woo Conectado</div>
                </div>
                <button
                  onClick={onLogout}
                  className="group p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border-2 border-transparent hover:border-red-100"
                  title="Desconectar Tienda"
                >
                  <LogOut className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenConnection}
                className="text-xs font-black bg-slate-100 text-slate-600 px-3 py-2 rounded-xl hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-2 border-2 border-slate-200 hover:border-indigo-600 ml-2"
              >
                <span className="w-2 h-2 bg-slate-400 rounded-full group-hover:bg-white" />
                Conectar Woo
              </button>
            )}
          </div>
        </div>

        {/* Global Actions */}
        <button
          type="button"
          onClick={onPrint}
          disabled={products.length === 0}
          className="w-full bg-slate-900 hover:bg-black disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-xl shadow-slate-200 disabled:shadow-none cursor-pointer group"
        >
          <span>IMPRIMIR ETIQUETAS</span>
          <Printer className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {[
          { id: 'data', icon: Layers, label: 'Lista' },
          { id: 'import', icon: PackagePlus, label: 'Importar' },
          { id: 'layout', icon: Settings, label: 'Ajustes' },
          { id: 'design', icon: Palette, label: 'Diseño' },
          { id: 'history', icon: History, label: 'Historial', badge: printLog.length > 0 ? printLog.length : null }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2.5 text-[9px] font-black uppercase tracking-tight flex flex-col items-center gap-1 transition-all border-b-2 relative ${
              activeTab === tab.id
                ? 'text-indigo-600 border-indigo-600 bg-indigo-50/50'
                : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400'}`} />
            {tab.label}
            {'badge' in tab && tab.badge && (
              <span className="absolute top-1.5 right-1 bg-indigo-500 text-white text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-8 bg-white scrollbar-thin scrollbar-thumb-slate-200">
        <div className={activeTab === 'data' ? '' : 'hidden'}>
          <DataTab
            products={products}
            setProducts={setProducts}
            onOptimize={onOptimize}
            optimizingId={optimizingId}
            onGoToImport={() => setActiveTab('import')}
          />
        </div>

        <div className={activeTab === 'import' ? '' : 'hidden'}>
          <ImportTab
            wooConfig={wooConfig}
            currentUser={currentUser}
            isMobile={isMobile}
            activeRoomId={activeRoomId}
            roomRole={roomRole}
            products={products}
            setProducts={setProducts}
            onAddUniqueProduct={addUniqueProduct}
            onOpenConnection={onOpenConnection}
            onOpenHostModal={() => setIsHostModalOpen(true)}
            onOpenJoinModal={() => setIsJoinModalOpen(true)}
            onOpenQrScanner={() => setIsQrScannerOpen(true)}
            deviceId={deviceId}
          />
        </div>

        <div className={activeTab === 'layout' ? '' : 'hidden'}>
          <LayoutTab
            config={config}
            setConfig={setConfig}
          />
        </div>

        <div className={activeTab === 'design' ? '' : 'hidden'}>
          <DesignTab
            config={config}
            setConfig={setConfig}
            profiles={profiles}
            onSaveProfile={onSaveProfile}
            onLoadProfile={onLoadProfile}
            onDeleteProfile={onDeleteProfile}
            onImportProfile={onImportProfile}
          />
        </div>

        <div className={activeTab === 'history' ? '' : 'hidden'}>
          <HistoryTab
            printLog={printLog}
            onClearPrintLog={onClearPrintLog}
          />
        </div>
      </div>

      {/* Footer: App Version */}
      <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between bg-white no-print">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">WooTag AI</span>
        <span className="text-[10px] font-black text-slate-300 font-mono">v{APP_VERSION}</span>
      </div>

      {wooConfig && (
        <QrScannerModal
          isOpen={isQrScannerOpen}
          onClose={() => setIsQrScannerOpen(false)}
          wooConfig={wooConfig}
          onProductScanned={addUniqueProduct}
        />
      )}

      <CloudLoginModal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
        wooSites={wooSites}
        activeSiteId={activeSiteId}
        onForcePushWooSession={onForcePushWooSession}
        productsCount={products.length}
        deviceId={deviceId}
      />

      {wooConfig && currentUser && (
        <HostRoomModal
          isOpen={isHostModalOpen}
          onClose={() => setIsHostModalOpen(false)}
          hostUid={currentUser.uid}
          wooSession={{ config: wooConfig, user: user as any, expiresAt: Date.now() }}
          initialProducts={products}
          onRoomCreated={onRoomCreated}
        />
      )}

      <MobileJoinScanner
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onRoomJoined={(id, auth) => {
          setIsJoinModalOpen(false);
          onRoomJoined(id, auth);
        }}
      />
    </div>
  );
};
