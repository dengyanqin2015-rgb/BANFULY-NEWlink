import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Settings, ArrowLeft, MoreVertical, Search, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Handle,
  Position,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes: Node[] = [
  { id: 'root', position: { x: 250, y: 150 }, data: { label: '中心主题', direction: 'root' }, type: 'mindmap' },
];
const initialEdges: Edge[] = [];

const layoutMindMap = (nodes: any[], globalsDirection: string = 'right') => {
  const nodeMap = new Map<string, any>();
  // deep clone
  nodes.forEach(n => nodeMap.set(n.id, { ...n, position: { ...n.position } }));
  
  const childrenMap = new Map<string, string[]>();
  Array.from(nodeMap.values()).forEach(n => {
    if (n.data.parentId && !n.hidden) {
      if (!childrenMap.has(n.data.parentId)) {
        childrenMap.set(n.data.parentId, []);
      }
      childrenMap.get(n.data.parentId)!.push(n.id);
    }
  });

  const getSubtreeHeight = (id: string): number => {
    const children = childrenMap.get(id) || [];
    if (children.length === 0) return 60;
    const h = children.reduce((sum: number, cid: string) => sum + getSubtreeHeight(cid), 0);
    return Math.max(60, h + (children.length - 1) * 20);
  };

  const assignPositions = (id: string, x: number, y: number, direction: string) => {
    const node = nodeMap.get(id);
    if (!node) return;
    if (id !== 'root') {
      node.position = { x, y: y - 20 };
    } else {
      node.position = { x: node.position.x, y: node.position.y }; 
    }

    const children = childrenMap.get(id) || [];
    if (children.length === 0) return;

    let startY = y - getSubtreeHeight(id) / 2;
    children.forEach((cid: string) => {
      const cHeight = getSubtreeHeight(cid);
      const childY = startY + cHeight / 2;
      const childDir = id === 'root' ? (nodeMap.get(cid).data.direction || globalsDirection) : direction;
      const gapX = 240; 
      const nextX = childDir === 'left' ? x - gapX : x + gapX;
      assignPositions(cid, nextX, childY, childDir);
      startY += cHeight + 20;
    });
  };

  const rootNode = nodeMap.get('root');
  if (rootNode) {
    assignPositions('root', rootNode.position.x, rootNode.position.y + 20, globalsDirection);
  }

  return Array.from(nodeMap.values());
};

const COLORS = ['#ffffff', '#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8'];

