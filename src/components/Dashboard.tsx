import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useSettings } from '../lib/settings';
import { ProductionRecord, Supervisor } from '../types';
import { SHIFTS } from '../constants';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  Line, Cell, AreaChart, Area, ComposedChart
} from 'recharts';
import { 
  TrendingUp, Users, Target, Calendar as CalendarIcon, 
  RefreshCw, BarChart3, Download, Filter, 
  ArrowUpRight, ArrowDownRight, Activity,
  Trash2, Edit3, Check, X, Eye
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { auth } from '../lib/firebase';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function Dashboard() {
  const { settings, loading: settingsLoading } = useSettings();
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  
  // Advanced Filters State
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [selectedLines, setSelectedLines] = useState<string[]>(['all']);
  const [selectedShift, setSelectedShift] = useState<string>('all');
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('all');

  useEffect(() => {
    // Load supervisors
    const qSup = query(collection(db, 'supervisors'));
    const unsubSup = onSnapshot(qSup, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Supervisor[];
      setSupervisors(data);
    });

    // Load records - Sort by date DESC to see most recent first
    const qRec = query(collection(db, 'production'), orderBy('date', 'desc'), orderBy('hour', 'desc'));
    const unsubRec = onSnapshot(qRec, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProductionRecord[];
      setRecords(data);
      setLoading(false);
    });

    return () => {
      unsubSup();
      unsubRec();
    };
  }, []);

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const rDate = parseISO(r.date);
      const from = startOfDay(parseISO(dateFrom));
      const to = endOfDay(parseISO(dateTo));
      
      const dateMatch = isWithinInterval(rDate, { start: from, end: to });
      const lineMatch = selectedLines.includes('all') || selectedLines.includes(r.line);
      const shiftMatch = selectedShift === 'all' || r.shift.toString() === selectedShift;
      const supervisorMatch = selectedSupervisor === 'all' || r.supervisor === selectedSupervisor;
      
      const hasContent = r.real > 0 || r.status !== 'Proceso';
      
      return dateMatch && lineMatch && shiftMatch && supervisorMatch && hasContent;
    });
  }, [records, dateFrom, dateTo, selectedLines, selectedShift, selectedSupervisor]);

  const groupedRecords = useMemo(() => {
    const groups: Record<string, {
      id: string;
      date: string;
      shift: number;
      line: string;
      supervisor: string;
      plan: number;
      real: number;
      compliance: number;
      hourlyRecords: ProductionRecord[];
    }> = {};

    filteredRecords.forEach(r => {
      const key = `${r.date}-${r.shift}-${r.line}-${r.supervisor}`;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          date: r.date,
          shift: r.shift,
          line: r.line,
          supervisor: r.supervisor,
          plan: 0,
          real: 0,
          compliance: 0,
          hourlyRecords: []
        };
      }
      groups[key].plan += r.plan;
      groups[key].real += r.real;
      groups[key].hourlyRecords.push(r);
    });

    return Object.values(groups).map(g => ({
      ...g,
      compliance: g.plan > 0 ? (g.real / g.plan) * 100 : 0,
      // Sort hourly records by hour string
      hourlyRecords: g.hourlyRecords.sort((a, b) => a.hour.localeCompare(b.hour))
    })).sort((a, b) => b.date.localeCompare(a.date) || b.shift - a.shift);
  }, [filteredRecords]);

  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const activeGroup = useMemo(() => {
    if (!selectedGroup) return null;
    return groupedRecords.find(g => g.id === selectedGroup.id) || null;
  }, [groupedRecords, selectedGroup]);
  
  const isAdmin = auth.currentUser?.email === 'fecarrillo@ayvi.com.mx';
  const kpis = useMemo(() => {
    const totalReal = filteredRecords.reduce((acc, r) => acc + r.real, 0);
    const totalPlan = filteredRecords.reduce((acc, r) => acc + r.plan, 0);
    const compliance = totalPlan > 0 ? (totalReal / totalPlan) * 100 : 0;
    
    return {
      real: totalReal.toFixed(1),
      plan: totalPlan.toFixed(1),
      compliance: compliance.toFixed(1),
      isPositive: compliance >= 100
    };
  }, [filteredRecords]);

  // Dynamic Trend Chart Data
  const trendData = useMemo(() => {
    const isSingleDay = dateFrom === dateTo;
    
    if (isSingleDay) {
      // Determine which hours to show
      let hoursToShow: string[] = [];
      if (selectedShift !== 'all') {
        const shift = SHIFTS.find(s => s.number.toString() === selectedShift);
        hoursToShow = shift ? [...shift.hours] : [];
      } else {
        // All hours that have data in the filtered set
        hoursToShow = (Array.from(new Set(filteredRecords.map(r => r.hour))) as string[]).sort();
      }

      return hoursToShow.map(h => {
        const hourRecords = filteredRecords.filter(r => r.hour === h);
        return {
          name: h.split(' - ')[0],
          real: hourRecords.reduce((acc, r) => acc + r.real, 0),
          plan: hourRecords.reduce((acc, r) => acc + r.plan, 0)
        };
      });
    } else {
      // Group by Date
      const dates = Array.from(new Set(filteredRecords.map(r => r.date))).sort();
      return dates.map(d => {
        const dateRecords = filteredRecords.filter(r => r.date === d);
        return {
          name: format(parseISO(d as string), 'dd/MM'),
          real: dateRecords.reduce((acc, r) => acc + r.real, 0),
          plan: dateRecords.reduce((acc, r) => acc + r.plan, 0)
        };
      });
    }
  }, [filteredRecords, dateFrom, dateTo, selectedShift]);

  // Comparison Charts Data
  const shiftComparison = useMemo(() => {
    return [1, 2, 3].map(s => {
      const shiftRecords = filteredRecords.filter(r => r.shift === s);
      const real = shiftRecords.reduce((acc, r) => acc + r.real, 0);
      const plan = shiftRecords.reduce((acc, r) => acc + r.plan, 0);
      return {
        name: `T${s}`,
        compliance: plan > 0 ? (real / plan) * 100 : 0
      };
    });
  }, [filteredRecords]);

  const lineComparison = useMemo(() => {
    return settings.lines.map(l => {
      const lineRecords = filteredRecords.filter(r => r.line === l);
      const real = lineRecords.reduce((acc, r) => acc + r.real, 0);
      const plan = lineRecords.reduce((acc, r) => acc + r.plan, 0);
      return {
        name: l,
        compliance: plan > 0 ? (real / plan) * 100 : 0
      };
    });
  }, [filteredRecords, settings.lines]);

  const exportToCSV = () => {
    const headers = ['Fecha', 'Turno', 'Hora', 'Línea', 'Supervisor', 'SKU', 'Estatus', 'Plan', 'Real', '% Cumplimiento'];
    const rows = filteredRecords.map(r => [
      r.date,
      r.shift,
      r.hour,
      r.line,
      r.supervisor,
      r.sku,
      r.status,
      r.plan,
      r.real,
      r.compliance
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `reporte_produccion_${dateFrom}_${dateTo}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null);

  const handleDeleteRecord = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setRecordToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!recordToDelete) return;
    try {
      // Check if it's a single record ID or a list of IDs (for group delete)
      if (recordToDelete.includes(',')) {
        const ids = recordToDelete.split(',');
        const promises = ids.map(id => deleteDoc(doc(db, 'production', id)));
        await Promise.all(promises);
      } else {
        await deleteDoc(doc(db, 'production', recordToDelete));
      }
      toast.success('Registro(s) eliminado(s) correctamente');
      setIsDeleteConfirmOpen(false);
      setRecordToDelete(null);
      if (isDetailOpen) setIsDetailOpen(false);
    } catch (error) {
      console.error("Error deleting record:", error);
      toast.error('Error al eliminar');
    }
  };

  const handleDeleteGroup = (e: React.MouseEvent, group: any) => {
    e.stopPropagation();
    const ids = group.hourlyRecords.map((r: any) => r.id).join(',');
    setRecordToDelete(ids);
    setIsDeleteConfirmOpen(true);
  };

  const handleUpdateReal = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const val = parseFloat(editValue);
    if (isNaN(val)) {
      toast.error('Valor no válido');
      return;
    }
    try {
      const record = records.find(r => r.id === id);
      if (!record) return;
      
      await updateDoc(doc(db, 'production', id), {
        real: val,
        compliance: (val / record.plan) * 100
      });
      setEditingId(null);
      toast.success('Registro actualizado');
    } catch (error) {
      console.error("Error updating record:", error);
      toast.error('Error al actualizar');
    }
  };

  const openDetail = (group: any) => {
    setSelectedGroup(group);
    setIsDetailOpen(true);
  };

  if (loading || settingsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Advanced Filters Bar */}
      <Card className="border-none shadow-md bg-white">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-end gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rango de Fechas</Label>
              <div className="flex items-center gap-2">
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40 h-10 rounded-xl" />
                <span className="text-slate-300">al</span>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40 h-10 rounded-xl" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Línea</Label>
              <Select value={selectedLines[0]} onValueChange={(v) => setSelectedLines([v])}>
                <SelectTrigger className="w-40 h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las Líneas</SelectItem>
                  {settings.lines.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Turno</Label>
              <Select value={selectedShift} onValueChange={setSelectedShift}>
                <SelectTrigger className="w-40 h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="1">Turno 1</SelectItem>
                  <SelectItem value="2">Turno 2</SelectItem>
                  <SelectItem value="3">Turno 3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Supervisor</Label>
              <Select value={selectedSupervisor} onValueChange={setSelectedSupervisor}>
                <SelectTrigger className="w-48 h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los Supervisores</SelectItem>
                  {supervisors.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" className="h-10 rounded-xl border-slate-200 text-slate-500" onClick={() => {
              setDateFrom(new Date().toISOString().split('T')[0]);
              setDateTo(new Date().toISOString().split('T')[0]);
              setSelectedLines(['all']);
              setSelectedShift('all');
              setSelectedSupervisor('all');
            }}>
              <Filter className="h-4 w-4 mr-2" />
              Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-md overflow-hidden bg-white">
          <div className="h-1 w-full bg-indigo-500" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500">Producción Real Total</p>
                <h3 className="text-3xl font-bold text-slate-900 mt-1">{kpis.real} <span className="text-sm font-normal text-slate-400">Ton</span></h3>
              </div>
              <div className="p-3 bg-indigo-50 rounded-2xl">
                <TrendingUp className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md overflow-hidden bg-white">
          <div className="h-1 w-full bg-slate-400" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500">Plan Total</p>
                <h3 className="text-3xl font-bold text-slate-900 mt-1">{kpis.plan} <span className="text-sm font-normal text-slate-400">Ton</span></h3>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl">
                <Target className="h-6 w-6 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md overflow-hidden bg-white">
          <div className={`h-1 w-full ${parseFloat(kpis.compliance) >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500">% Cumplimiento Global</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-3xl font-bold text-slate-900 mt-1">{kpis.compliance}%</h3>
                  <span className={`flex items-center text-xs font-bold ${parseFloat(kpis.compliance) >= 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {parseFloat(kpis.compliance) >= 100 ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                    {parseFloat(kpis.compliance) >= 100 ? 'Meta lograda' : 'Bajo meta'}
                  </span>
                </div>
              </div>
              <div className={`p-3 rounded-2xl ${parseFloat(kpis.compliance) >= 100 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <Activity className={`h-6 w-6 ${parseFloat(kpis.compliance) >= 100 ? 'text-emerald-600' : 'text-amber-600'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Trend Chart */}
      <Card className="border-none shadow-md bg-white p-6">
        <CardHeader className="px-0 pt-0 pb-6">
          <CardTitle className="text-xl font-bold text-slate-800">Tendencia de Producción</CardTitle>
          <CardDescription>
            {dateFrom === dateTo ? `Análisis por Horas - ${dateFrom}` : `Análisis por Días - ${dateFrom} al ${dateTo}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} domain={[0, 5]} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="real" name="Producción Real" radius={[4, 4, 0, 0]}>
                  {trendData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.real >= entry.plan ? '#10b981' : '#ef4444'} 
                    />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="plan" name="Plan" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-md bg-white p-6">
          <CardHeader className="px-0 pt-0 pb-6">
            <CardTitle className="text-lg font-bold text-slate-800">% Cumplimiento por Turno</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={shiftComparison}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} unit="%" />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                  <Bar dataKey="compliance" name="% Cumplimiento" radius={[6, 6, 0, 0]} barSize={40}>
                    {shiftComparison.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.compliance >= 100 ? '#10b981' : '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-white p-6">
          <CardHeader className="px-0 pt-0 pb-6">
            <CardTitle className="text-lg font-bold text-slate-800">% Cumplimiento por Línea</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lineComparison} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} unit="%" />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} width={80} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                  <Bar dataKey="compliance" name="% Cumplimiento" radius={[0, 6, 6, 0]} barSize={30}>
                    {lineComparison.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.compliance >= 100 ? '#10b981' : '#818cf8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historical Detail Table */}
      <Card className="border-none shadow-md bg-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 p-6">
          <div>
            <CardTitle className="text-xl font-bold text-slate-800">Detalle Histórico</CardTitle>
            <CardDescription>Registros individuales según filtros seleccionados</CardDescription>
          </div>
          <Button onClick={exportToCSV} variant="outline" className="rounded-xl border-slate-200 text-indigo-600 hover:bg-indigo-50">
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Turno</th>
                  <th className="px-6 py-4">Línea</th>
                  <th className="px-6 py-4">Supervisor</th>
                  <th className="px-6 py-4 text-right">Plan Total (Ton)</th>
                  <th className="px-6 py-4 text-right">Real Total (Ton)</th>
                  <th className="px-6 py-4 text-center">% Cumpl.</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} className="px-6 py-12 text-center text-slate-400">No se encontraron registros para los filtros seleccionados</td>
                  </tr>
                ) : (
                  groupedRecords.slice(0, 50).map((g, i) => (
                    <tr 
                      key={g.id || i} 
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                      onClick={() => openDetail(g)}
                    >
                      <td className="px-6 py-4 font-medium text-slate-700">{format(parseISO(g.date), 'dd/MM/yyyy')}</td>
                      <td className="px-6 py-4"><Badge variant="outline" className="bg-slate-50">T{g.shift}</Badge></td>
                      <td className="px-6 py-4 text-slate-600">{g.line}</td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{g.supervisor}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-400">{g.plan.toFixed(1)}</td>
                      <td className="px-6 py-4 text-right font-bold text-indigo-600">{g.real.toFixed(1)}</td>
                      <td className="px-6 py-4 text-center">
                        <Badge className={`${g.compliance >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} border-none`}>
                          {g.compliance.toFixed(0)}%
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-indigo-600" onClick={(e) => {
                            e.stopPropagation();
                            openDetail(g);
                          }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-indigo-600" onClick={(e) => {
                                e.stopPropagation();
                                openDetail(g);
                              }}>
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={(e) => handleDeleteGroup(e, g)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredRecords.length > 50 && (
            <div className="p-4 bg-slate-50 text-center text-xs text-slate-400">
              Mostrando los últimos 50 registros. Exporta a CSV para ver el detalle completo.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[700px] rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-slate-800">Detalle de Turno Completo</DialogTitle>
            <DialogDescription>Desglose horario de producción capturada</DialogDescription>
          </DialogHeader>
          
          {activeGroup && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</p>
                  <p className="text-sm font-medium text-slate-700">{format(parseISO(activeGroup.date), 'dd/MM/yyyy')}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Turno</p>
                  <Badge variant="outline" className="bg-slate-50">T{activeGroup.shift}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Línea</p>
                  <p className="text-sm font-medium text-slate-700">{activeGroup.line}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cumplimiento</p>
                  <Badge className={activeGroup.compliance >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                    {activeGroup.compliance.toFixed(1)}%
                  </Badge>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Supervisor</p>
                <p className="text-sm font-semibold text-slate-700 px-1">{activeGroup.supervisor}</p>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-4 py-3">Hora</th>
                      <th className="px-4 py-3">Estatus</th>
                      <th className="px-4 py-3 text-right">Plan (Ton)</th>
                      <th className="px-4 py-3 text-right">Real (Ton)</th>
                      {isAdmin && <th className="px-4 py-3 text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeGroup.hourlyRecords.map((r: ProductionRecord) => (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">{r.hour}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="text-[10px] font-medium">
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400">{r.plan.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-600">
                          {editingId === r.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <Input 
                                type="number" 
                                value={editValue} 
                                onChange={(e) => setEditValue(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className="w-16 h-7 text-right text-xs"
                                autoFocus
                              />
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600" onClick={(e) => handleUpdateReal(e, r.id!)}>
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400" onClick={() => setEditingId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            r.real.toFixed(2)
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-indigo-600" onClick={() => {
                                setEditingId(r.id!);
                                setEditValue(r.real.toString());
                              }}>
                                <Edit3 className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={(e) => handleDeleteRecord(e, r.id!)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" className="rounded-xl w-full sm:w-auto" onClick={() => setIsDetailOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800">Confirmar Eliminación</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end gap-2 mt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setIsDeleteConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive"
              className="rounded-xl bg-red-600 hover:bg-red-700"
              onClick={confirmDelete}
            >
              Eliminar Registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
