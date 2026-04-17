import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { ProductionRecord, Supervisor } from '../types';
import { useSettings } from '../lib/settings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Download, 
  Database, 
  Eye, 
  Edit3, 
  Trash2, 
  Filter,
  RefreshCw,
  Users,
  Factory,
  Clock,
  Calendar,
  XCircle,
  Search,
  ChevronDown,
  MoreHorizontal
} from 'lucide-react';
import { 
  format, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  isWithinInterval, 
  subDays,
  startOfDay,
  endOfDay
} from 'date-fns';
import { toast } from 'sonner';

export default function DatabaseAudit() {
  const { settings } = useSettings();
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  
  // States for Advanced Filters
  const [periodo, setPeriodo] = useState<string>('todo');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedLine, setSelectedLine] = useState<string>('all');
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('all');
  const [selectedShift, setSelectedShift] = useState<string>('all');
  
  const isAdmin = auth.currentUser?.email === 'fecarrillo@ayvi.com.mx';

  useEffect(() => {
    // Escuchar cambios en registros de producción
    const q = query(collection(db, 'production'), orderBy('date', 'desc'), orderBy('hour', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProductionRecord[];
      setRecords(data);
      setLoading(false);
    }, (error) => {
      console.error("Error loading data:", error);
      setLoading(false);
    });

    // Escuchar cambios en supervisores para el filtro
    const qSup = query(collection(db, 'supervisors'));
    const unsubSup = onSnapshot(qSup, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Supervisor[];
      setSupervisors(data);
    });

    return () => {
      unsubscribe();
      unsubSup();
    };
  }, []);

  const clearFilters = () => {
    setPeriodo('todo');
    setDateFrom('');
    setDateTo('');
    setSelectedLine('all');
    setSelectedSupervisor('all');
    setSelectedShift('all');
    toast.message('Filtros reiniciados');
  };

  const filteredRecords = useMemo(() => {
    const now = new Date();
    return records.filter(r => {
      const rDate = parseISO(r.date);
      
      // 1. Time Filters (Intersections)
      let timeMatch = true;
      if (periodo === 'semana') {
        const start = startOfDay(subDays(now, 7));
        timeMatch = isWithinInterval(rDate, { start, end: endOfDay(now) });
      } else if (periodo === 'mes_actual') {
        const start = startOfMonth(now);
        const end = endOfMonth(now);
        timeMatch = isWithinInterval(rDate, { start, end });
      } else if (periodo === 'rango' && dateFrom && dateTo) {
        const start = startOfDay(parseISO(dateFrom));
        const end = endOfDay(parseISO(dateTo));
        timeMatch = isWithinInterval(rDate, { start, end });
      }
      
      // 2. Specificity Filters (Intersection logic)
      const lineMatch = selectedLine === 'all' || r.line === selectedLine;
      const supervisorMatch = selectedSupervisor === 'all' || r.supervisor === selectedSupervisor;
      const shiftMatch = selectedShift === 'all' || r.shift.toString() === selectedShift;

      return timeMatch && lineMatch && supervisorMatch && shiftMatch;
    });
  }, [records, periodo, dateFrom, dateTo, selectedLine, selectedSupervisor, selectedShift]);

  const groupedRecords = useMemo(() => {
    const groups: Record<string, any> = {};

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
          recordIds: []
        };
      }
      groups[key].plan += r.plan;
      groups[key].real += r.real;
      groups[key].recordIds.push(r.id);
    });

    return Object.values(groups).map(g => ({
      ...g,
      compliance: g.plan > 0 ? (g.real / g.plan) * 100 : 0
    })).sort((a, b) => b.date.localeCompare(a.date) || b.shift - a.shift);
  }, [filteredRecords]);

  const exportToCSV = () => {
    const headers = ['Fecha', 'Turno', 'Línea', 'Supervisor', 'Plan Total', 'Real Total', '% Cumplimiento'];
    const rows = groupedRecords.map(g => [
      g.date,
      `Turno ${g.shift}`,
      g.line,
      g.supervisor,
      g.plan.toFixed(2),
      g.real.toFixed(2),
      `${g.compliance.toFixed(1)}%`
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `auditoria_ayvi_${periodo}_${format(new Date(), 'yyyyMMdd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Auditoría exportada con éxito');
  };

  const getComplianceColor = (compliance: number) => {
    if (compliance >= 95) return 'bg-emerald-500';
    if (compliance >= 80) return 'bg-amber-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="h-6 w-6 text-indigo-600" />
            Auditoría de Base de Datos
          </h2>
          <p className="text-slate-500">Historial completo con filtros de búsqueda avanzada.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={clearFilters}
            className="rounded-xl border-slate-200 text-slate-500 hover:bg-slate-50 h-11 px-4"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Limpiar Filtros
          </Button>
          <Button 
            onClick={exportToCSV} 
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg h-11 px-6 transition-all"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Advanced Filter Bar */}
      <Card className="border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden rounded-3xl">
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 items-end">
            
            {/* Quick Time Pills */}
            <div className="space-y-3 col-span-1 md:col-span-2 xl:col-span-1">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Periodos Rápidos</Label>
              <div className="flex items-center space-x-1.5 bg-slate-50 p-1 rounded-xl border border-slate-100">
                <Button 
                  variant={periodo === 'todo' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  onClick={() => setPeriodo('todo')}
                  className={`flex-1 rounded-lg h-7 text-[9px] font-black uppercase tracking-tighter ${periodo === 'todo' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}
                >
                  TODO
                </Button>
                <Button 
                  variant={periodo === 'semana' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  onClick={() => setPeriodo('semana')}
                  className={`flex-1 rounded-lg h-7 text-[9px] font-black uppercase tracking-tighter ${periodo === 'semana' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}
                >
                  SEMANA
                </Button>
                <Button 
                  variant={periodo === 'mes_actual' ? 'secondary' : 'ghost'} 
                  size="sm" 
                  onClick={() => setPeriodo('mes_actual')}
                  className={`flex-1 rounded-lg h-7 text-[9px] font-black uppercase tracking-tighter ${periodo === 'mes_actual' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}
                >
                  MES
                </Button>
              </div>
            </div>

            {/* Manual Date Range */}
            <div className="space-y-3 col-span-1 md:col-span-2 xl:col-span-2">
              <div className="flex items-center justify-between mb-0.5">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  Rango Manual
                </Label>
                {periodo === 'rango' && (
                  <span className="text-[9px] font-bold text-indigo-600 animate-pulse bg-indigo-50 px-2 py-0.5 rounded-full uppercase">Activo</span>
                )}
              </div>
              <div className="flex items-center gap-2" onClick={() => setPeriodo('rango')}>
                <div className="relative flex-1 group">
                  <Input 
                    type="date" 
                    value={dateFrom} 
                    onChange={(e) => setDateFrom(e.target.value)} 
                    className="h-10 pl-3 rounded-xl bg-slate-50/50 border-slate-100 focus:bg-white transition-all text-xs font-semibold" 
                  />
                  <div className="absolute right-0 top-0 h-full flex items-center pr-3 pointer-events-none opacity-20 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Desde</span>
                  </div>
                </div>
                <div className="relative flex-1 group">
                  <Input 
                    type="date" 
                    value={dateTo} 
                    onChange={(e) => setDateTo(e.target.value)} 
                    className="h-10 pl-3 rounded-xl bg-slate-50/50 border-slate-100 focus:bg-white transition-all text-xs font-semibold" 
                  />
                  <div className="absolute right-0 top-0 h-full flex items-center pr-3 pointer-events-none opacity-20 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Hasta</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Specificity Filters */}
            <div className="space-y-3">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Factory className="h-3 w-3" />
                Línea
              </Label>
              <Select value={selectedLine} onValueChange={setSelectedLine}>
                <SelectTrigger className="h-10 rounded-xl bg-slate-50/50 border-slate-100 text-xs font-bold text-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Todas las Líneas</SelectItem>
                  {settings.lines.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Users className="h-3 w-3" />
                Supervisor
              </Label>
              <Select value={selectedSupervisor} onValueChange={setSelectedSupervisor}>
                <SelectTrigger className="h-10 rounded-xl bg-slate-50/50 border-slate-100 text-xs font-bold text-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Todos</SelectItem>
                  {supervisors.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Clock className="h-3 w-3" />
                Turno
              </Label>
              <Select value={selectedShift} onValueChange={setSelectedShift}>
                <SelectTrigger className="h-10 rounded-xl bg-slate-50/50 border-slate-100 text-xs font-bold text-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="1">Turno 1</SelectItem>
                  <SelectItem value="2">Turno 2</SelectItem>
                  <SelectItem value="3">Turno 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm" />
                Meta Lograda ({'>'}95%)
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-amber-500 shadow-sm" />
                Alerta (80-94%)
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-red-500 shadow-sm" />
                Debajo de Meta ({'<'}80%)
              </div>
            </div>
            <div className="text-xs font-bold text-slate-400">
              <span className="text-indigo-600 font-extrabold">{groupedRecords.length}</span> resultados filtrados
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table Content */}
      <Card className="border-none shadow-xl shadow-slate-100/50 bg-white overflow-hidden rounded-3xl">
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-hide">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableHead className="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-widest">Fecha</TableHead>
                  <TableHead className="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-widest">Turno</TableHead>
                  <TableHead className="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-widest">Línea</TableHead>
                  <TableHead className="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-widest">Supervisor</TableHead>
                  <TableHead className="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-widest text-right">Plan (Ton)</TableHead>
                  <TableHead className="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-widest text-right">Real (Ton)</TableHead>
                  <TableHead className="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-widest text-center">% Cumpl.</TableHead>
                  <TableHead className="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-widest text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-72 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center p-12">
                        <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                          <Search className="h-10 w-10 text-slate-200" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-1">Sin Resultados</h3>
                        <p className="max-w-[200px] text-xs leading-relaxed">No encontramos registros que coincidan con la combinación de filtros seleccionada.</p>
                        <Button variant="link" onClick={clearFilters} className="text-indigo-600 font-bold mt-4">
                          Ver todo el historial
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedRecords.map((g) => (
                    <TableRow key={g.id} className="border-slate-50 hover:bg-indigo-50/20 transition-colors group">
                      <TableCell className="px-6 py-4 font-bold text-slate-700 whitespace-nowrap">
                        {format(parseISO(g.date), 'dd/MM/yy')}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-slate-200 text-slate-500 font-bold text-[10px] uppercase tracking-tighter bg-white shadow-sm">
                          T{g.shift}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-slate-600 font-medium whitespace-nowrap">{g.line}</TableCell>
                      <TableCell className="px-6 py-4 text-slate-600 font-bold whitespace-nowrap">{g.supervisor}</TableCell>
                      <TableCell className="px-6 py-4 text-right font-bold text-slate-400 font-mono tracking-tighter">{g.plan.toFixed(2)}</TableCell>
                      <TableCell className="px-6 py-4 text-right font-bold text-indigo-600 font-mono tracking-tighter">{g.real.toFixed(2)}</TableCell>
                      <TableCell className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <div className={`h-2.5 w-2.5 rounded-full ${getComplianceColor(g.compliance)} shadow-lg shadow-black/5 ring-2 ring-white`} />
                          <span className="font-bold text-slate-900 min-w-[45px] font-mono tracking-tight">{g.compliance.toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <div className="flex justify-end items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl">
                            <Eye className="h-4.5 w-4.5" />
                          </Button>
                          {isAdmin && (
                            <>
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl">
                                <Edit3 className="h-4.5 w-4.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl">
                                <Trash2 className="h-4.5 w-4.5" />
                              </Button>
                            </>
                          )}
                        </div>
                        <div className="group-hover:hidden text-slate-300 opacity-20">
                          <MoreHorizontal className="h-5 w-5 ml-auto mr-2" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
