import React, { useState } from 'react';
import { TagConfig, Product, WooConfig, WpUser } from '../types';
import { fetchProductBySku } from '../services/wooService';
import { 
  Settings, 
  Layout, 
  Type, 
  Palette, 
  Printer, 
  Plus, 
  Trash2, 
  Sparkles,
  AlertCircle,
  LogOut,
  User
} from 'lucide-react';

interface ControlsProps {
  config: TagConfig;
  setConfig: React.Dispatch<React.SetStateAction<TagConfig>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  wooConfig: WooConfig;
  user: WpUser | null;
  onOptimize: (productId: string) => void;
  isOptimizing: boolean;
  onLogout: () => void;
}

export const Controls: React.FC<ControlsProps> = ({ 
  config, 
  setConfig, 
  products, 
  setProducts,
  wooConfig,
  user,
  onOptimize,
  isOptimizing,
  onLogout
}) => {
  const [activeTab, setActiveTab] = useState<'layout' | 'design' | 'data'>('data');
  const [newSku, setNewSku] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleAddProduct = async () => {
    if (!newSku) return;
    setFetchError(null);

    // Try fetching from WooCommerce
    if (wooConfig.url && wooConfig.consumerKey) {
      setIsFetching(true);
      try {
        const wooProduct = await fetchProductBySku(newSku, wooConfig);
        if (wooProduct) {
          // Check for duplicate ID
          if (!products.find(p => p.id === wooProduct.id)) {
            setProducts([...products, wooProduct]);
            setNewSku('');
          } else {
            setFetchError("El producto ya está en la lista.");
          }
        } else {
          setFetchError("Producto no encontrado en WooCommerce.");
        }
      } catch (err) {
        setFetchError("Error de conexión. Verifica que el SKU exista.");
      } finally {
        setIsFetching(false);
      }
    }
  };

  const handleDeleteProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
  };

  const updateConfig = (key: keyof TagConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="bg-white h-screen flex flex-col border-r border-gray-200 w-full max-w-md shadow-xl z-20">
      
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Printer className="w-5 h-5 text-indigo-600" />
            WooTag Gen
          </h1>
          <button 
            onClick={handlePrint}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" /> Imprimir
          </button>
        </div>
        
        {/* User Status Bar */}
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-md p-2">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-100 p-1.5 rounded-full">
              <User className="w-3 h-3 text-indigo-600" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-700">{user?.name}</span>
              <span className="text-[10px] text-gray-400 capitalize">{user?.roles[0]}</span>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
            title="Cerrar Sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        <button 
          onClick={() => setActiveTab('data')}
          className={`flex-1 py-3 text-sm font-medium flex justify-center items-center gap-2 ${activeTab === 'data' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Layout className="w-4 h-4" /> Productos
        </button>
        <button 
          onClick={() => setActiveTab('layout')}
          className={`flex-1 py-3 text-sm font-medium flex justify-center items-center gap-2 ${activeTab === 'layout' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Settings className="w-4 h-4" /> Estructura
        </button>
        <button 
          onClick={() => setActiveTab('design')}
          className={`flex-1 py-3 text-sm font-medium flex justify-center items-center gap-2 ${activeTab === 'design' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Palette className="w-4 h-4" /> Diseño
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Data Tab */}
        {activeTab === 'data' && (
          <div className="space-y-6">
            
            <div className="flex gap-2 relative">
              <input 
                type="text" 
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                placeholder="Ingresa SKU (ej: 1001)"
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleAddProduct()}
              />
              <button 
                onClick={handleAddProduct}
                disabled={isFetching}
                className="bg-gray-900 text-white p-2 rounded-md hover:bg-gray-800 disabled:opacity-50"
              >
                {isFetching ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-5 h-5" />}
              </button>
            </div>
            
            {fetchError && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                <AlertCircle className="w-3 h-3" />
                {fetchError}
              </div>
            )}

            <div className="space-y-3">
              {products.map((p) => (
                <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col gap-2 group hover:border-indigo-300 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-gray-800">{p.name}</div>
                      <div className="text-xs text-gray-500">SKU: {p.sku} | ${p.price}</div>
                    </div>
                    <button 
                      onClick={() => handleDeleteProduct(p.id)}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="relative">
                     <textarea
                       className="w-full text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2 resize-none focus:outline-none focus:border-indigo-300"
                       rows={2}
                       value={p.description}
                       readOnly
                     />
                     <button
                        onClick={() => onOptimize(p.id)}
                        disabled={isOptimizing}
                        className="absolute bottom-1 right-1 bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-[10px] px-2 py-1 rounded-full flex items-center gap-1 shadow-sm transition-all"
                        title="Mejorar con IA"
                     >
                       <Sparkles className="w-3 h-3" />
                       {isOptimizing ? '...' : 'IA'}
                     </button>
                  </div>
                </div>
              ))}
              {products.length === 0 && (
                <div className="text-center text-gray-400 py-8 italic">
                  No hay productos. Añade un SKU.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Layout Tab */}
        {activeTab === 'layout' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Matriz de Etiquetas</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-gray-500">Columnas</span>
                  <select 
                    value={config.layoutCols}
                    onChange={(e) => updateConfig('layoutCols', Number(e.target.value))}
                    className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value={1}>1 Columna</option>
                    <option value={2}>2 Columnas</option>
                    <option value={3}>3 Columnas</option>
                    <option value={4}>4 Columnas</option>
                  </select>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Filas</span>
                  <select 
                    value={config.layoutRows}
                    onChange={(e) => updateConfig('layoutRows', Number(e.target.value))}
                    className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {[1,2,3,4,5,6,7,8].map(n => (
                      <option key={n} value={n}>{n} Filas</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Espaciado (mm)</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-gray-500">Separación</span>
                  <input 
                    type="number" 
                    value={config.gap}
                    onChange={(e) => updateConfig('gap', Number(e.target.value))}
                    className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 text-sm"
                  />
                </div>
                <div>
                  <span className="text-xs text-gray-500">Padding Interno</span>
                  <input 
                    type="number" 
                    value={config.padding}
                    onChange={(e) => updateConfig('padding', Number(e.target.value))}
                    className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
               <label className="block text-sm font-medium text-gray-700 mb-3">Elementos Visibles</label>
               <div className="space-y-2">
                 {[
                   { k: 'showSku', l: 'Mostrar SKU' },
                   { k: 'showDescription', l: 'Mostrar Descripción' },
                   { k: 'showQRCode', l: 'Mostrar Código QR' },
                   { k: 'showSalePrice', l: 'Mostrar Precio Oferta' },
                   { k: 'showBorder', l: 'Mostrar Borde de Corte' },
                 ].map((item) => (
                   <label key={item.k} className="flex items-center">
                     <input 
                       type="checkbox" 
                       checked={config[item.k as keyof TagConfig] as boolean}
                       onChange={(e) => updateConfig(item.k as keyof TagConfig, e.target.checked)}
                       className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                     />
                     <span className="ml-2 text-sm text-gray-600">{item.l}</span>
                   </label>
                 ))}
               </div>
            </div>
          </div>
        )}

        {/* Design Tab */}
        {activeTab === 'design' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Type className="w-4 h-4" /> Tamaños de Fuente
              </label>
              <div className="space-y-4">
                 <div>
                   <div className="flex justify-between text-xs text-gray-500 mb-1">
                     <span>Título</span>
                     <span>{config.fontSizeTitle}px</span>
                   </div>
                   <input 
                     type="range" min="10" max="32" 
                     value={config.fontSizeTitle}
                     onChange={(e) => updateConfig('fontSizeTitle', Number(e.target.value))}
                     className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                   />
                 </div>
                 <div>
                   <div className="flex justify-between text-xs text-gray-500 mb-1">
                     <span>Precio</span>
                     <span>{config.fontSizePrice}px</span>
                   </div>
                   <input 
                     type="range" min="12" max="72" 
                     value={config.fontSizePrice}
                     onChange={(e) => updateConfig('fontSizePrice', Number(e.target.value))}
                     className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                   />
                 </div>
                 <div>
                   <div className="flex justify-between text-xs text-gray-500 mb-1">
                     <span>Descripción</span>
                     <span>{config.fontSizeDesc}px</span>
                   </div>
                   <input 
                     type="range" min="6" max="18" 
                     value={config.fontSizeDesc}
                     onChange={(e) => updateConfig('fontSizeDesc', Number(e.target.value))}
                     className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                   />
                 </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">Color de Acento</label>
              <div className="flex gap-3">
                 <input 
                   type="color" 
                   value={config.accentColor}
                   onChange={(e) => updateConfig('accentColor', e.target.value)}
                   className="h-10 w-14 block bg-white border border-gray-300 cursor-pointer rounded-md p-1"
                 />
                 <span className="text-xs text-gray-500 flex items-center">
                   Usado para el precio y QR. El precio de oferta siempre será rojo.
                 </span>
              </div>
            </div>
          </div>
        )}

      </div>
      
      <div className="p-4 border-t border-gray-200 bg-gray-50 text-xs text-gray-400 text-center">
        Woocommerce Tag Generator v2.0
      </div>
    </div>
  );
};