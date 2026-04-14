import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { useSettings } from '../lib/settings';
import { SHIFTS, SKUS } from '../constants';
import { OperationalStatus, ProductionRecord, Supervisor } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Save, CheckCircle2, History, Clock } from 'lucide-react';

export default function ProductionForm() {
  const { settings, loading: settingsLoading } = useSettings();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [shiftNumber, setShiftNumber] = useState<1 | 2 | 3>(1);
  const [line, setLine] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [sku, setSku] = useState(SKUS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);

  // Sync line with settings when loaded
  useEffect(() => {
    if (settings && settings.lines.length > 0 && !line) {
      setLine(settings.lines[0]);
    }
  }, [settings, line]);

  // Hourly data state
  const [hourlyData, setHourlyData] = useState<Record<string, { id?: string; status: OperationalStatus; real: string; feed: string; injection: string }>>({});
  const [savingHours, setSavingHours] = useState<Record<string, boolean>>({});

  const currentShift = SHIFTS.find(s => s.number === shiftNumber)!;

  // Load existing records for the selected context
  useEffect(() => {
    if (!line || !date) return;

    const q = query(
      collection(db, 'production'),
      where('date', '==', date),
      where('shift', '==', shiftNumber),
      where('line', '==', line)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const existingRecords: Record<string, { id?: string; status: OperationalStatus; real: string; feed: string; injection: string }> = {};
      
      // Initialize with default values first
      currentShift.hours.forEach((hour, index) => {
        let defaultStatus: OperationalStatus = 'Proceso';
        if (index === 0) defaultStatus = 'Arranque';
        else if (index === currentShift.hours.length - 1) defaultStatus = 'Fin/cambio';
        
        existingRecords[hour] = { status: defaultStatus, real: '', feed: '', injection: '' };
      });

      // Overlay existing data
      snapshot.docs.forEach(doc => {
        const data = doc.data() as ProductionRecord;
        existingRecords[data.hour] = {
          id: doc.id,
          status: data.status,
          real: data.real.toString(),
          feed: data.feed?.toString() || '',
          injection: data.injection?.toString() || ''
        };
      });

      setHourlyData(existingRecords);
    });

    return () => unsubscribe();
  }, [date, shiftNumber, line]);

  const handleSupervisorChange = (name: string) => {
    setSupervisor(name);
    const sup = supervisors.find(s => s.name === name);
    if (sup && sup.line) {
      setLine(sup.line);
    }
  };

  const handleStatusChange = (hour: string, status: OperationalStatus) => {
    setHourlyData(prev => ({
      ...prev,
      [hour]: { ...prev[hour], status }
    }));
  };

  const saveHour = async (hour: string) => {
    if (!supervisor) {
      toast.error('Selecciona un supervisor antes de guardar');
      return;
    }

    setSavingHours(prev => ({ ...prev, [hour]: true }));
    try {
      const data = hourlyData[hour];
      const realNum = parseFloat(data.real) || 0;
      const feedNum = parseFloat(data.feed) || 0;
      const injectionNum = parseFloat(data.injection) || 0;
      const plan = calculatePlan(data.status);
      const compliance = calculateCompliance(realNum, plan);

      const recordData = {
        date,
        shift: shiftNumber,
        hour,
        line,
        supervisor,
        sku,
        status: data.status,
        plan,
        real: realNum,
        feed: feedNum,
        injection: injectionNum,
        compliance,
        timestamp: serverTimestamp()
      };

      if (data.id) {
        await updateDoc(doc(db, 'production', data.id), recordData);
      } else {
        const docRef = await addDoc(collection(db, 'production'), recordData);
        setHourlyData(prev => ({
          ...prev,
          [hour]: { ...prev[hour], id: docRef.id }
        }));
      }
      toast.success(`Hora ${hour} guardada`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'production');
    } finally {
      setSavingHours(prev => ({ ...prev, [hour]: false }));
    }
  };

  const handleRealChange = (hour: string, value: string) => {
    // Allow typing decimals without jumping
    const numValue = parseFloat(value) || 0;
    if (numValue > settings.maxProduction) {
      toast.warning(`Producción excede el límite de ${settings.maxProduction} toneladas`);
    }
    setHourlyData(prev => ({
      ...prev,
      [hour]: { ...prev[hour], real: value }
    }));
  };

  const handleFeedChange = (hour: string, value: string) => {
    setHourlyData(prev => ({
      ...prev,
      [hour]: { ...prev[hour], feed: value }
    }));
  };

  const handleInjectionChange = (hour: string, value: string) => {
    setHourlyData(prev => ({
      ...prev,
      [hour]: { ...prev[hour], injection: value }
    }));
  };

  const calculatePlan = (status: OperationalStatus) => {
    const basePlan = settings.lineConfigs[line]?.basePlan || 4.1;
    const factor = settings.statusFactors[status] ?? 1.0;
    return parseFloat((basePlan * factor).toFixed(2));
  };

  const calculateCompliance = (real: number, plan: number) => {
    if (plan === 0) return real > 0 ? 100 : 0;
    return Math.round((real / plan) * 100);
  };

  const getComplianceColor = (compliance: number) => {
    if (compliance >= 100) return 'bg-green-100 text-green-800 border-green-200';
    if (compliance >= 80) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const recordsToSave = currentShift.hours
        .map(hour => {
          const data = hourlyData[hour];
          const realNum = parseFloat(data.real) || 0;
          const feedNum = parseFloat(data.feed) || 0;
          const injectionNum = parseFloat(data.injection) || 0;
          const plan = calculatePlan(data.status);
          const compliance = calculateCompliance(realNum, plan);

          return {
            hour,
            id: data.id,
            data: {
              date,
              shift: shiftNumber,
              hour,
              line,
              supervisor,
              sku,
              status: data.status,
              plan,
              real: realNum,
              feed: feedNum,
              injection: injectionNum,
              compliance,
              timestamp: serverTimestamp()
            }
          };
        })
        .filter(record => record.data.real > 0 || record.data.status !== 'Proceso');

      if (recordsToSave.length === 0) {
        toast.error('No hay datos para guardar.');
        setIsSubmitting(false);
        return;
      }

      const batchPromises = recordsToSave.map(record => {
        if (record.id) {
          return updateDoc(doc(db, 'production', record.id), record.data);
        } else {
          return addDoc(collection(db, 'production'), record.data);
        }
      });
      
      await Promise.all(batchPromises);
      
      toast.success('Turno actualizado correctamente', {
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'production');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    // Load supervisors
    const q = query(collection(db, 'supervisors'), where('active', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Supervisor[];
      setSupervisors(data);
      if (data.length > 0 && !supervisor) setSupervisor(data[0].name);
    });
    return () => unsubscribe();
  }, []);

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <Card className="border-none shadow-md bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-slate-800">Captura de Producción</CardTitle>
          <CardDescription>Registro operativo por hora para supervisores</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Fecha</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift">Turno</Label>
              <Select value={shiftNumber.toString()} onValueChange={(v) => setShiftNumber(parseInt(v) as 1 | 2 | 3)}>
                <SelectTrigger id="shift">
                  <SelectValue placeholder="Seleccionar turno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Turno 1 (06:30 - 14:30)</SelectItem>
                  <SelectItem value="2">Turno 2 (14:30 - 22:30)</SelectItem>
                  <SelectItem value="3">Turno 3 (22:30 - 06:30)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="line">Línea</Label>
              <Select value={line} onValueChange={setLine}>
                <SelectTrigger id="line">
                  <SelectValue placeholder="Seleccionar línea" />
                </SelectTrigger>
                <SelectContent>
                  {settings.lines.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supervisor">Supervisor</Label>
              <Select value={supervisor} onValueChange={handleSupervisorChange}>
                <SelectTrigger id="supervisor">
                  <SelectValue placeholder="Seleccionar supervisor" />
                </SelectTrigger>
                <SelectContent>
                  {supervisors.map(s => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Select value={sku} onValueChange={setSku}>
                <SelectTrigger id="sku">
                  <SelectValue placeholder="Seleccionar SKU" />
                </SelectTrigger>
                <SelectContent>
                  {SKUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block rounded-xl border border-slate-200 overflow-hidden bg-white">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-[140px]">Hora</TableHead>
                  <TableHead className="w-[160px]">Estatus</TableHead>
                  <TableHead className="w-[120px]">Aliment. (Ton)</TableHead>
                  <TableHead className="w-[100px]">% Inyec.</TableHead>
                  <TableHead className="w-[120px]">Real (Ton)</TableHead>
                  <TableHead className="w-[100px]">Plan (Ton)</TableHead>
                  <TableHead className="text-right w-[120px]">% Cumpl.</TableHead>
                  <th className="w-[50px]"></th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentShift.hours.map((hour) => {
                  const data = hourlyData[hour] || { status: 'Proceso', real: '', feed: '', injection: '' };
                  const realNum = parseFloat(data.real) || 0;
                  const plan = calculatePlan(data.status);
                  const compliance = calculateCompliance(realNum, plan);
                  const isSaving = savingHours[hour];

                  return (
                    <TableRow key={hour} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-medium text-slate-700">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {hour}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select value={data.status} onValueChange={(v) => handleStatusChange(hour, v as OperationalStatus)}>
                          <SelectTrigger className="h-9 border-slate-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(settings.statusFactors).map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          step="0.1"
                          className="h-9 border-slate-200"
                          value={data.feed} 
                          onChange={(e) => handleFeedChange(hour, e.target.value)}
                          placeholder="0.0"
                        />
                      </TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          step="0.1"
                          className="h-9 border-slate-200"
                          value={data.injection} 
                          onChange={(e) => handleInjectionChange(hour, e.target.value)}
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          step="0.1"
                          min="0"
                          max={settings.maxProduction}
                          className="h-9 border-slate-200 font-bold text-indigo-600"
                          value={data.real} 
                          onChange={(e) => handleRealChange(hour, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder="0.0"
                        />
                      </TableCell>
                      <TableCell className="text-slate-500 font-mono text-xs">{plan.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={`${getComplianceColor(compliance)} border font-semibold`}>
                          {compliance}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className={`h-8 w-8 ${data.id ? 'text-green-500' : 'text-slate-300'}`}
                          onClick={() => saveHour(hour)}
                          disabled={isSaving}
                        >
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {currentShift.hours.map((hour) => {
              const data = hourlyData[hour] || { status: 'Proceso', real: '', feed: '', injection: '' };
              const realNum = parseFloat(data.real) || 0;
              const plan = calculatePlan(data.status);
              const compliance = calculateCompliance(realNum, plan);
              const isSaving = savingHours[hour];

              return (
                <div key={hour} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                    <div className="flex items-center gap-2 font-bold text-slate-700">
                      <Clock className="h-4 w-4 text-indigo-500" />
                      {hour}
                    </div>
                    <Badge variant="outline" className={`${getComplianceColor(compliance)} border font-bold`}>
                      {compliance}%
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Estatus</Label>
                      <Select value={data.status} onValueChange={(v) => handleStatusChange(hour, v as OperationalStatus)}>
                        <SelectTrigger className="h-10 border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(settings.statusFactors).map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Plan (Ton)</Label>
                      <div className="h-10 flex items-center px-3 bg-slate-50 rounded-md border border-slate-100 text-slate-500 font-mono font-bold">
                        {plan.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Aliment.</Label>
                      <Input 
                        type="number" 
                        step="0.1"
                        className="h-10 border-slate-200"
                        value={data.feed} 
                        onChange={(e) => handleFeedChange(hour, e.target.value)}
                        placeholder="0.0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">% Inyec.</Label>
                      <Input 
                        type="number" 
                        step="0.1"
                        className="h-10 border-slate-200"
                        value={data.injection} 
                        onChange={(e) => handleInjectionChange(hour, e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold text-indigo-600">Real (Ton)</Label>
                      <Input 
                        type="number" 
                        step="0.1"
                        className="h-10 border-indigo-200 focus:border-indigo-500 font-bold text-indigo-600"
                        value={data.real} 
                        onChange={(e) => handleRealChange(hour, e.target.value)}
                        placeholder="0.0"
                      />
                    </div>
                  </div>

                  <Button 
                    className={`w-full h-11 ${data.id ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                    variant={data.id ? 'secondary' : 'default'}
                    onClick={() => saveHour(hour)}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    {data.id ? 'Actualizar Hora' : 'Guardar Hora'}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-4">
            <Button 
              size="lg" 
              onClick={handleSubmit} 
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 px-8"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-5 w-5" />
                  Guardar Turno
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
