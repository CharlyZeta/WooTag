import React, { useState, useRef } from 'react';
import { TagConfig, DesignProfile } from '../../types';
import { FolderOpen, Upload, Save, Download, Trash2, Type, Palette } from 'lucide-react';

interface DesignTabProps {
  config: TagConfig;
  setConfig: React.Dispatch<React.SetStateAction<TagConfig>>;
  profiles: DesignProfile[];
  onSaveProfile: (name: string) => void;
  onLoadProfile: (id: string) => void;
  onDeleteProfile: (id: string) => void;
  onImportProfile: (profile: DesignProfile) => void;
}

export const DesignTab: React.FC<DesignTabProps> = ({
  config,
  setConfig,
  profiles,
  onSaveProfile,
  onLoadProfile,
  onDeleteProfile,
  onImportProfile,
}) => {
  const [profileName, setProfileName] = useState('');
  const importProfileRef = useRef<HTMLInputElement>(null);

  const updateConfig = (key: keyof TagConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleExportProfile = (id: string) => {
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profile));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `wootag-profile-${profile.name.replace(/\s+/g, '-').toLowerCase()}.json`);
    dlAnchorElem.click();
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json && typeof json === 'object' && json.config && json.name) {
          onImportProfile(json as DesignProfile);
        } else {
          alert('El archivo no parece ser un perfil válido de WooTag.');
        }
      } catch (error) {
        alert('Error al leer el archivo. Asegúrate de que sea un .json válido.');
      } finally {
        if (importProfileRef.current) importProfileRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSaveCurrentProfile = () => {
    if (!profileName.trim()) return;
    onSaveProfile(profileName.trim());
    setProfileName('');
  };

  const ColorInput = ({ label, propKey }: { label: string; propKey: keyof TagConfig }) => (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-slate-900 font-bold">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
          {config[propKey] as string}
        </span>
        <input
          type="color"
          value={config[propKey] as string}
          onChange={(e) => updateConfig(propKey, e.target.value)}
          className="h-8 w-12 block bg-white border border-slate-300 cursor-pointer rounded-md overflow-hidden p-0.5 shadow-sm"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
      {/* PROFILES */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-indigo-500" /> PERFILES DE DISEÑO
          </label>
          <button
            onClick={() => importProfileRef.current?.click()}
            className="text-[10px] uppercase font-black tracking-widest text-indigo-600 flex items-center gap-1 hover:text-indigo-800 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Importar Json
          </button>
          <input
            type="file"
            ref={importProfileRef}
            accept=".json"
            className="hidden"
            onChange={handleImportFileChange}
          />
        </div>
        <div className="bg-slate-50 p-4 rounded-2xl space-y-5 border-2 border-slate-200">
          <div className="flex gap-2">
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Nuevo nombre..."
              className="flex-1 text-sm font-black border-2 border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900 placeholder-slate-500 shadow-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleSaveCurrentProfile()}
            />
            <button
              onClick={handleSaveCurrentProfile}
              className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md active:scale-95"
            >
              <Save className="w-6 h-6" />
            </button>
          </div>
          {profiles.length > 0 ? (
            <div className="space-y-2">
              {profiles.map(p => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-white p-3 rounded-xl border-2 border-slate-200 text-sm shadow-sm hover:border-indigo-400 transition-all group"
                >
                  <span className="font-black text-slate-900 truncate mr-2">{p.name}</span>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => onLoadProfile(p.id)}
                      title="Cargar perfil"
                      className="text-indigo-700 hover:bg-indigo-700 hover:text-white px-3 py-1.5 rounded-lg border-2 border-indigo-200 font-black text-xs transition-all uppercase"
                    >
                      Cargar
                    </button>
                    <button
                      onClick={() => handleExportProfile(p.id)}
                      title="Descargar como JSON"
                      className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg transition-colors"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => onDeleteProfile(p.id)}
                      title="Eliminar perfil"
                      className="text-slate-400 hover:text-red-700 p-1.5 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center font-black py-2 uppercase tracking-wider">
              Sin perfiles guardados
            </p>
          )}
        </div>
      </div>

      {/* TYPOGRAPHY / FONT SIZES */}
      <div className="pt-6 border-t-2 border-slate-100 space-y-4">
        <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
          <Type className="w-4 h-4 text-indigo-500" /> TAMAÑOS DE FUENTE
        </label>
        <div className="space-y-6 bg-slate-50 p-5 rounded-2xl border-2 border-slate-200">
          {[
            { key: 'fontSizeTitle', label: 'Nombre Producto' },
            { key: 'fontSizePrice', label: 'Precio Normal' },
            { key: 'fontSizeSalePrice', label: 'Precio Oferta' },
            { key: 'fontSizeCustomPrice', label: 'Precio Especial' },
            { key: 'fontSizeCustomLabel', label: 'Leyenda P. Especial' },
            { key: 'fontSizePriceLegend', label: 'Leyenda Precio' },
            { key: 'fontSizeDesc', label: 'Descripción' },
            { key: 'qrSize', label: 'Tamaño QR' }
          ].map(item => (
            <div key={item.key} className="space-y-3">
              <div className="flex justify-between text-[11px] font-black text-slate-800 uppercase tracking-tighter">
                <span>{item.label}</span>
                <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-md shadow-sm">
                  {config[item.key as keyof TagConfig]}px
                </span>
              </div>
              <input
                type="range"
                min="8"
                max="80"
                value={config[item.key as keyof TagConfig] as number}
                onChange={(e) => updateConfig(item.key as any, Number(e.target.value))}
                className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>
          ))}
        </div>
      </div>

      {/* COLORS */}
      <div className="pt-6 border-t-2 border-slate-100 space-y-4">
        <label className="text-[11px] font-black text-slate-600 uppercase tracking-[0.15em] flex items-center gap-2">
          <Palette className="w-4 h-4 text-indigo-500" /> COLORES DE TEXTO
        </label>
        <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-200 space-y-1">
          <ColorInput label="Título" propKey="colorTitle" />
          <ColorInput label="Precio" propKey="colorPrice" />
          <ColorInput label="Precio Oferta" propKey="colorSalePrice" />
          <ColorInput label="Precio Especial" propKey="colorCustomPrice" />
          <ColorInput label="Leyenda P. Especial" propKey="colorCustomLabel" />
          <ColorInput label="Leyenda Precio" propKey="colorPriceLegend" />
          <ColorInput label="Descripción" propKey="colorDesc" />
          <ColorInput label="Bordes" propKey="colorBorder" />
          <ColorInput label="Código QR" propKey="colorAccent" />
        </div>
      </div>
    </div>
  );
};
