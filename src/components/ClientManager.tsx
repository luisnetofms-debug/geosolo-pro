import React, { useState } from 'react';
import { Client, Farm, Plot, Project, PlotPeriod } from '../types';
import { Plus, Users, Landmark, MapPin, Layers, LayoutGrid, CheckCircle, Pencil, Trash2, X, Check, Calendar } from 'lucide-react';

interface ClientManagerProps {
  clients: Client[];
  farms: Farm[];
  plots: Plot[];
  projects: Project[];
  activePlotId: string;
  onSelectPlot: (plotId: string) => void;
  plotPeriods: PlotPeriod[];
  activeMonthYear: string;
  onSelectMonthYear: (my: string) => void;
  onAddPlotPeriod: (plotId: string, monthYear: string, cropType: string, notes?: string) => void;
  onEditPlotPeriod: (id: string, monthYear: string, cropType: string, notes?: string) => void;
  onDeletePlotPeriod: (id: string) => void;
  onAddClient: (name: string, doc: string, phone: string, email: string) => void;
  onAddFarm: (clientId: string, name: string, city: string, state: string, area: number) => void;
  onAddPlot: (farmId: string, name: string, area: number, crop: string, boundaryCount: number) => void;
  onEditClient?: (id: string, name: string, doc: string, phone: string, email: string) => void;
  onDeleteClient?: (id: string) => void;
  onEditFarm?: (id: string, name: string, city: string, state: string, area: number) => void;
  onDeleteFarm?: (id: string) => void;
  onEditPlot?: (id: string, name: string, area: number, crop: string) => void;
  onDeletePlot?: (id: string) => void;
}