const MindMapNode = ({ id, data, isConnectable, selected }: any) => {
  const { setNodes, setEdges, getNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(data.isEditing || false);
  const [localLabel, setLocalLabel] = useState(data.label || '新节点');
  const [showPalette, setShowPalette] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const isRoot = id === 'root';
  const direction = data.direction || 'right';
  const isCollapsed = data.collapsed || false;

  React.useEffect(() => {
    setLocalLabel(data.label || '新节点');
  }, [data.label]);

  React.useEffect(() => {
    if (data.isEditing) {
      setIsEditing(true);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 0);
      setNodes((nds: any) => nds.map((n: any) => n.id === id ? { ...n, data: { ...n.data, isEditing: false } } : n));
    }
  }, [data.isEditing]);

  const onLabelSave = () => {
    setIsEditing(false);
    setNodes((nds: any) => nds.map((n: any) => {
      if (n.id === id) {
        return { ...n, data: { ...n.data, label: localLabel } };
      }
      return n;
    }));
  };

  const onChangeColor = (color: string) => {
    setNodes((nds: any) => nds.map((n: any) => n.id === id ? { ...n, data: { ...n.data, color } } : n));
    setShowPalette(false);
  };

  const toggleCollapse = () => {
    const currentNodes: any[] = getNodes();
    const newCollapsed = !isCollapsed;
    const descendants = new Set<string>();
    let currentChildren = currentNodes.filter(n => n.data.parentId === id).map(n => n.id);
    
    while(currentChildren.length > 0) {
      const nextChildren: string[] = [];
      currentChildren.forEach(childId => {
        descendants.add(childId);
        currentNodes.filter(n => n.data.parentId === childId).forEach(n => nextChildren.push(n.id));
      });
      currentChildren = nextChildren;
    }

    setNodes((nds: any) => {
      const mapped = nds.map((n: any) => {
        if (n.id === id) return { ...n, data: { ...n.data, collapsed: newCollapsed } };
        if (descendants.has(n.id)) return { ...n, hidden: newCollapsed };
        return n;
      });
      // Try to re-layout with assuming current generic spawn config is 'right' (root children overrides it anyway)
      return layoutMindMap(mapped, 'right');
    });
    
    setEdges((eds: any) => eds.map((e: any) => {
      if (descendants.has(e.target)) return { ...e, hidden: newCollapsed };
      return e;
    }));
  };

  const hasChildren = getNodes().some(n => n.data.parentId === id);

  return (
    <div 
      className={`px-4 py-2 shadow-sm rounded-xl border-2 min-w-[100px] text-center group relative hover:shadow-md transition-all cursor-pointer ${selected ? 'border-[#FF6B00] ring-4 ring-[#FF6B00]/20' : 'border-[#1D1D1F]'}`}
      style={{ backgroundColor: data.color || '#ffffff' }}
      onDoubleClick={() => setIsEditing(true)}
    >
       {isEditing ? (
         <input 
           ref={inputRef}
           value={localLabel} 
           autoFocus
           onChange={(e) => setLocalLabel(e.target.value)}
           onBlur={onLabelSave}
           onKeyDown={(e) => { 
             if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
             if (e.key === 'Tab') { e.currentTarget.blur(); }
           }}
           className="w-full bg-transparent outline-none text-center font-bold text-[#1D1D1F] text-sm"
           style={{ width: `${Math.max(localLabel.length, 4) * 1.6}ch` }}
         />
       ) : (
         <div className="w-full text-center font-bold text-[#1D1D1F] text-sm select-none min-h-[20px]" style={{ width: `${Math.max(localLabel.length, 4) * 1.6}ch` }}>
            {localLabel}
         </div>
       )}
       
       {!isEditing && (
         <div className="absolute top-[-30px] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex justify-center w-full">
            <div className="relative" onMouseLeave={() => setShowPalette(false)}>
              <button 
                onMouseEnter={() => setShowPalette(true)}
                className="w-6 h-6 rounded-full bg-white border border-black/10 shadow-sm hover:bg-black/5 flex items-center justify-center flex-shrink-0"
                title="设置背景色"
              >
                <div className="w-3 h-3 rounded-full border border-black/20" style={{ backgroundColor: data.color || '#ffffff' }} />
              </button>
              {showPalette && (
                <div className="absolute top-5 left-1/2 -translate-x-1/2 mt-1 bg-white p-2 rounded-xl shadow-xl flex gap-1 border border-black/10 z-30">
                  {COLORS.map(c => (
                    <button key={c} onClick={(e) => { e.stopPropagation(); onChangeColor(c); setShowPalette(false); }} className={`w-5 h-5 rounded-full border-2 ${data.color === c ? 'border-[#FF6B00]' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}
            </div>
         </div>
       )}

       {/* Collapse Button ON Node Edge */}
       {hasChildren && (
          <button 
            onClick={(e) => { e.stopPropagation(); toggleCollapse(); }} 
            className={`absolute ${direction === 'left' ? '-left-3' : '-right-3'} top-1/2 -translate-y-[10px] w-5 h-5 rounded-full bg-white border-2 border-[#1D1D1F] flex items-center justify-center text-[#1D1D1F] z-10 hover:bg-gray-100 hover:scale-110 transition-transform`}
            title={isCollapsed ? "展开" : "折叠"}
          >
            <div className="text-[12px] leading-none font-bold pb-[1px]">{isCollapsed ? '+' : '-'}</div>
          </button>
       )}

       {/* Handles transparent since we compute everything automatically */}
       <Handle id="left" type="target" position={Position.Left} isConnectable={isConnectable} className="!w-1 !h-1 !bg-transparent !border-none !opacity-0" />
       <Handle id="right" type="target" position={Position.Right} isConnectable={isConnectable} className="!w-1 !h-1 !bg-transparent !border-none !opacity-0" />
       
       <Handle id="left" type="source" position={Position.Left} isConnectable={isConnectable} className="!w-1 !h-1 !bg-transparent !border-none !opacity-0" />
       <Handle id="right" type="source" position={Position.Right} isConnectable={isConnectable} className="!w-1 !h-1 !bg-transparent !border-none !opacity-0" />
    </div>
  );
};

const nodeTypes = { mindmap: MindMapNode };

export const Brainstorming: React.FC = () => {
  const { id } = useParams();
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [maps, setMaps] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Editor states
  const [currentMap, setCurrentMap] = useState<any>(null);
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);
  const [title, setTitle] = useState('');
  const [edgeStyle, setEdgeStyle] = useState<'step' | 'bezier'>('step');
  const [spawnDirection, setSpawnDirection] = useState<'right' | 'left'>('right');
  
  // Permissions state
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [selectedMapForPerms, setSelectedMapForPerms] = useState<any>(null);

  // Delete confirmation state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Rename & Folder state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameMap, setRenameMap] = useState<any>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameFolder, setRenameFolder] = useState('');

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, 'mindmaps', deleteId));
      toast.success('已删除');
      if (id === deleteId) {
        navigate('/brainstorming');
      }
      setDeleteId(null);
    } catch(e) {
      toast.error('删除失败');
    }
  };
  
  const [activeFolder, setActiveFolder] = useState<string>('all');

  const folders = useMemo(() => {
    const fv = new Set<string>();
    maps.forEach(m => {
      if (m.folder) fv.add(m.folder);
    });
    return Array.from(fv);
  }, [maps]);

  const filteredMaps = useMemo(() => {
    if (activeFolder === 'all') return maps;
    if (activeFolder === 'ungrouped') return maps.filter(m => !m.folder);
    return maps.filter(m => m.folder === activeFolder);
  }, [maps, activeFolder]);

  const getUserDisplayName = useCallback((emailOrName: string) => {
    if (!emailOrName) return '未知';
    const user = users.find(u => u.email === emailOrName || u.displayName === emailOrName || u.username === emailOrName || u.id === emailOrName);
    return user?.displayName || user?.username || emailOrName.split('@')[0];
  }, [users]);

  useEffect(() => {
    const unsubMaps = onSnapshot(collection(db, 'mindmaps'), (snapshot) => {
      const allMaps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setMaps(allMaps.filter(m => {
        if (isAdmin) return true;
        if (m.ownerId === profile?.uid) return true;
        if (m.permissions && m.permissions[profile?.uid || '']) return true;
        return false;
      }));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubMaps();
      unsubUsers();
    };
  }, [profile?.uid, isAdmin]);

  useEffect(() => {
    if (id) {
      if (id === 'new') {
        setTitle('新建头脑风暴');
        setNodes(initialNodes);
        setEdges(initialEdges);
        setCurrentMap(null);
      } else {
        const found = maps.find(m => m.id === id);
        if (found) {
          setCurrentMap(found);
          setTitle(found.title);
          if (found.data) {
            try {
              const parsed = JSON.parse(found.data);
              const loadedNodes = parsed.nodes || initialNodes;
              setNodes(loadedNodes.map((n: any) => ({ ...n, type: 'mindmap' })));
              setEdges(parsed.edges || initialEdges);
            } catch(e) {}
          }
        }
      }
    }
  }, [id, maps]);

  const handleCreate = async () => {
    try {
      const docRef = await addDoc(collection(db, 'mindmaps'), {
        title: '新建头脑风暴',
        ownerId: profile?.uid,
        ownerName: profile?.displayName || profile?.email,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: JSON.stringify({ nodes: initialNodes, edges: initialEdges }),
        permissions: {}
      });
      navigate(`/brainstorming/${docRef.id}`);
    } catch (e) {
      toast.error('创建失败');
    }
  };

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect = useCallback((params: Connection | Edge) => {
    setEdges((eds) => addEdge(params, eds));
  }, []);

  const handleSave = async () => {
    if (id === 'new') return;
    try {
      const dataStr = JSON.stringify({ nodes, edges, mapConfig: { edgeStyle, spawnDirection } });
      await updateDoc(doc(db, 'mindmaps', id!), {
        title,
        data: dataStr,
        updatedAt: new Date().toISOString()
      });
      toast.success('保存成功');
    } catch(e) {
      toast.error('保存失败');
    }
  };

  const canEdit = !currentMap || currentMap.ownerId === profile?.uid || isAdmin || 
                  (currentMap.permissions && ['editor', 'manager'].includes(currentMap.permissions[profile?.uid || '']));

  const canManage = !currentMap || currentMap.ownerId === profile?.uid || isAdmin || 
                  (currentMap.permissions && currentMap.permissions[profile?.uid || ''] === 'manager');

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!canEdit) return;
    
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
      return;
    }
    
    if (e.key === 'Tab') {
      e.preventDefault();
      
      const selectedNodes = nodes.filter(n => n.selected);
      if (selectedNodes.length === 0) return;
        
      const parentId = selectedNodes[0].id;
      const parentNode = nodes.find(n => n.id === parentId);
      if (!parentNode) return;
        
      let nextNds = nodes.map(n => n.id === parentId ? { ...n, data: { ...n.data, collapsed: false } } : { ...n, selected: false });
        
      const direction = parentId === 'root' ? spawnDirection : (parentNode.data.direction || spawnDirection);
        
      const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
      const newNode: any = {
        id: newNodeId,
        type: 'mindmap',
        position: { x: 0, y: 0 }, // position computed by layout
        data: { label: '新节点', parentId, direction, isEditing: true },
        hidden: false,
        selected: true
      };
        
      nextNds.push(newNode);

      const newEdge = {
        id: `edge_${parentId}_${newNodeId}`,
        source: parentId,
        target: newNodeId,
        sourceHandle: direction,
        targetHandle: direction === 'left' ? 'right' : 'left',
        type: 'smoothstep',
        style: { stroke: '#FF6B00', strokeWidth: 2 }
      };

      setNodes(layoutMindMap(nextNds, spawnDirection));
      setEdges([...edges, newEdge]);
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      
      const selectedNodes = nodes.filter(n => n.selected);
      if (selectedNodes.length === 0) return;
        
      const selectedNode = selectedNodes[0];
      if (selectedNode.id === 'root') return; // root has no sibling
        
      const parentId = selectedNode.data.parentId;
      const direction = selectedNode.data.direction;
        
      let nextNds = nodes.map(n => ({ ...n, selected: false }));
        
      const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
      const newNode: any = {
        id: newNodeId,
        type: 'mindmap',
        position: { x: 0, y: 0 },
        data: { label: '新分支', parentId, direction, isEditing: true },
        hidden: false,
        selected: true
      };
        
      nextNds.push(newNode);

      const newEdge = {
        id: `edge_${parentId}_${newNodeId}`,
        source: parentId,
        target: newNodeId,
        sourceHandle: direction,
        targetHandle: direction === 'left' ? 'right' : 'left',
        type: 'smoothstep',
        style: { stroke: '#FF6B00', strokeWidth: 2 }
      };

      setNodes(layoutMindMap(nextNds, spawnDirection));
      setEdges([...edges, newEdge]);
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const selectedNodeIds = new Set(nodes.filter(n => n.selected && n.id !== 'root').map(n => n.id));
      if (selectedNodeIds.size > 0) {
        let currentSize = 0;
        while (selectedNodeIds.size > currentSize) {
          currentSize = selectedNodeIds.size;
          nodes.forEach(n => {
            if (n.data.parentId && selectedNodeIds.has(n.data.parentId as string)) {
               selectedNodeIds.add(n.id);
            }
          });
        }
        
        const nextNds = nodes.filter((n:any) => !selectedNodeIds.has(n.id));
        setNodes(layoutMindMap(nextNds, spawnDirection));
        setEdges((eds) => eds.filter((e:any) => !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target)));
      }
    }
  }, [nodes, edges, canEdit, spawnDirection, edgeStyle, setNodes, setEdges]);

  if (id) {
    return (
      <div className="h-[calc(100vh-100px)] flex flex-col bg-white rounded-3xl shadow-sm border border-black/5 overflow-hidden">
        <div className="h-16 border-b border-black/5 px-6 flex items-center justify-between shrink-0 bg-[#F5F5F7]/30">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/brainstorming')}>
              <ArrowLeft size={18} />
            </Button>
            <input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              className="text-lg font-bold bg-transparent border-none outline-none focus:ring-0 text-[#1D1D1F]"
            />
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <div className="flex bg-[#F5F5F7] p-1 rounded-xl items-center mr-2 ring-1 ring-black/5">
                  <Button 
                    variant={spawnDirection === 'left' ? 'default' : 'ghost'} 
                    size="sm" 
                    onClick={() => setSpawnDirection('left')}
                    className={`h-8 px-3 rounded-lg text-xs ${spawnDirection === 'left' ? 'bg-white shadow-sm font-bold text-[#1D1D1F]' : 'text-[#86868B]'}`}
                  >
                    向左生枝
                  </Button>
                  <Button 
                    variant={spawnDirection === 'right' ? 'default' : 'ghost'} 
                    size="sm" 
                    onClick={() => setSpawnDirection('right')}
                    className={`h-8 px-3 rounded-lg text-xs ${spawnDirection === 'right' ? 'bg-white shadow-sm font-bold text-[#1D1D1F]' : 'text-[#86868B]'}`}
                  >
                    向右生枝
                  </Button>
                </div>
                <div className="flex bg-[#F5F5F7] p-1 rounded-xl items-center mr-4 ring-1 ring-black/5">
                  <Button 
                    variant={edgeStyle === 'step' ? 'default' : 'ghost'} 
                    size="sm" 
                    onClick={() => setEdgeStyle('step')}
                    className={`h-8 px-3 rounded-lg text-xs ${edgeStyle === 'step' ? 'bg-white shadow-sm font-bold text-[#1D1D1F]' : 'text-[#86868B]'}`}
                  >
                    直角连线
                  </Button>
                  <Button 
                    variant={edgeStyle === 'bezier' ? 'default' : 'ghost'} 
                    size="sm" 
                    onClick={() => setEdgeStyle('bezier')}
                    className={`h-8 px-3 rounded-lg text-xs ${edgeStyle === 'bezier' ? 'bg-white shadow-sm font-bold text-[#1D1D1F]' : 'text-[#86868B]'}`}
                  >
                    平滑曲线
                  </Button>
                </div>
                <Button onClick={handleSave} className="bg-[#1D1D1F] hover:bg-black text-white rounded-xl">
                  <Save size={16} className="mr-2" /> 保存
                </Button>
              </>
            )}
            {canManage && currentMap && (
              <>
                <Button variant="outline" onClick={() => { setSelectedMapForPerms(currentMap); setPermissionsOpen(true); }} className="rounded-xl border-black/10 hover:bg-[#F5F5F7]">
                  <Settings size={16} className="mr-2" /> 协作权限
                </Button>
                <Button variant="outline" onClick={() => {
                  setDeleteId(id!);
                }} className="rounded-xl border-red-500/20 text-red-500 hover:bg-red-50 hover:text-red-600">
                  <Trash2 size={16} className="mr-2" /> 删除
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 relative focus:outline-none" onKeyDown={canEdit ? handleEditorKeyDown : undefined} tabIndex={0}>
          <ReactFlowProvider>
            <ReactFlow 
              nodes={nodes} 
              edges={edges.map(e => ({
                ...e, 
                type: 'smoothstep', 
                style: e.style || { stroke: '#FF6B00', strokeWidth: 2 },
                pathOptions: { borderRadius: edgeStyle === 'step' ? 0 : 24 }
              }))}
              nodeTypes={nodeTypes}
              onNodesChange={canEdit ? onNodesChange : undefined}
              onEdgesChange={canEdit ? onEdgesChange : undefined}
              onConnect={canEdit ? onConnect : undefined}
              onNodesDelete={canEdit ? (deleted) => {
                 // Deletion is already handled by handleEditorKeyDown! Avoid duplicate logic
              } : undefined}
              fitView
              defaultEdgeOptions={{ 
                type: 'smoothstep', 
                animated: false, 
                style: { stroke: '#FF6B00', strokeWidth: 2 }
              }}
              proOptions={{ hideAttribution: true }}
              multiSelectionKeyCode="Shift"
            >
              <Controls />
              <MiniMap />
              <Background gap={12} size={1} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        {/* Permissions Dialog inside editor */}
        <Dialog open={permissionsOpen && selectedMapForPerms?.id === currentMap?.id} onOpenChange={setPermissionsOpen}>
          <DialogContent className="max-w-md bg-white rounded-[24px]">
            <PermissionsDialogContent 
              map={selectedMapForPerms} 
              users={users} 
              onClose={() => setPermissionsOpen(false)} 
              getUserDisplayName={getUserDisplayName}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">头脑风暴</h1>
          <p className="text-xs text-[#86868B] mt-1">Idea Brainstorming · 思维导图与协作</p>
        </div>
        <Button onClick={handleCreate} className="bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl font-bold px-6 h-10 shadow-[0_4px_12px_rgba(255,107,0,0.2)]">
          <Plus size={18} className="mr-2" />
          新建思维导图
        </Button>
      </header>

      {/* Folder Tabs */}
      {folders.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
          <Button 
            variant={activeFolder === 'all' ? 'default' : 'outline'} 
            onClick={() => setActiveFolder('all')}
            className={`rounded-full px-5 text-sm h-8 ${activeFolder === 'all' ? 'bg-[#FF6B00] hover:bg-[#E66000] text-white border-[#FF6B00]' : 'border-black/5 bg-white text-[#86868B] hover:text-black'}`}
          >
            全部
          </Button>
          <Button 
            variant={activeFolder === 'ungrouped' ? 'default' : 'outline'} 
            onClick={() => setActiveFolder('ungrouped')}
            className={`rounded-full px-5 text-sm h-8 ${activeFolder === 'ungrouped' ? 'bg-[#FF6B00] hover:bg-[#E66000] text-white border-[#FF6B00]' : 'border-black/5 bg-white text-[#86868B] hover:text-black'}`}
          >
            未分组
          </Button>
          {folders.map(f => (
            <Button 
              key={f}
              variant={activeFolder === f ? 'default' : 'outline'} 
              onClick={() => setActiveFolder(f)}
              className={`rounded-full px-5 text-sm h-8 ${activeFolder === f ? 'bg-[#FF6B00] hover:bg-[#E66000] text-white border-[#FF6B00]' : 'border-black/5 bg-white text-[#86868B] hover:text-black'}`}
            >
              {f}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {filteredMaps.map(m => {
          const isManager = m.ownerId === profile?.uid || isAdmin || (m.permissions && m.permissions[profile?.uid || ''] === 'manager');
          
          return (
            <div 
              key={m.id}
              onClick={() => navigate(`/brainstorming/${m.id}`)}
              className="bg-white rounded-[24px] p-6 shadow-sm border border-black/5 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden flex flex-col h-40"
            >
              <h3 className="font-bold text-lg text-[#1D1D1F] line-clamp-2">{m.title}</h3>
              <p className="text-xs text-[#86868B] mt-2 flex-1">
                最后更新: {new Date(m.updatedAt).toLocaleDateString()}
              </p>
              
              {/* Creator Tag at bottom right */}
              <div className="absolute bottom-4 right-4 bg-[#FF6B00]/10 border border-[#FF6B00]/20 text-[#FF6B00] px-3 py-1 rounded-full text-xs font-bold flex items-center shadow-sm">
                <span className="w-2 h-2 rounded-full bg-[#FF6B00] mr-2"></span>
                {getUserDisplayName(m.ownerId)}
              </div>

              {/* Action Menu (Manager Only) */}
              {isManager && (
                <div className="absolute top-4 right-4 z-10" onClick={(e) => e.stopPropagation()}>
                  <Popover>
                    <PopoverTrigger className="p-2 rounded-full hover:bg-black/5 text-[#86868B] transition-colors">
                      <MoreVertical size={16} />
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-32 p-1 rounded-xl shadow-xl border-black/5">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start text-xs rounded-lg"
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setRenameMap(m); 
                          setRenameTitle(m.title);
                          setRenameFolder(m.folder || '');
                          setRenameOpen(true); 
                        }}
                      >
                        重命名
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start text-xs rounded-lg"
                        onClick={(e) => { e.stopPropagation(); setSelectedMapForPerms(m); setPermissionsOpen(true); }}
                      >
                        设置权限
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start text-xs rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setDeleteId(m.id);
                        }}
                      >
                        删除
                      </Button>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={permissionsOpen && !id} onOpenChange={setPermissionsOpen}>
        <DialogContent className="max-w-md bg-white rounded-[24px]">
          <PermissionsDialogContent 
            map={selectedMapForPerms} 
            users={users} 
            onClose={() => setPermissionsOpen(false)} 
            getUserDisplayName={getUserDisplayName}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md bg-white rounded-[24px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">重命名及分类</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label className="text-xs font-bold text-[#86868B] mb-2 block">标题</label>
              <Input 
                value={renameTitle} 
                onChange={e => setRenameTitle(e.target.value)} 
                placeholder="输入新的标题..." 
                className="rounded-xl h-10" 
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#86868B] mb-2 block">所属文件夹</label>
              <Input 
                value={renameFolder} 
                onChange={e => setRenameFolder(e.target.value)} 
                placeholder="例如: 营销策划、产品方案 (留空为未分组)..." 
                className="rounded-xl h-10" 
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenameOpen(false)} className="rounded-xl">取消</Button>
            <Button onClick={async () => {
              if(!renameTitle.trim() || !renameMap) return;
              try {
                await updateDoc(doc(db, 'mindmaps', renameMap.id), { 
                  title: renameTitle.trim(), 
                  folder: renameFolder.trim(),
                  updatedAt: new Date().toISOString() 
                });
                toast.success('保存成功');
                setRenameOpen(false);
              } catch(e) {
                toast.error('保存失败');
              }
            }} className="bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl">保存</Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-sm bg-white rounded-[24px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-red-500">确认删除</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-[#1D1D1F]">
            确定要删除这份思维导图吗？此操作无法撤销。
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteId(null)} className="rounded-xl">取消</Button>
            <Button onClick={handleDeleteConfirm} className="bg-red-500 hover:bg-red-600 text-white rounded-xl">删除</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const PermissionsDialogContent: React.FC<{ map: any, users: any[], onClose: () => void, getUserDisplayName: (n: string) => string }> = ({ map, users, onClose, getUserDisplayName }) => {
  const [perms, setPerms] = useState<Record<string, string>>(map?.permissions || {});
  const [newUser, setNewUser] = useState('');
  const [newRole, setNewRole] = useState('viewer');

  const handleSave = async () => {
    if (!map) return;
    try {
      await updateDoc(doc(db, 'mindmaps', map.id), { permissions: perms });
      toast.success('权限设置已保存');
      onClose();
    } catch(e) {
      toast.error('保存失败');
    }
  };

  const handleAdd = () => {
    if (!newUser) return;
    if (perms[newUser]) return toast.error('该用户已在列表中');
    setPerms({ ...perms, [newUser]: newRole });
    setNewUser('');
  };

  const handleRemove = (uid: string) => {
    const newPerms = { ...perms };
    delete newPerms[uid];
    setPerms(newPerms);
  };

  const handleRoleChange = (uid: string, role: string) => {
    setPerms({ ...perms, [uid]: role });
  };

  const roleMap: Record<string, string> = { viewer: '只读', editor: '可编辑', manager: '可管理' };

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle className="text-xl font-bold">协作权限设置</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Select value={newUser} onValueChange={setNewUser}>
            <SelectTrigger className="flex-1 h-10 rounded-xl">
              <SelectValue placeholder="添加用户...">{newUser ? getUserDisplayName(newUser) : '添加用户...'}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {users.filter(u => u.id !== map?.ownerId).map(u => (
                <SelectItem key={u.id} value={u.id}>{getUserDisplayName(u.id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger className="w-28 h-10 rounded-xl">
              <SelectValue>{roleMap[newRole] || '选择权限'}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="viewer">只读</SelectItem>
              <SelectItem value="editor">可编辑</SelectItem>
              <SelectItem value="manager">可管理</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleAdd} className="h-10 rounded-xl bg-[#1D1D1F] hover:bg-black text-white">添加</Button>
        </div>

        <div className="space-y-2 max-h-60 overflow-auto custom-scrollbar">
          {Object.entries(perms).map(([userId, role]) => {
            return (
              <div key={userId} className="flex items-center justify-between bg-[#F5F5F7] p-3 rounded-xl border border-black/5">
                <span className="text-sm font-bold text-[#1D1D1F] truncate flex-1">
                  {getUserDisplayName(userId)}
                </span>
                <div className="flex items-center gap-2">
                  <Select value={role} onValueChange={(v: string) => handleRoleChange(userId, v)}>
                    <SelectTrigger className="w-24 h-8 rounded-lg border-none bg-white text-xs">
                      <SelectValue>{roleMap[role as string] || role}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="viewer">只读</SelectItem>
                      <SelectItem value="editor">可编辑</SelectItem>
                      <SelectItem value="manager">可管理</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => handleRemove(userId)} className="h-8 w-8 text-red-500 hover:bg-red-50">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
          {Object.keys(perms).length === 0 && (
            <div className="text-center text-sm text-[#86868B] py-4">暂无其他协作者</div>
          )}
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <Button onClick={handleSave} className="bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-xl">保存设置</Button>
      </div>
    </div>
  );
};
