import React, { useState } from 'react';
import { Client, Farm, Plot, Project } from '../types';
import { Plus, Users, Landmark, MapPin, Layers, LayoutGrid, CheckCircle } from 'lucide-react';

interface ClientManagerProps {
  clients: Client[];
  farms: Farm[];
  plots: Plot[];
  projects: Project[];
  activePlotId: string;
  onSelectPlot: (plotId: string) => void;
  onAddClient: (name: string, doc: string, phone: string, email: string) => void;
  onAddFarm: (clientId: string, name: string, city: string, state: string, area: number) => void;
  onAddPlot: (farmId: string, name: string, area: number, crop: string, boundaryCount: number) => void;
}

export default function ClientManager({
  clients,
  farms,
  plots,
  projects,
  activePlotId,
  onSelectPlot,
  onAddClient,
  onAddFarm,
  onAddPlot,
}: ClientManagerProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || '');
  const [selectedFarmId, setSelectedFarmId] = useState<string>(farms[0]?.id || '');

  // Modal or Add toggles
  const [showClientForm, setShowClientForm] = useState(false);
  const [showFarmForm, setShowFarmForm] = useState(false);
  const [showPlotForm, setShowPlotForm] = useState(false);

  // Form Fields
  const [newClientName, setNewClientName] = useState('');
  const [newClientDoc, setNewClientDoc] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');

  const [newFarmName, setNewFarmName] = useState('');
  const [newFarmCity, setNewFarmCity] = useState('');
  const [newFarmState, setNewFarmState] = useState('SP');
  const [newFarmArea, setNewFarmArea] = useState('');

  const [newPlotName, setNewPlotName] = useState('');
  const [newPlotArea, setNewPlotArea] = useState('');
  const [newPlotCrop, setNewPlotCrop] = useState('Soja');

  const activePlot = plots.find((p) => p.id === activePlotId);

  const handleSubmitClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName) return;
    onAddClient(newClientName, newClientDoc, newClientPhone, newClientEmail);
    // Reset
    setNewClientName('');
    setNewClientDoc('');
    setNewClientPhone('');
    setNewClientEmail('');
    setShowClientForm(false);
  };

  const handleSubmitFarm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !newFarmName) return;
    onAddFarm(
      selectedClientId,
      newFarmName,
      newFarmCity,
      newFarmState,
      parseFloat(newFarmArea) || 10
    );
    // Reset
    setNewFarmName('');
    setNewFarmCity('');
    setNewFarmState('SP');
    setNewFarmArea('');
    setShowFarmForm(false);
  };

  const handleSubmitPlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFarmId || !newPlotName) return;
    onAddPlot(
      selectedFarmId,
      newPlotName,
      parseFloat(newPlotArea) || 5,
      newPlotCrop,
      4 // Default to a standard 4-point rectangle
    );
    // Reset
    setNewPlotName('');
    setNewPlotArea('');
    setNewPlotCrop('Soja');
    setShowPlotForm(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="client-manager-section">
      {/* 1. Clientes Column */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4.5 h-4.5 text-emerald-600" />
            <h4 className="font-semibold text-slate-800 text-sm">Clientes / Produtores</h4>
          </div>
          <button
            onClick={() => setShowClientForm(!showClientForm)}
            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
            title="Adicionar Cliente"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showClientForm && (
          <form onSubmit={handleSubmitClient} className="bg-slate-50 p-4 rounded-lg mb-4 text-xs space-y-2.5">
            <div>
              <label className="block text-slate-500 font-medium mb-1">Nome Completo *</label>
              <input
                type="text"
                required
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Ex. Luís Neto"
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-medium mb-1">CPF/CNPJ</label>
              <input
                type="text"
                value={newClientDoc}
                onChange={(e) => setNewClientDoc(e.target.value)}
                placeholder="Ex. 123.456..."
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Celular</label>
                <input
                  type="text"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  placeholder="(16) 9..."
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">E-mail</label>
                <input
                  type="email"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  placeholder="contato@..."
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowClientForm(false)}
                className="px-2 py-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-2.5 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 font-medium"
              >
                Salvar
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {clients.map((c) => (
            <div
              key={c.id}
              onClick={() => {
                setSelectedClientId(c.id);
                // Auto point first farm
                const firstFarm = farms.find((f) => f.clientId === c.id);
                if (firstFarm) setSelectedFarmId(firstFarm.id);
              }}
              className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                selectedClientId === c.id
                  ? 'bg-emerald-50 border-emerald-300 shadow-sm'
                  : 'bg-white border-slate-100 hover:bg-slate-50/50'
              }`}
            >
              <h5 className="font-semibold text-slate-800 text-xs sm:text-sm">{c.name}</h5>
              <div className="flex items-center gap-4 text-[11px] text-slate-450 mt-1">
                <span>{c.email || 'Sem e-mail'}</span>
                <span>{c.phone || ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Fazendas Column */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Landmark className="w-4.5 h-4.5 text-indigo-650" />
            <h4 className="font-semibold text-slate-800 text-sm">Fazendas Cadastradas</h4>
          </div>
          <button
            onClick={() => setShowFarmForm(!showFarmForm)}
            className="p-1 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
            title="Adicionar Fazenda"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showFarmForm && (
          <form onSubmit={handleSubmitFarm} className="bg-slate-50 p-4 rounded-lg mb-4 text-xs space-y-2.5">
            <div>
              <label className="block text-slate-500 font-medium mb-1">Nome da Propriedade *</label>
              <input
                type="text"
                required
                value={newFarmName}
                onChange={(e) => setNewFarmName(e.target.value)}
                placeholder="Ex. Fazenda Santa Fé"
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Município</label>
                <input
                  type="text"
                  value={newFarmCity}
                  onChange={(e) => setNewFarmCity(e.target.value)}
                  placeholder="Ex. Ribeirão Preto"
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Estado (UF)</label>
                <input
                  type="text"
                  value={newFarmState}
                  onChange={(e) => setNewFarmState(e.target.value)}
                  placeholder="SP"
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-500 font-medium mb-1">Área Total (Hectares)</label>
              <input
                type="number"
                value={newFarmArea}
                onChange={(e) => setNewFarmArea(e.target.value)}
                placeholder="Ex. 150"
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowFarmForm(false)}
                className="px-2 py-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-2.5 py-1 bg-indigo-650 text-white rounded hover:bg-indigo-750 font-medium"
              >
                Salvar
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {farms
            .filter((f) => f.clientId === selectedClientId)
            .map((f) => (
              <div
                key={f.id}
                onClick={() => {
                  setSelectedFarmId(f.id);
                }}
                className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                  selectedFarmId === f.id
                    ? 'bg-indigo-50/55 border-indigo-300 shadow-sm'
                    : 'bg-white border-slate-100 hover:bg-slate-50/50'
                }`}
              >
                <h5 className="font-semibold text-slate-800 text-xs sm:text-sm">{f.name}</h5>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                  <span>{f.city} - {f.state}</span>
                  <span>•</span>
                  <span>{f.areaHectares} ha</span>
                </div>
              </div>
            ))}

          {farms.filter((f) => f.clientId === selectedClientId).length === 0 && (
            <p className="text-slate-400 text-xs text-center py-5">Nenhuma fazenda cadastrada para este cliente.</p>
          )}
        </div>
      </div>

      {/* 3. Talhões Column */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4.5 h-4.5 text-blue-600" />
            <h4 className="font-semibold text-slate-800 text-sm">Talhões & Projetos de Solo</h4>
          </div>
          <button
            onClick={() => setShowPlotForm(!showPlotForm)}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
            title="Adicionar Talhão"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showPlotForm && (
          <form onSubmit={handleSubmitPlot} className="bg-slate-50 p-4 rounded-lg mb-4 text-xs space-y-2.5">
            <div>
              <label className="block text-slate-500 font-medium mb-1">Nome do Talhão *</label>
              <input
                type="text"
                required
                value={newPlotName}
                onChange={(e) => setNewPlotName(e.target.value)}
                placeholder="Ex. Pivô Central 03"
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Área (ha)</label>
                <input
                  type="number"
                  value={newPlotArea}
                  onChange={(e) => setNewPlotArea(e.target.value)}
                  placeholder="Ex. 40"
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Cultura Comercial</label>
                <select
                  value={newPlotCrop}
                  onChange={(e) => setNewPlotCrop(e.target.value)}
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none"
                >
                  <option value="Soja">Soja</option>
                  <option value="Milho">Milho</option>
                  <option value="Café">Café</option>
                  <option value="Cana-de-açúcar">Cana-de-açúcar</option>
                  <option value="Algodão">Algodão</option>
                  <option value="Pastagem">Pastagem</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowPlotForm(false)}
                className="px-2 py-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
              >
                Gerar com Limite Padrão
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {plots
            .filter((p) => p.farmId === selectedFarmId)
            .map((p) => {
              const active = activePlotId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectPlot(p.id)}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    active
                      ? 'bg-blue-50/65 border-blue-400 font-semibold ring-1 ring-blue-300/30 shadow-sm'
                      : 'bg-white border-slate-100 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h5 className="font-semibold text-slate-800 text-xs sm:text-sm">{p.name}</h5>
                    {active && <CheckCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 font-normal">
                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold">
                      {p.cropType}
                    </span>
                    <span>{p.areaHectares} ha</span>
                  </div>
                </div>
              );
            })}

          {plots.filter((p) => p.farmId === selectedFarmId).length === 0 && (
            <p className="text-slate-400 text-xs text-center py-5 font-normal">Nenhum talhão cadastrado para esta fazenda.</p>
          )}
        </div>
      </div>
    </div>
  );
}
