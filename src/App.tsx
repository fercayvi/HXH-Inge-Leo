import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, signIn, logOut } from './lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Supervisor } from './types';
import ProductionForm from '@/src/components/ProductionForm';
import Dashboard from '@/src/components/Dashboard';
import Performance from '@/src/components/Performance';
import SupervisorEditor from '@/src/components/SupervisorEditor';
import Configuration from '@/src/components/Configuration';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { 
  LayoutDashboard, 
  ClipboardList, 
  LogOut, 
  LogIn, 
  Factory, 
  User as UserIcon,
  ShieldCheck,
  Settings,
  Users as UsersIcon,
  Sliders,
  TrendingUp
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const SUPER_ADMINS = ['fecarrillo@ayvi.com.mx'];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'supervisor'>('supervisor');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('supervisor');

  useEffect(() => {
    let unsubscribeSupervisors: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Tarea 1: El Seguro de Vida (Super Admin Hardcoded)
        if (SUPER_ADMINS.includes(currentUser.email || '')) {
          setRole('admin');
          setLoading(false);
          return;
        }

        // Tarea 2: Vincular con Firestore
        const q = query(collection(db, 'supervisors'), where('email', '==', currentUser.email));
        unsubscribeSupervisors = onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
            const supervisorData = snapshot.docs[0].data() as Supervisor;
            setRole(supervisorData.role || 'supervisor');
          } else {
            setRole('supervisor');
          }
          setLoading(false);
        }, (error) => {
          console.error("Error fetching role:", error);
          setRole('supervisor');
          setLoading(false);
        });
      } else {
        setRole('supervisor');
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSupervisors) unsubscribeSupervisors();
    };
  }, []);

  const isAdmin = role === 'admin';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-4">
          <Factory className="h-12 w-12 text-indigo-600 animate-pulse" />
          <p className="text-slate-500 font-medium animate-pulse">Iniciando sistema...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-3xl shadow-xl border border-slate-100">
          <div className="text-center">
            <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-indigo-50 mb-6">
              <Factory className="h-10 w-10 text-indigo-600" />
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900">Production Monitor</h2>
            <p className="mt-2 text-slate-500">Inicia sesión para acceder al sistema de monitoreo industrial</p>
          </div>
          <Button 
            onClick={signIn} 
            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-100 transition-all"
          >
            <LogIn className="mr-2 h-5 w-5" />
            Ingresar con Google
          </Button>
          <div className="pt-6 text-center">
            <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Sistema de Gestión de Planta v1.0</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Navigation Bar */}
      <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-bottom border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-y-0 space-x-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Factory className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-none">Production Monitor</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mt-1">Industrial Analytics</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-sm font-semibold text-slate-700">{user.displayName}</span>
              <div className="flex items-center">
                <Badge variant="outline" className="mr-2 text-[10px] h-4 bg-slate-50 text-slate-500 border-slate-200">
                  Rol: {role.toUpperCase()}
                </Badge>
                {isAdmin ? (
                  <Badge variant="secondary" className="text-[10px] h-4 bg-indigo-50 text-indigo-700 border-indigo-100">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    INGENIERO / ADMIN
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] h-4 bg-slate-50 text-slate-600 border-slate-100">
                    <UserIcon className="h-3 w-3 mr-1" />
                    SUPERVISOR
                  </Badge>
                )}
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={logOut} 
              className="rounded-full hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="flex items-center justify-between overflow-hidden">
            <TabsList className="bg-transparent h-auto p-0 flex space-x-2 overflow-x-auto scrollbar-hide pb-2 w-full justify-start">
              <TabsTrigger 
                value="supervisor" 
                className="rounded-full px-6 py-2.5 flex-shrink-0 transition-all duration-200 border border-slate-200 bg-white text-slate-600 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:border-slate-900 data-[state=active]:shadow-lg"
              >
                <ClipboardList className="h-4 w-4 mr-2" />
                Captura
              </TabsTrigger>
              <TabsTrigger 
                value="dashboard" 
                className="rounded-full px-6 py-2.5 flex-shrink-0 transition-all duration-200 border border-slate-200 bg-white text-slate-600 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:border-slate-900 data-[state=active]:shadow-lg"
              >
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Dashboard
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger 
                  value="performance" 
                  className="rounded-full px-6 py-2.5 flex-shrink-0 transition-all duration-200 border border-slate-200 bg-white text-slate-600 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:border-slate-900 data-[state=active]:shadow-lg"
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Rendimiento
                </TabsTrigger>
              )}
              {isAdmin && (
                <TabsTrigger 
                  value="supervisors" 
                  className="rounded-full px-6 py-2.5 flex-shrink-0 transition-all duration-200 border border-slate-200 bg-white text-slate-600 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:border-slate-900 data-[state=active]:shadow-lg"
                >
                  <UsersIcon className="h-4 w-4 mr-2" />
                  Supervisores
                </TabsTrigger>
              )}
              {isAdmin && (
                <TabsTrigger 
                  value="config" 
                  className="rounded-full px-6 py-2.5 flex-shrink-0 transition-all duration-200 border border-slate-200 bg-white text-slate-600 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:border-slate-900 data-[state=active]:shadow-lg"
                >
                  <Sliders className="h-4 w-4 mr-2" />
                  Configuración
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="supervisor" className="mt-0 focus-visible:outline-none">
            <ProductionForm />
          </TabsContent>

          <TabsContent value="dashboard" className="mt-0 focus-visible:outline-none">
            <Dashboard />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="performance" className="mt-0 focus-visible:outline-none">
              <Performance />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="supervisors" className="mt-0 focus-visible:outline-none">
              <SupervisorEditor />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="config" className="mt-0 focus-visible:outline-none">
              <Configuration />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <Toaster position="top-right" closeButton richColors />
    </div>
  );
}