export default function ClientManager({
  clients,
  farms,
  plots,
  projects,
  activePlotId,
  onSelectPlot,
  plotPeriods,
  activeMonthYear,
  onSelectMonthYear,
  onAddPlotPeriod,
  onEditPlotPeriod,
  onDeletePlotPeriod,
  onAddClient,
  onAddFarm,
  onAddPlot,
  onEditClient,
  onDeleteClient,
  onEditFarm,
  onDeleteFarm,
  onEditPlot,
  onDeletePlot,
}: ClientManagerProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || '');
  const [selectedFarmId, setSelectedFarmId] = useState<string>(farms[0]?.id || '');

  // Plot Period states
  const [showPeriodForm, setShowPeriodForm] = useState<string | null>(null);
  const [newPeriodMonthYear, setNewPeriodMonthYear] = useState('');
  const [newPeriodCrop, setNewPeriodCrop] = useState('Soja');
  const [newPeriodNotes, setNewPeriodNotes] = useState('');

  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editPeriodMonthYear, setEditPeriodMonthYear] = useState('');
  const [editPeriodCrop, setEditPeriodCrop] = useState('Soja');
  const [editPeriodNotes, setEditPeriodNotes] = useState('');
  const [confirmDeletePeriodId, setConfirmDeletePeriodId] = useState<string | null>(null);

  // Edit & Delete States
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [confirmDeleteClientId, setConfirmDeleteClientId] = useState<string | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientDoc, setEditClientDoc] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');

  const [editingFarmId, setEditingFarmId] = useState<string | null>(null);
  const [confirmDeleteFarmId, setConfirmDeleteFarmId] = useState<string | null>(null);
  const [editFarmName, setEditFarmName] = useState('');
  const [editFarmCity, setEditFarmCity] = useState('');
  const [editFarmState, setEditFarmState] = useState('SP');
  const [editFarmArea, setEditFarmArea] = useState('');

  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);
  const [confirmDeletePlotId, setConfirmDeletePlotId] = useState<string | null>(null);
  const [editPlotName, setEditPlotName] = useState('');
  const [editPlotArea, setEditPlotArea] = useState('');
  const [editPlotCrop, setEditPlotCrop] = useState('Soja');

  const startEditClient = (c: Client) => {
    setEditingClientId(c.id);
    setEditClientName(c.name);
    setEditClientDoc(c.document || '');
    setEditClientPhone(c.phone || '');
    setEditClientEmail(c.email || '');
    // Reset other confirm delete/edit states
    setConfirmDeleteClientId(null);
  };

  const handleSaveClientEdit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (onEditClient && editClientName) {
      onEditClient(id, editClientName, editClientDoc, editClientPhone, editClientEmail);
    }
    setEditingClientId(null);
  };

  const startEditFarm = (f: Farm) => {
    setEditingFarmId(f.id);
    setEditFarmName(f.name);
    setEditFarmCity(f.city || '');
    setEditFarmState(f.state || 'SP');
    setEditFarmArea(f.areaHectares.toString());
    setConfirmDeleteFarmId(null);
  };

  const handleSaveFarmEdit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (onEditFarm && editFarmName) {
      onEditFarm(id, editFarmName, editFarmCity, editFarmState, parseFloat(editFarmArea) || 0);
    }
    setEditingFarmId(null);
  };

  const startEditPlot = (p: Plot) => {
    setEditingPlotId(p.id);
    setEditPlotName(p.name);
    setEditPlotArea(p.areaHectares.toString());
    setEditPlotCrop(p.cropType || 'Soja');
    setConfirmDeletePlotId(null);
  };

  const handleSavePlotEdit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (onEditPlot && editPlotName) {
      onEditPlot(id, editPlotName, parseFloat(editPlotArea) || 0, editPlotCrop);
    }
    setEditingPlotId(null);
  };

  const handleDeleteClientAction = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDeleteClient) {
      onDeleteClient(id);
    }
    if (selectedClientId === id) {
      const remaining = clients.filter(c => c.id !== id);
      setSelectedClientId(remaining[0]?.id || '');
      const firstFarm = farms.find((f) => f.clientId === remaining[0]?.id);
      setSelectedFarmId(firstFarm?.id || '');
    }
    setConfirmDeleteClientId(null);
  };

  const handleDeleteFarmAction = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDeleteFarm) {
      onDeleteFarm(id);
    }
    if (selectedFarmId === id) {
      const remainingFarms = farms.filter(f => f.clientId === selectedClientId && f.id !== id);
      setSelectedFarmId(remainingFarms[0]?.id || '');
    }
    setConfirmDeleteFarmId(null);
  };

  const handleDeletePlotAction = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDeletePlot) {
      onDeletePlot(id);
    }
    if (activePlotId === id) {
      const remainingPlots = plots.filter(p => p.farmId === selectedFarmId && p.id !== id);
      if (remainingPlots.length > 0) {
        onSelectPlot(remainingPlots[0].id);
      }
    }
    setConfirmDeletePlotId(null);
  };

  const handleSubmitPeriod = (e: React.FormEvent, plotId: string) => {
    e.preventDefault();
    if (!newPeriodMonthYear) return;
    onAddPlotPeriod(plotId, newPeriodMonthYear, newPeriodCrop, newPeriodNotes);
    setNewPeriodMonthYear('');
    setNewPeriodCrop('Soja');
    setNewPeriodNotes('');
    setShowPeriodForm(null);
  };

  const handleSavePeriodEdit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (editPeriodMonthYear) {
      onEditPlotPeriod(id, editPeriodMonthYear, editPeriodCrop, editPeriodNotes);
    }
    setEditingPeriodId(null);
  };

  const startEditPeriod = (p: PlotPeriod) => {
    setEditingPeriodId(p.id);
    setEditPeriodMonthYear(p.monthYear);
    setEditPeriodCrop(p.cropType);
    setEditPeriodNotes(p.notes || '');
    setConfirmDeletePeriodId(null);
  };

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
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6" id="client-manager-section">
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

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {clients.map((c) => (
            <div key={c.id}>
              {editingClientId === c.id ? (
                <form 
                  onSubmit={(e) => handleSaveClientEdit(e, c.id)} 
                  className="p-3 bg-slate-50 border border-emerald-300 rounded-lg text-xs space-y-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      value={editClientName}
                      onChange={(e) => setEditClientName(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">CPF/CNPJ</label>
                    <input
                      type="text"
                      value={editClientDoc}
                      onChange={(e) => setEditClientDoc(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="block text-slate-500 font-medium mb-1">Celular</label>
                      <input
                        type="text"
                        value={editClientPhone}
                        onChange={(e) => setEditClientPhone(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-medium mb-1">E-mail</label>
                      <input
                        type="email"
                        value={editClientEmail}
                        onChange={(e) => setEditClientEmail(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingClientId(null)}
                      className="px-2 py-1 bg-slate-200 text-slate-650 rounded text-[10px] font-medium hover:bg-slate-350"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[10px] font-semibold hover:bg-emerald-750"
                    >
                      Salvar
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  onClick={() => {
                    setSelectedClientId(c.id);
                    // Point to first farm
                    const firstFarm = farms.find((f) => f.clientId === c.id);
                    if (firstFarm) setSelectedFarmId(firstFarm.id);
                  }}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all relative group ${
                    selectedClientId === c.id
                      ? 'bg-emerald-50 border-emerald-300 shadow-sm'
                      : 'bg-white border-slate-100 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex justify-between items-start gap-1">
                    <h5 className="font-semibold text-slate-800 text-xs sm:text-sm truncate pr-16">{c.name}</h5>
                    
                    {/* Hover buttons */}
                    <div className="absolute right-2 top-2 flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      {confirmDeleteClientId === c.id ? (
                        <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded text-[9px] font-bold text-amber-700">
                          <span>Confirmar?</span>
                          <button
                            onClick={(e) => handleDeleteClientAction(c.id, e)}
                            className="p-1 bg-rose-600 text-white rounded hover:bg-rose-700"
                            title="Confirmar exclusão"
                          >
                            <Check className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteClientId(null); }}
                            className="p-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
                            title="Cancelar"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditClient(c);
                            }}
                            className="p-1 hover:bg-slate-100 text-slate-500 hover:text-emerald-700 rounded transition-colors"
                            title="Editar Cliente"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteClientId(c.id);
                            }}
                            className="p-1 hover:bg-slate-100 text-slate-500 hover:text-rose-650 rounded transition-colors"
                            title="Excluir Cliente"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-[11px] text-slate-450 mt-1 max-w-[85%] truncate">
                    {c.document && (
                      <span className="bg-slate-100 px-1 py-0.5 rounded text-[8.5px] font-mono text-slate-600 shrink-0">
                        {c.document}
                      </span>
                    )}
                    <span className="truncate">{c.email || 'Sem e-mail'}</span>
                  </div>
                  {c.phone && (
                    <div className="text-[10px] text-slate-400 mt-0.5 font-normal">{c.phone}</div>
                  )}
                </div>
              )}
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

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {farms
            .filter((f) => f.clientId === selectedClientId)
            .map((f) => (
              <div key={f.id}>
                {editingFarmId === f.id ? (
                  <form 
                    onSubmit={(e) => handleSaveFarmEdit(e, f.id)} 
                    className="p-3 bg-slate-50 border border-indigo-300 rounded-lg text-xs space-y-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      <label className="block text-slate-500 font-medium mb-1">Nome da Propriedade *</label>
                      <input
                        type="text"
                        required
                        value={editFarmName}
                        onChange={(e) => setEditFarmName(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-slate-500 font-medium mb-1">Município</label>
                        <input
                          type="text"
                          value={editFarmCity}
                          onChange={(e) => setEditFarmCity(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 font-medium mb-1">Estado (UF)</label>
                        <input
                          type="text"
                          value={editFarmState}
                          onChange={(e) => setEditFarmState(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-500 font-medium mb-1">Área Total (Hectares)</label>
                      <input
                        type="number"
                        value={editFarmArea}
                        onChange={(e) => setEditFarmArea(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingFarmId(null)}
                        className="px-2 py-1 bg-slate-200 text-slate-650 rounded text-[10px] font-medium hover:bg-slate-350"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-2.5 py-1 bg-indigo-650 text-white rounded text-[10px] font-semibold hover:bg-indigo-750"
                      >
                        Salvar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div
                    onClick={() => {
                      setSelectedFarmId(f.id);
                    }}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all relative group ${
                      selectedFarmId === f.id
                        ? 'bg-indigo-50/55 border-indigo-300 shadow-sm'
                        : 'bg-white border-slate-100 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-1">
                      <h5 className="font-semibold text-slate-800 text-xs sm:text-sm truncate pr-16">{f.name}</h5>
                      
                      {/* Hover action buttons */}
                      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        {confirmDeleteFarmId === f.id ? (
                          <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded text-[9px] font-bold text-amber-700">
                            <span>Confirmar?</span>
                            <button
                              onClick={(e) => handleDeleteFarmAction(f.id, e)}
                              className="p-1 bg-rose-600 text-white rounded hover:bg-rose-700"
                              title="Confirmar exclusão"
                            >
                              <Check className="w-2.5 h-2.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteFarmId(null); }}
                              className="p-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
                              title="Cancelar"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditFarm(f);
                              }}
                              className="p-1 hover:bg-slate-100 text-slate-500 hover:text-indigo-700 rounded transition-colors"
                              title="Editar Fazenda"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteFarmId(f.id);
                              }}
                              className="p-1 hover:bg-slate-100 text-slate-500 hover:text-rose-650 rounded transition-colors"
                              title="Excluir Fazenda"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                      <span>{f.city} - {f.state}</span>
                      <span>•</span>
                      <span>{f.areaHectares} ha</span>
                    </div>
                  </div>
                )}
              </div>
            ))}

          {farms.filter((f) => f.clientId === selectedClientId).length === 0 && (
            <p className="text-slate-400 text-xs text-center py-5 font-normal">Nenhuma fazenda cadastrada para este cliente.</p>
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

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {plots
            .filter((p) => p.farmId === selectedFarmId)
            .map((p) => {
              const active = activePlotId === p.id;
              return (
                <div key={p.id}>
                  {editingPlotId === p.id ? (
                    <form 
                      onSubmit={(e) => handleSavePlotEdit(e, p.id)} 
                      className="p-3 bg-slate-50 border border-blue-300 rounded-lg text-xs space-y-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div>
                        <label className="block text-slate-500 font-medium mb-1">Nome do Talhão *</label>
                        <input
                          type="text"
                          required
                          value={editPlotName}
                          onChange={(e) => setEditPlotName(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="block text-slate-500 font-medium mb-1">Área (ha)</label>
                          <input
                            type="number"
                            value={editPlotArea}
                            onChange={(e) => setEditPlotArea(e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-medium mb-1">Cultura Comercial *</label>
                          <select
                            value={editPlotCrop}
                            onChange={(e) => setEditPlotCrop(e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-blue-500"
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
                      <div className="flex justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingPlotId(null)}
                          className="px-2 py-1 bg-slate-200 text-slate-650 rounded text-[10px] font-medium hover:bg-slate-350"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-2.5 py-1 bg-blue-600 text-white rounded text-[10px] font-semibold hover:bg-blue-750"
                        >
                          Salvar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div
                      onClick={() => onSelectPlot(p.id)}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all relative group ${
                        active
                          ? 'bg-blue-50/65 border-blue-400 font-semibold ring-1 ring-blue-300/30 shadow-sm'
                          : 'bg-white border-slate-100 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-1">
                        <h5 className="font-semibold text-slate-800 text-xs sm:text-sm truncate pr-16">{p.name}</h5>
                        
                        {/* Hover action buttons */}
                        <div className="absolute right-2 top-2.5 flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          {confirmDeletePlotId === p.id ? (
                            <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded text-[9px] font-bold text-amber-700">
                              <span>Confirmar?</span>
                              <button
                                onClick={(e) => handleDeletePlotAction(p.id, e)}
                                className="p-1 bg-rose-600 text-white rounded hover:bg-rose-700"
                                title="Confirmar exclusão"
                              >
                                <Check className="w-2.5 h-2.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDeletePlotId(null); }}
                                className="p-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
                                title="Cancelar"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditPlot(p);
                                }}
                                className="p-1 hover:bg-slate-100 text-slate-500 hover:text-blue-700 rounded transition-colors"
                                title="Editar Talhão"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeletePlotId(p.id);
                                }}
                                className="p-1 hover:bg-slate-100 text-slate-500 hover:text-rose-650 rounded transition-colors"
                                title="Excluir Talhão"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                        {active && !confirmDeletePlotId && <CheckCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 font-normal">
                        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold">
                          {p.cropType}
                        </span>
                        <span>{p.areaHectares} ha</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

          {plots.filter((p) => p.farmId === selectedFarmId).length === 0 && (
            <p className="text-slate-400 text-xs text-center py-5 font-normal">Nenhum talhão cadastrado para esta fazenda.</p>
          )}
        </div>
      </div>

      {/* 4. Projetos Column */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4.5 h-4.5 text-blue-600" />
            <h4 className="font-semibold text-slate-800 text-sm">Projetos de Amostragem</h4>
          </div>
          {activePlotId && (
            <button
              onClick={() => {
                setShowPeriodForm(showPeriodForm === activePlotId ? null : activePlotId);
                const today = new Date();
                const m = String(today.getMonth() + 1).padStart(2, '0');
                const y = today.getFullYear();
                setNewPeriodMonthYear(`${m}/${y}`);
              }}
              className="p-1 text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
              title="Adicionar Projeto"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Add Period Form */}
        {showPeriodForm === activePlotId && activePlotId && (
          <form 
            onSubmit={(e) => handleSubmitPeriod(e, activePlotId)}
            className="bg-slate-50 p-2.5 rounded border border-blue-200 text-[11px] space-y-2 mb-4"
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 font-bold mb-0.5">Mês/Ano *</label>
                <input
                  type="text"
                  required
                  value={newPeriodMonthYear}
                  onChange={(e) => setNewPeriodMonthYear(e.target.value)}
                  placeholder="Ex: 05/2026"
                  className="w-full px-1.5 py-1 bg-white border border-slate-205 rounded text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-normal"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-bold mb-0.5">Cultura *</label>
                <select
                  value={newPeriodCrop}
                  onChange={(e) => setNewPeriodCrop(e.target.value)}
                  className="w-full px-1.5 py-1 bg-white border border-slate-205 rounded text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-normal"
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
            <div>
              <label className="block text-slate-500 font-bold mb-0.5">Notas Observação</label>
              <input
                type="text"
                value={newPeriodNotes}
                onChange={(e) => setNewPeriodNotes(e.target.value)}
                placeholder="Notas da safra..."
                className="w-full px-1.5 py-1 bg-white border border-slate-205 rounded text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-normal"
              />
            </div>
            <div className="flex justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setShowPeriodForm(null)}
                className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-medium hover:bg-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-2.5 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold hover:bg-blue-700"
              >
                Gerar Projeto
              </button>
            </div>
          </form>
        )}

        {/* List of active periods for the selected plot */}
        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-0.5">
          {activePlotId ? (
            <>
              {plotPeriods
                .filter(period => period.plotId === activePlotId)
                .map(period => {
                  const isSelectedPeriod = activeMonthYear === period.monthYear;
                  
                  if (editingPeriodId === period.id) {
                    return (
                      <form
                        key={period.id}
                        onSubmit={(e) => handleSavePeriodEdit(e, period.id)}
                        className="p-2 bg-slate-50 border border-blue-300 rounded text-[10px] space-y-1.5"
                      >
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="block text-[9px] text-slate-400 font-bold mb-0.5">Mês/Ano</label>
                            <input
                              type="text"
                              required
                              value={editPeriodMonthYear}
                              onChange={(e) => setEditPeriodMonthYear(e.target.value)}
                              className="w-full px-1 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-800 font-normal"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] text-slate-400 font-bold mb-0.5">Cultura</label>
                            <select
                              value={editPeriodCrop}
                              onChange={(e) => setEditPeriodCrop(e.target.value)}
                              className="w-full px-1 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-800 font-normal"
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
                        <div>
                          <label className="block text-[9px] text-slate-400 font-bold mb-0.5">Notas</label>
                          <input
                            type="text"
                            value={editPeriodNotes}
                            onChange={(e) => setEditPeriodNotes(e.target.value)}
                            className="w-full px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-800 font-normal"
                          />
                        </div>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingPeriodId(null)}
                            className="px-1.5 py-0.5 bg-slate-205 text-slate-700 rounded text-[9px]"
                          >
                            Fechar
                          </button>
                          <button
                            type="submit"
                            className="px-2 py-0.5 bg-blue-600 text-white rounded text-[9px] font-bold"
                          >
                            Confirmar
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={period.id}
                      onClick={() => onSelectMonthYear(period.monthYear)}
                      className={`p-2 rounded border text-left cursor-pointer transition-all flex items-center justify-between gap-1 group/period ${
                        isSelectedPeriod
                          ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                          : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700 hover:border-slate-200 font-normal'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-10">
                        <Calendar className={`w-3.5 h-3.5 shrink-0 ${isSelectedPeriod ? 'text-white' : 'text-slate-450'}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-bold whitespace-nowrap">{period.monthYear}</span>
                            <span className={`px-1 py-0.1 rounded text-[8px] uppercase font-bold shrink-0 ${
                              isSelectedPeriod ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {period.cropType}
                            </span>
                          </div>
                          {period.notes && (
                            <p className={`text-[9px] truncate font-normal leading-none mt-0.5 ${isSelectedPeriod ? 'text-blue-150' : 'text-slate-450'}`}>
                              {period.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 opacity-90 sm:opacity-0 group-hover/period:opacity-100 transition-opacity">
                        {confirmDeletePeriodId === period.id ? (
                          <div className="flex items-center gap-0.5 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded text-[8px] font-bold text-amber-700">
                            <span>Deletar?</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeletePlotPeriod(period.id);
                                setConfirmDeletePeriodId(null);
                              }}
                              className="p-0.5 bg-rose-600 text-white rounded hover:bg-rose-700"
                            >
                              <Check className="w-1.5 h-1.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeletePeriodId(null);
                              }}
                              className="p-0.5 bg-slate-205 text-slate-600 rounded hover:bg-slate-300"
                            >
                              <X className="w-1.5 h-1.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditPeriod(period);
                              }}
                              className={`p-1 rounded transition-colors ${
                                isSelectedPeriod ? 'hover:bg-blue-700 text-white/90 hover:text-white' : 'hover:bg-slate-100 text-slate-400 hover:text-blue-600'
                              }`}
                              title="Editar Campanha"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeletePeriodId(period.id);
                              }}
                              className={`p-1 rounded transition-colors ${
                                isSelectedPeriod ? 'hover:bg-blue-700 text-white/90 hover:text-white' : 'hover:bg-slate-100 text-slate-400 hover:text-rose-605'
                              }`}
                              title="Excluir Campanha"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

              {plotPeriods.filter(period => period.plotId === activePlotId).length === 0 && (
                <div className="text-center py-5 bg-slate-50/55 rounded border border-dashed border-slate-200">
                  <p className="text-slate-400 text-[10px] font-normal italic">Sem campanhas registradas.</p>
                  <button
                    onClick={() => {
                      setShowPeriodForm(activePlotId);
                      const today = new Date();
                      const m = String(today.getMonth() + 1).padStart(2, '0');
                      const y = today.getFullYear();
                      setNewPeriodMonthYear(`${m}/${y}`);
                    }}
                    className="mt-1 text-[9px] text-blue-600 font-semibold underline hover:text-blue-700"
                  >
                    Criar Primeiro Período
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-5 bg-slate-50/50 rounded border border-dashed border-slate-200 text-slate-400 text-[10px] italic">
              Selecione um talhão ao lado para visualizar e gerenciar seus projetos de amostragem.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
