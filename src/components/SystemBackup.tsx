import React, { useState, useRef } from 'react';
import { 
  Database, Download, Upload, Info, RefreshCw, CheckCircle2, 
  AlertTriangle, ShieldCheck, FileJson, Trash2
} from 'lucide-react';
import { Client, Farm, Plot, SamplingPoint, Project, PlotPeriod } from '../types';

interface SystemBackupProps {
  clients: Client[];
  farms: Farm[];
  plots: Plot[];
  plotPeriods: PlotPeriod[];
  samplingPoints: SamplingPoint[];
  projects: Project[];
  dbStatus: 'connecting' | 'connected' | 'error';
  onRestoreBackup: (data: {
    clients?: Client[];
    farms?: Farm[];
    plots?: Plot[];
    plotPeriods?: PlotPeriod[];
    samplingPoints?: SamplingPoint[];
    projects?: Project[];
  }) => Promise<void>;
  onResetDatabaseToStaticDefaults: () => Promise<void>;
}

export default function SystemBackup({
  clients,
  farms,
  plots,
  plotPeriods,
  samplingPoints,
  projects,
  dbStatus,
  onRestoreBackup,
  onResetDatabaseToStaticDefaults,
}: SystemBackupProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);
  const [pendingBackupData, setPendingBackupData] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download the JSON file
  const handleExportBackup = () => {
    setIsExporting(true);
    try {
      const backupObj = {
        version: '1.2',
        software: 'GeoSolo Pro',
        exporter: 'luis.netofms@gmail.com',
        timestamp: new Date().toISOString(),
        clients,
        farms,
        plots,
        plotPeriods,
        samplingPoints,
        projects
      };

      const jsonString = JSON.stringify(backupObj, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      // Beautifully structured dynamic name
      const dateStr = new Date().toISOString().slice(0, 10);
      const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
      link.download = `geosolo_backup_${dateStr}_${timeStr}.json`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatusMessage({
        text: 'Backup exportado com sucesso! Salvo localmente em sua máquina.',
        type: 'success'
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        text: `Erro ao exportar backup: ${err.message || err}`,
        type: 'error'
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Validate properties in uploaded JSON file
  const validateAndPrepareBackup = (jsonData: any) => {
    try {
      if (!jsonData || typeof jsonData !== 'object') {
        throw new Error('O arquivo de backup não é um objeto JSON válido.');
      }
      
      // We look for at least one of the main collections
      const hasCollections = 
        Array.isArray(jsonData.clients) ||
        Array.isArray(jsonData.farms) ||
        Array.isArray(jsonData.plots) ||
        Array.isArray(jsonData.samplingPoints) ||
        Array.isArray(jsonData.projects);

      if (!hasCollections) {
        throw new Error('Este arquivo não parece conter dados da plataforma GeoSolo (ausência de coleções válidas).');
      }

      setPendingBackupData(jsonData);
      setShowConfirmRestore(true);
      setStatusMessage(null);
    } catch (err: any) {
      setStatusMessage({
        text: `Falha na validação do arquivo: ${err.message}`,
        type: 'error'
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          validateAndPrepareBackup(parsed);
        } catch (err) {
          setStatusMessage({
            text: 'O arquivo carregado não é um arquivo JSON válido.',
            type: 'error'
          });
        }
      };
      reader.readAsText(file);
    }
  };

  const executeRestore = async () => {
    if (!pendingBackupData) return;
    setIsImporting(true);
    setShowConfirmRestore(false);
    try {
      await onRestoreBackup(pendingBackupData);
      setStatusMessage({
        text: `Backup restaurado com sucesso! Banco de dados atualizado e sincronizado.`,
        type: 'success'
      });
      setPendingBackupData(null);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        text: `Erro ao restaurar banco de dados: ${err.message || err}`,
        type: 'error'
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          validateAndPrepareBackup(parsed);
        } catch (err) {
          setStatusMessage({
            text: 'O arquivo arrastado não é um arquivo JSON válido.',
            type: 'error'
          });
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm" id="system-backup-panel">
      {/* Visual Header Banner */}
      <div className="bg-slate-900 px-6 py-5 text-white flex justify-between items-center relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 opacity-10 pointer-events-none">
          <Database className="w-64 h-64 text-white" />
        </div>
        <div className="z-10">
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 font-mono text-[9px] font-extrabold uppercase tracking-widest">
              Ambiente de Sistema
            </span>
          </div>
          <h2 className="text-lg font-black font-heading mt-1">Painel Administrativo & Backup de Dados</h2>
          <p className="text-xs text-slate-400 mt-0.5">Gestão local, auditoria estruturada e salvamento persistente do GeoSolo Pro.</p>
        </div>
        <div className="hidden md:flex gap-1.5 shrink-0 z-10 font-mono text-[10px] text-slate-300 bg-slate-800/60 border border-slate-700/60 p-2 rounded-lg">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Status do Database: <strong className={dbStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400 font-bold'}>{dbStatus === 'connected' ? 'ONLINE' : 'LIMITADO'}</strong></span>
        </div>
      </div>

      {/* Grid of Contents */}
      <div className="p-6 space-y-6">
        
        {/* Statistics Block */}
        <div>
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3">Métricas Legíveis do Sistema</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center transition-all hover:shadow-inner hover:bg-slate-100/50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">Clientes</span>
              <strong className="text-lg font-black text-slate-800 block mt-1">{clients.length}</strong>
              <span className="text-[9px] text-slate-400 font-mono">cadastrados</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center transition-all hover:shadow-inner hover:bg-slate-100/50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">Fazendas</span>
              <strong className="text-lg font-black text-slate-800 block mt-1">{farms.length}</strong>
              <span className="text-[9px] text-slate-400 font-mono">conectadas</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center transition-all hover:shadow-inner hover:bg-slate-100/50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">Talhões</span>
              <strong className="text-lg font-black text-slate-800 block mt-1">{plots.length}</strong>
              <span className="text-[9px] text-slate-400 font-mono">georreferenciados</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center transition-all hover:shadow-inner hover:bg-slate-100/50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">Amostras (Pontos)</span>
              <strong className="text-lg font-black text-slate-850 block mt-1">{samplingPoints.length}</strong>
              <span className="text-[9px] text-slate-400 font-mono">furos de trado</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center transition-all hover:shadow-inner hover:bg-slate-100/50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">Projetos Ativos</span>
              <strong className="text-lg font-black text-slate-800 block mt-1">{projects.length}</strong>
              <span className="text-[9px] text-slate-400 font-mono">grades de solo</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center transition-all hover:shadow-inner hover:bg-slate-100/50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">Períodos de Safra</span>
              <strong className="text-lg font-black text-slate-800 block mt-1">{plotPeriods.length}</strong>
              <span className="text-[9px] text-slate-400 font-mono">catalogados</span>
            </div>
          </div>
        </div>

        {/* Global Action Status Message */}
        {statusMessage && (
          <div className={`p-4 rounded-lg flex items-start gap-3 border text-xs leading-relaxed ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-indigo-50 border-indigo-200 text-indigo-800'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : statusMessage.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold uppercase tracking-tight">GeoSolo Notificação</p>
              <p className="mt-0.5 font-medium">{statusMessage.text}</p>
            </div>
          </div>
        )}

        {/* Action Panel Splits */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Export card */}
          <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/50 flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded bg-purple-100 text-purple-700">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-850 uppercase tracking-tight">Salvar Backup Local</h4>
                  <p className="text-[10px] text-slate-400">Exportar todos os registros para backup manual offline.</p>
                </div>
              </div>
              <div className="text-xs text-slate-600 mt-4 space-y-2 leading-relaxed">
                <p>
                  Esta ferramenta consolida todas as fazendas, talhões georreferenciados, furos de amostragem, laudos laboratoriais e laudos de diagnóstico IA em um único arquivo de dados no formato de codificação estruturada JSON.
                </p>
                <div className="bg-white border border-slate-100 p-3 rounded text-[11px] font-mono text-slate-500">
                  ● Formato de saída: <strong className="text-purple-700">geosolo_backup_AAAA-MM-DD.json</strong><br />
                  ● Compatível com qualquer instalação GeoSolo Pro.<br />
                  ● Seguro para arquivamento externo.
                </div>
              </div>
            </div>
            
            <button
              onClick={handleExportBackup}
              disabled={isExporting}
              className="mt-6 w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{isExporting ? 'Processando Backup...' : 'Exportar Ficheiro (.json)'}</span>
            </button>
          </div>

          {/* Import card with Drag & Drop */}
          <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/50 flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded bg-indigo-100 text-indigo-700">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-850 uppercase tracking-tight">Carregar Backup Existente</h4>
                  <p className="text-[10px] text-slate-400">Restaurar registros a partir de um arquivo .json.</p>
                </div>
              </div>

              {/* Drag Area */}
              <div
                className={`border-2 border-dashed rounded-lg p-5 mt-4 text-center cursor-pointer transition-all ${
                  dragActive 
                    ? 'border-indigo-500 bg-indigo-50/60' 
                    : 'border-slate-250 bg-white hover:border-indigo-350 hover:bg-slate-50/20'
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <FileJson className={`w-8 h-8 mx-auto ${dragActive ? 'text-indigo-600 animate-bounce' : 'text-slate-400'}`} />
                <p className="text-xs font-bold text-slate-700 mt-2">Clique para selecionar ou arraste o arquivo aqui</p>
                <p className="text-[10px] text-slate-400 mt-1">Apenas arquivos no formato (.json) gerados pelo GeoSolo Pro</p>
              </div>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="mt-4 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>Selecionar Arquivo de Backup</span>
            </button>
          </div>

        </div>

        {/* Informative Guidance */}
        <div className="border-t border-slate-100 pt-5 flex gap-3 text-[11px] text-slate-400 leading-relaxed">
          <Info className="w-4.5 h-4.5 text-purple-400 shrink-0 mt-0.5" />
          <p>
            <strong>Nota de Segurança e Redundância:</strong> Os backups locais transferem a responsabilidade de armazenamento para o produtor. Certifique-se de realizar backups recorrentes após concluir coletas ou cadastrar dados em áreas desconectadas (offline). O GeoSolo Pro criptografa o transporte seguro, mantendo a nuvem Firestore sempre atualizada de forma cooperativa.
          </p>
        </div>

      </div>

      {/* Confirmation Modal - RESTORE RESTORATION */}
      {showConfirmRestore && pendingBackupData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-indigo-100 rounded-full text-indigo-700 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 border-b border-slate-100 pb-1 uppercase font-heading">
                  Confirmar Restauração de Backup?
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Esta ação irá substituir as informações de clientes, fazendas, talhões e coletas do seu banco de dados na nuvem Firestore e carregar todos os dados do arquivo selecionado abaixo:
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-150 p-3 rounded text-xs text-slate-650 space-y-1.5 font-mono">
              <p>● Banco Origem: <span className="font-bold text-slate-800">{pendingBackupData.software || 'GeoSolo Indefinido'}</span></p>
              <p>● Data de Geração: <span className="font-bold text-slate-800">{pendingBackupData.timestamp ? new Date(pendingBackupData.timestamp).toLocaleString('pt-BR') : 'Indisponível'}</span></p>
              <p>● Clientes para Adicionar: <span className="font-bold text-indigo-700">{pendingBackupData.clients?.length || 0}</span></p>
              <p>● Fazendas para Adicionar: <span className="font-bold text-indigo-700">{pendingBackupData.farms?.length || 0}</span></p>
              <p>● Talhões para Adicionar: <span className="font-bold text-indigo-700">{pendingBackupData.plots?.length || 0}</span></p>
              <p>● Amostras para Adicionar: <span className="font-bold text-indigo-700">{pendingBackupData.samplingPoints?.length || 0}</span></p>
            </div>

            <div className="flex gap-2.5 justify-end pt-2">
              <button
                onClick={() => {
                  setPendingBackupData(null);
                  setShowConfirmRestore(false);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={executeRestore}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded shadow-sm hover:shadow transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Sim, Restaurar Banco</span>
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
