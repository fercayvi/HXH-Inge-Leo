import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Legend
} from 'recharts';
import { 
  Users, 
  Trophy, 
  Target, 
  TrendingUp,
  LineChart as LineChartIcon,
  User as UserIcon,
  BarChart3,
  Calendar as CalendarIcon,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ProductionRecord, Supervisor } from '../types';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  parseISO 
} from 'date-fns';

export default function Performance() {
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<'semana' | 'mes' | 'historico'>('semana');
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Escuchar cambios en supervisores
    const qSup = query(collection(db, 'supervisors'));
    const unsubSup = onSnapshot(qSup, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Supervisor[];
      setSupervisors(data.filter(s => s.active !== false));
    });

    // Escuchar cambios en registros de producción
    const qRec = query(collection(db, 'production'));
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

  // Límites de periodo como strings estrictos para evitar errores de zona horaria
  const periodConfig = useMemo(() => {
    const now = new Date();
    
    if (periodoSeleccionado === 'semana') {
      const start = startOfWeek(now, { weekStartsOn: 1 }); // Lunes
      const end = endOfWeek(now, { weekStartsOn: 1 }); // Domingo
      return {
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd')
      };
    } else if (periodoSeleccionado === 'mes') {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      return {
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd')
      };
    }
    
    return { start: '1900-01-01', end: '9999-12-31' };
  }, [periodoSeleccionado]);

  // Filtrado y agregación real por supervisor
  const performanceData = useMemo(() => {
    if (loading) return [];

    // 1. Filtrar los registros por fecha (string comparison)
    const filteredRecords = records.filter(r => {
      if (periodoSeleccionado === 'historico') return true;
      return r.date >= periodConfig.start && r.date <= periodConfig.end;
    });

    // 2. Agrupar por supervisor (contar capturas únicas por hora/linea/turno/fecha para evitar duplicados si los hubiera)
    // Pero el requerimiento pide simplemente "contar las capturasReales" registradas.
    // Vamos a considerar que cada documento en Firestore es una captura exitosa que suma al desempeño.
    
    return supervisors.map(sup => {
      const supRecords = filteredRecords.filter(r => r.supervisor === sup.name);
      
      // Contar combinaciones únicas de fecha + turno (Un turno completo = 1 captura)
      const uniqueCaptures = new Set(supRecords.map(r => `${r.date}|${r.shift}`));
      const capturasReales = uniqueCaptures.size;
      
      return {
        nombre: sup.name,
        linea: sup.line || 'N/A',
        metaSemanal: sup.weeklyGoal || 0,
        capturasReales: capturasReales,
        progress: sup.weeklyGoal > 0 ? (capturasReales / sup.weeklyGoal) * 100 : 0
      };
    }).sort((a, b) => b.capturasReales - a.capturasReales);
  }, [supervisors, records, periodConfig, periodoSeleccionado, loading]);

  const stats = useMemo(() => {
    const totalCapturas = performanceData.reduce((acc, s) => acc + s.capturasReales, 0);
    const totalMeta = performanceData.reduce((acc, s) => acc + s.metaSemanal, 0);
    const cumplimientoGlobal = totalMeta > 0 ? (totalCapturas / totalMeta) * 100 : 0;
    
    return {
      totalCapturas,
      totalMeta,
      cumplimientoGlobal,
      supervisoresActivos: supervisors.length
    };
  }, [performanceData, supervisors]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Cabecera con Selector de Periodo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Rendimiento de Supervisores</h2>
          <p className="text-slate-500">Métricas de cumplimiento y actividad de captura.</p>
        </div>
        
        <div className="flex items-center space-x-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
          <CalendarIcon className="h-5 w-5 text-slate-400 ml-2" />
          <Select 
            value={periodoSeleccionado} 
            onValueChange={(val: any) => setPeriodoSeleccionado(val)}
          >
            <SelectTrigger className="w-[180px] border-none shadow-none focus:ring-0 font-semibold text-slate-700">
              <SelectValue placeholder="Seleccionar Periodo" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-100 shadow-xl">
              <SelectItem value="semana">Semana Actual</SelectItem>
              <SelectItem value="mes">Mes Actual</SelectItem>
              <SelectItem value="historico">Histórico</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-none shadow-xl shadow-indigo-50/50 bg-white overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
          <CardHeader className="pb-2 space-y-0 text-left">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Users className="h-5 w-5" />
              </div>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-slate-500 mt-3 uppercase tracking-wider text-left">Supervisores</p>
            <CardTitle className="text-3xl font-bold text-slate-900 mt-1 text-left">{stats.supervisoresActivos}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-none shadow-xl shadow-indigo-50/50 bg-white overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
          <CardHeader className="pb-2 space-y-0 text-left">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Target className="h-5 w-5" />
              </div>
              <Trophy className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-slate-500 mt-3 uppercase tracking-wider text-left">Cumplimiento</p>
            <CardTitle className="text-3xl font-bold text-slate-900 mt-1 text-left">{stats.cumplimientoGlobal.toFixed(1)}%</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-none shadow-xl shadow-indigo-50/50 bg-white overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
          <CardHeader className="pb-2 space-y-0 text-left">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <BarChart3 className="h-5 w-5" />
              </div>
            </div>
            <p className="text-sm font-medium text-slate-500 mt-3 uppercase tracking-wider text-left">Capturas Reales</p>
            <CardTitle className="text-3xl font-bold text-slate-900 mt-1 text-left">{stats.totalCapturas}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-none shadow-xl shadow-indigo-50/50 bg-white overflow-hidden group hover:scale-[1.02] transition-transform duration-300">
          <CardHeader className="pb-2 space-y-0 text-left">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
                <LineChartIcon className="h-5 w-5" />
              </div>
            </div>
            <p className="text-sm font-medium text-slate-500 mt-3 uppercase tracking-wider text-left">Meta de Captura</p>
            <CardTitle className="text-3xl font-bold text-slate-900 mt-1 text-left">{stats.totalMeta}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Gráfica Comparativa */}
      <Card className="border-none shadow-2xl shadow-slate-200/50 bg-white overflow-hidden rounded-3xl">
        <CardHeader className="text-left">
          <CardTitle className="text-xl font-bold text-slate-900">Comparativa de Capturas</CardTitle>
          <CardDescription>
            {periodoSeleccionado === 'semana' && "Meta Semanal vs Capturas Realizadas en la semana actual"}
            {periodoSeleccionado === 'mes' && "Meta Semanal vs Capturas Realizadas en el mes"}
            {periodoSeleccionado === 'historico' && "Meta Semanal vs Histórico de Capturas"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={performanceData} 
                layout="vertical" 
                margin={{ left: 50, right: 40, top: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="nombre" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#64748b', fontSize: 12, fontWeight: 500}} 
                  width={150}
                />
                <RechartsTooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any, name: string) => [value, name]}
                />
                <Legend iconType="circle" />
                <Bar dataKey="metaSemanal" name="Meta Semanal" fill="#93c5fd" stroke="#60a5fa" strokeWidth={1} radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="capturasReales" name="Capturas Reales" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Detalle de Avance */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
        {performanceData.map((sup, idx) => (
          <Card key={idx} className="border-none shadow-lg shadow-slate-100 bg-white rounded-2xl overflow-hidden hover:shadow-indigo-100/50 transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 overflow-hidden">
                  <UserIcon className="h-6 w-6 text-slate-400" />
                </div>
                <div className="text-left">
                  <h4 className="font-bold text-slate-900">{sup.nombre}</h4>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-tight">{sup.linea}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Avance</span>
                  <span className="font-bold text-indigo-600">{sup.capturasReales} de {sup.metaSemanal}</span>
                </div>
                <div className="h-2.5 w-full bg-blue-100/50 border border-blue-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 shadow-sm transition-all duration-500" 
                    style={{ width: `${Math.min(sup.progress, 100)}%` }}
                  />
                </div>
                <p className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-1">
                  {sup.progress.toFixed(0)}% COMPLETADO
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
