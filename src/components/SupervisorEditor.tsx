import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, onSnapshot, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/error-handler';
import { useSettings } from '../lib/settings';
import { Supervisor } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, UserPlus, Target, Edit2, X, Check, Factory } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function SupervisorEditor() {
  const { settings, loading: settingsLoading } = useSettings();
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'supervisor'>('supervisor');
  const [newGoal, setNewGoal] = useState('5');
  const [newLine, setNewLine] = useState('');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'supervisor'>('supervisor');
  const [editGoal, setEditGoal] = useState('5');
  const [editLine, setEditLine] = useState('');

  // Sync lines with settings when loaded
  useEffect(() => {
    if (settings && settings.lines.length > 0) {
      if (!newLine) setNewLine(settings.lines[0]);
      if (!editLine) setEditLine(settings.lines[0]);
    }
  }, [settings, newLine, editLine]);

  useEffect(() => {
    const q = query(collection(db, 'supervisors'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Supervisor[];
      setSupervisors(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAddSupervisor = async () => {
    if (!newName.trim() || !newEmail.trim()) {
      toast.error('Nombre y Correo son obligatorios');
      return;
    }
    setIsAdding(true);
    try {
      await addDoc(collection(db, 'supervisors'), {
        name: newName,
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        weeklyGoal: newRole === 'admin' ? 0 : (parseInt(newGoal) || 0),
        active: true,
        line: newRole === 'admin' ? '' : newLine
      });
      setNewName('');
      setNewEmail('');
      setNewRole('supervisor');
      setNewGoal('5');
      setNewLine(settings.lines[0]);
      toast.success('Supervisor agregado correctamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'supervisors');
    } finally {
      setIsAdding(false);
    }
  };

  const toggleActive = async (supervisor: Supervisor) => {
    try {
      await updateDoc(doc(db, 'supervisors', supervisor.id!), {
        active: !supervisor.active
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `supervisors/${supervisor.id}`);
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    if (!editName.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    try {
      await updateDoc(doc(db, 'supervisors', editingId), {
        name: editName,
        email: editEmail.trim().toLowerCase(),
        role: editRole,
        weeklyGoal: editRole === 'admin' ? 0 : (parseInt(editGoal) || 0),
        line: editRole === 'admin' ? '' : editLine
      });
      setEditingId(null);
      toast.success('Supervisor actualizado');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `supervisors/${editingId}`);
    }
  };

  const startEdit = (s: Supervisor) => {
    setEditingId(s.id!);
    setEditName(s.name);
    setEditEmail(s.email || '');
    setEditRole(s.role || 'supervisor');
    setEditGoal(s.weeklyGoal.toString());
    setEditLine(s.line || settings.lines[0]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este supervisor?')) return;
    try {
      await deleteDoc(doc(db, 'supervisors', id));
      toast.success('Supervisor eliminado');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `supervisors/${id}`);
    }
  };

  if (loading || settingsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <Card className="border-none shadow-md overflow-hidden">
        <div className="h-1 w-full bg-indigo-600" />
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center">
            <UserPlus className="mr-2 h-5 w-5 text-indigo-600" />
            Gestión de Supervisores
          </CardTitle>
          <CardDescription>Agrega supervisores y define sus metas semanales de captura</CardDescription>
        </CardHeader>
        <CardContent>
          {editingId ? (
            <div className="flex flex-wrap items-end gap-4 bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-8">
              <div className="flex-1 min-w-[200px] space-y-2">
                <Label htmlFor="edit-name">Editar Nombre</Label>
                <Input 
                  id="edit-name" 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="flex-1 min-w-[200px] space-y-2">
                <Label htmlFor="edit-email">Correo (Google)</Label>
                <Input 
                  id="edit-email" 
                  type="email"
                  value={editEmail} 
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="w-[140px] space-y-2">
                <Label htmlFor="edit-role">Rol</Label>
                <Select value={editRole} onValueChange={(val: any) => setEditRole(val)}>
                  <SelectTrigger id="edit-role" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editRole === 'supervisor' && (
                <>
                  <div className="w-[180px] space-y-2">
                    <Label htmlFor="edit-line">Línea Asignada</Label>
                    <Select value={editLine} onValueChange={setEditLine}>
                      <SelectTrigger id="edit-line" className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {settings.lines.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[100px] space-y-2">
                    <Label htmlFor="edit-goal">Meta Semanal</Label>
                    <Input 
                      id="edit-goal" 
                      type="number" 
                      value={editGoal} 
                      onChange={(e) => setEditGoal(e.target.value)}
                      className="bg-white"
                    />
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <Button onClick={handleUpdate} className="bg-green-600 hover:bg-green-700 text-white">
                  <Check className="h-4 w-4 mr-1" /> Guardar
                </Button>
                <Button variant="ghost" onClick={() => setEditingId(null)} className="text-slate-500">
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 mb-8">
              <div className="flex-1 min-w-[200px] space-y-2">
                <Label htmlFor="name">Nombre Completo</Label>
                <Input 
                  id="name" 
                  placeholder="Ej. Juan Pérez" 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="flex-1 min-w-[200px] space-y-2">
                <Label htmlFor="email">Correo (Google)</Label>
                <Input 
                  id="email" 
                  type="email"
                  placeholder="ejemplo@google.com" 
                  value={newEmail} 
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="w-[140px] space-y-2">
                <Label htmlFor="role">Rol</Label>
                <Select value={newRole} onValueChange={(val: any) => setNewRole(val)}>
                  <SelectTrigger id="role" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newRole === 'supervisor' && (
                <>
                  <div className="w-[160px] space-y-2">
                    <Label htmlFor="line">Línea Asignada</Label>
                    <Select value={newLine} onValueChange={setNewLine}>
                      <SelectTrigger id="line" className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {settings.lines.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[100px] space-y-2">
                    <Label htmlFor="goal">Meta Semanal</Label>
                    <div className="relative">
                      <Target className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input 
                        id="goal" 
                        type="number" 
                        value={newGoal} 
                        onChange={(e) => setNewGoal(e.target.value)}
                        className="pl-9 bg-white"
                      />
                    </div>
                  </div>
                </>
              )}
              <Button 
                onClick={handleAddSupervisor} 
                disabled={isAdding}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Agregar
              </Button>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Supervisor / Correo</TableHead>
                  <TableHead>Línea</TableHead>
                  <TableHead className="text-center">Meta Semanal</TableHead>
                  <TableHead className="text-center">Rol</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supervisors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-400">
                      No hay supervisores registrados
                    </TableCell>
                  </TableRow>
                ) : (
                  supervisors.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-700">{s.name}</span>
                          <span className="text-[10px] text-slate-400">{s.email || 'Sin correo registrado'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center text-slate-500">
                          <Factory className="h-3 w-3 mr-1" />
                          {s.role === 'supervisor' ? (s.line || 'Sin asignar') : 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {s.role === 'supervisor' ? (
                          <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-100">
                            {s.weeklyGoal} capturas
                          </Badge>
                        ) : (
                          <span className="text-slate-300 italic text-xs">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`text-[10px] h-5 ${s.role === 'admin' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                          {s.role === 'admin' ? 'ADMIN' : 'SUPERVISOR'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => toggleActive(s)}
                          className={`rounded-full h-7 px-3 text-[10px] font-bold uppercase tracking-wider ${
                            s.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {s.active ? 'Activo' : 'Inactivo'}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => startEdit(s)}
                            className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDelete(s.id!)}
                            className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
