import React, { useState } from 'react';
import { useSettings, updateSettings } from '../lib/settings';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  Loader2, Plus, Trash2, Save, Settings, 
  Factory, Activity, Target, AlertCircle 
} from 'lucide-react';

export default function Configuration() {
  const { settings, loading } = useSettings();
  const [isSaving, setIsSaving] = useState(false);
  
  // Local state for editing
  const [localSettings, setLocalSettings] = useState(settings);
  const [newLine, setNewLine] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newFactor, setNewFactor] = useState('1.0');

  // Sync local state when settings load
  React.useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  if (loading || !localSettings) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings(localSettings);
      toast.success('Configuración guardada correctamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings');
    } finally {
      setIsSaving(false);
    }
  };

  const addLine = () => {
    if (!newLine.trim()) return;
    if (localSettings.lines.includes(newLine.trim())) {
      toast.error('La línea ya existe');
      return;
    }
    const updatedLines = [...localSettings.lines, newLine.trim()];
    setLocalSettings({
      ...localSettings,
      lines: updatedLines,
      lineConfigs: {
        ...localSettings.lineConfigs,
        [newLine.trim()]: { basePlan: 4.1 }
      }
    });
    setNewLine('');
  };

  const removeLine = (line: string) => {
    const updatedLines = localSettings.lines.filter(l => l !== line);
    const updatedConfigs = { ...localSettings.lineConfigs };
    delete updatedConfigs[line];
    setLocalSettings({
      ...localSettings,
      lines: updatedLines,
      lineConfigs: updatedConfigs
    });
  };

  const addStatus = () => {
    if (!newStatus.trim()) return;
    if (localSettings.statusFactors[newStatus.trim()] !== undefined) {
      toast.error('El estatus ya existe');
      return;
    }
    setLocalSettings({
      ...localSettings,
      statusFactors: {
        ...localSettings.statusFactors,
        [newStatus.trim()]: parseFloat(newFactor) || 0
      }
    });
    setNewStatus('');
    setNewFactor('1.0');
  };

  const removeStatus = (status: string) => {
    const updatedFactors = { ...localSettings.statusFactors };
    delete updatedFactors[status];
    setLocalSettings({
      ...localSettings,
      statusFactors: updatedFactors
    });
  };

  const updateLinePlan = (line: string, plan: string) => {
    setLocalSettings({
      ...localSettings,
      lineConfigs: {
        ...localSettings.lineConfigs,
        [line]: { basePlan: parseFloat(plan) || 0 }
      }
    });
  };

  const updateStatusFactor = (status: string, factor: string) => {
    setLocalSettings({
      ...localSettings,
      statusFactors: {
        ...localSettings.statusFactors,
        [status]: parseFloat(factor) || 0
      }
    });
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Configuración de Planta</h2>
          <p className="text-slate-500 mt-1">Gestiona líneas, estatus operativos y parámetros de producción</p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100"
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Guardar Cambios
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Lines Configuration */}
        <Card className="border-none shadow-md overflow-hidden">
          <div className="h-1 w-full bg-blue-500" />
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center">
              <Factory className="mr-2 h-5 w-5 text-blue-500" />
              Líneas de Producción
            </CardTitle>
            <CardDescription>Define las líneas activas y su plan base (Ton/Hr)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-2">
              <Input 
                placeholder="Nueva línea..." 
                value={newLine} 
                onChange={(e) => setNewLine(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addLine()}
              />
              <Button onClick={addLine} variant="secondary">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="rounded-lg border border-slate-100 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Línea</TableHead>
                    <TableHead className="w-[120px]">Plan Base</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localSettings.lines.map(line => (
                    <TableRow key={line}>
                      <TableCell className="font-medium">{line}</TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          step="0.1"
                          value={localSettings.lineConfigs[line]?.basePlan || 0}
                          onChange={(e) => updateLinePlan(line, e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeLine(line)}
                          className="h-8 w-8 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Status Factors Configuration */}
        <Card className="border-none shadow-md overflow-hidden">
          <div className="h-1 w-full bg-amber-500" />
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center">
              <Activity className="mr-2 h-5 w-5 text-amber-500" />
              Estatus Operativos
            </CardTitle>
            <CardDescription>Factores de cumplimiento por estatus (0.0 - 1.0)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-2">
              <Input 
                placeholder="Nuevo estatus..." 
                value={newStatus} 
                onChange={(e) => setNewStatus(e.target.value)}
              />
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  step="0.1" 
                  placeholder="Factor" 
                  value={newFactor} 
                  onChange={(e) => setNewFactor(e.target.value)}
                />
                <Button onClick={addStatus} variant="secondary">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Estatus</TableHead>
                    <TableHead className="w-[120px]">Factor</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(localSettings.statusFactors).map(([status, factor]) => (
                    <TableRow key={status}>
                      <TableCell className="font-medium">{status}</TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          step="0.1"
                          value={factor}
                          onChange={(e) => updateStatusFactor(status, e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeStatus(status)}
                          className="h-8 w-8 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Global Parameters */}
        <Card className="border-none shadow-md overflow-hidden lg:col-span-2">
          <div className="h-1 w-full bg-slate-800" />
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center">
              <Settings className="mr-2 h-5 w-5 text-slate-800" />
              Parámetros Globales
            </CardTitle>
            <CardDescription>Límites y validaciones del sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Producción Máxima (Ton/Hr)</Label>
                    <p className="text-sm text-slate-500">Límite superior para alertas de captura</p>
                  </div>
                  <div className="w-32">
                    <Input 
                      type="number" 
                      step="0.1"
                      value={localSettings.maxProduction}
                      onChange={(e) => setLocalSettings({...localSettings, maxProduction: parseFloat(e.target.value) || 0})}
                      className="font-mono text-right"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-slate-400 mt-0.5" />
                <div className="text-xs text-slate-500 leading-relaxed">
                  <p className="font-semibold text-slate-700 mb-1">Nota sobre cambios:</p>
                  Los cambios en el Plan Base y Factores de Estatus afectarán los cálculos de cumplimiento para las **nuevas capturas**. Los registros históricos mantendrán los valores con los que fueron guardados originalmente.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
