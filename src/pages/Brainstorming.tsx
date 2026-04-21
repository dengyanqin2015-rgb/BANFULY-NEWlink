import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Settings, ArrowLeft, MoreVertical, Search, Save, Type, Bold, Palette, Baseline } from 'lucide-react';
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
  useReactFlow,
  SelectionMode
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes: Node[] = [
  { id: 'root', position: { x: 250, y: 150 }, data: { label: '中心主题', direction: 'root' }, type: 'mindmap' },
];
const initialEdges: Edge[] = [];

const estimateWidth = (node: any) => {
  const label = node.data.label || '';
  let charCount = 0;
  for (let i = 0; i < label.length; i++) {
    charCount += label.charCodeAt(i) > 255 ? 2.0 : 1.1;
  }
  const fontSize = node.data.fontSize || 14;
  // Content scale: approx 0.9 * fontSize per char unit (western=1.1, chinese=2.0)
  const contentWidth = Math.max(4, charCount) * (fontSize * 0.9);
  const baseWidth = contentWidth + 48; 
  
  if (node.id === 'root') return baseWidth + 60;
  if (node.data.parentId === 'root') return baseWidth + 40; 
  return baseWidth;
};

const layoutMindMap = (nodes: any[], globalsDirection: string = 'right') => {
  const nodeMap = new Map<string, any>();
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

  const nodeInfo = new Map<string, { depth: number; direction: string; width: number }>();
  const maxContentWidthPerDepth = new Map<string, number>();

  const traverseMeta = (id: string, depth: number, direction: string) => {
    const node = nodeMap.get(id);
    if (!node) return;
    
    const width = estimateWidth(node);
    const dir = id === 'root' ? 'root' : direction;
    nodeInfo.set(id, { depth, direction: dir, width });

    if (!node.hidden) {
      const children = childrenMap.get(id) || [];
      if (children.length > 0) {
        const key = `${depth}_${dir}`;
        const currentMax = maxContentWidthPerDepth.get(key) || 0;
        maxContentWidthPerDepth.set(key, Math.max(currentMax, width));
      }
    }

    const children = childrenMap.get(id) || [];
    children.forEach(cid => {
      const childNode = nodeMap.get(cid);
      const childDir = id === 'root' ? (childNode.data.direction || globalsDirection) : direction;
      traverseMeta(cid, depth + 1, childDir);
    });
  };

  traverseMeta('root', 0, globalsDirection);

  const getSubtreeHeight = (id: string): number => {
    const children = childrenMap.get(id) || [];
    if (children.length === 0) return 40;
    const h = children.reduce((sum: number, cid: string) => sum + getSubtreeHeight(cid), 0);
    return Math.max(40, h + (children.length - 1) * 24); 
  };

  const minGapX = 140; // Default min gap between columns

  const assignPositions = (id: string, x: number, y: number, direction: string) => {
    const node = nodeMap.get(id);
    if (!node) return;
    
    node.position = { x, y: y - 20 };

    const children = childrenMap.get(id) || [];
    if (children.length === 0) return;

    const info = nodeInfo.get(id);
    const key = `${info?.depth}_${info?.direction}`;
    const levelMaxWidth = maxContentWidthPerDepth.get(key) || 120;
    
    // To align children correctly at the same X coordinate:
    // Gap = (Max width of parents / 2) + 80 (standard line) + (Approximate max width of children / 2)
    // We use a constant for child width approximation to keep layout stable
    const nextLevelKey = `${(info?.depth || 0) + 1}_${info?.direction}`;
    const nextLevelMaxWidth = maxContentWidthPerDepth.get(nextLevelKey) || 120;
    
    const gapX = Math.max(minGapX, (levelMaxWidth / 2) + 80 + (nextLevelMaxWidth / 2));

    let totalH = getSubtreeHeight(id);
    let startY = y - totalH / 2;

    children.forEach((cid: string) => {
      const cHeight = getSubtreeHeight(cid);
      const childY = startY + cHeight / 2;
      const childNode = nodeMap.get(cid);
      const childDir = id === 'root' ? (childNode.data.direction || globalsDirection) : direction;
      
      const nextX = childDir === 'left' ? x - gapX : x + gapX;
      assignPositions(cid, nextX, childY, childDir);
      startY += cHeight + 24;
    });
  };

  const rootNode = nodeMap.get('root');
  if (rootNode) {
    assignPositions('root', rootNode.position.x, rootNode.position.y + 20, globalsDirection);
  }

  // Also handle drifting independent nodes (double-clicked靈感)
  nodes.forEach(n => {
    if (!n.data.parentId && n.id !== 'root') {
      const existing = nodeMap.get(n.id);
      if (existing) {
        existing.position = n.position; 
      }
    }
  });

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
  const isGhost = data.isGhost || false;
  const isSnapTarget = data.isSnapTarget || false;
  const parentId = data.parentId;
  const onDataChange = data.onDataChange;

  const nodeLevel = useMemo(() => {
    if (isRoot) return 0;
    if (!parentId) return -1;
    if (parentId === 'root') return 1;
    return 2;
  }, [isRoot, parentId]);

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
      if (onDataChange) {
        onDataChange(id, { isEditing: false });
      } else {
        setNodes((nds: any) => nds.map((n: any) => n.id === id ? { ...n, data: { ...n.data, isEditing: false } } : n));
      }
    }
  }, [data.isEditing, id, onDataChange, setNodes]);

  const onLabelSave = () => {
    setIsEditing(false);
    // Restore focus to container after editing to enable shortcuts
    setTimeout(() => {
      document.getElementById('mindmap-editor-container')?.focus();
    }, 50);
    if (onDataChange) {
      onDataChange(id, { label: localLabel });
    } else {
      setNodes((nds: any) => nds.map((n: any) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, label: localLabel } };
        }
        return n;
      }));
    }
  };

  const hasChildren = getNodes().some(n => n.data.parentId === id);

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
      return layoutMindMap(mapped, 'right');
    });
    
    setEdges((eds: any) => eds.map((e: any) => {
      if (descendants.has(e.target)) return { ...e, hidden: newCollapsed };
      return e;
    }));
  };

  const onChangeColor = (color: string) => {
    if (onDataChange) {
      onDataChange(id, { color });
    } else {
      setNodes((nds: any) => nds.map((n: any) => n.id === id ? { ...n, data: { ...n.data, color } } : n));
    }
    setShowPalette(false);
  };

  const nodeStyle = useMemo(() => {
    if (isGhost) return 'opacity-20 border-dashed scale-95 grayscale';
    
    // Base classes
    let base = 'transition-all duration-200 cursor-pointer border-2 ';
    
    if (isRoot) {
      base += 'bg-[#3B82F6] text-white border-transparent px-8 py-3 rounded-xl shadow-xl text-lg font-black min-w-[140px]';
    } else if (nodeLevel === 1) {
      base += 'bg-[#1D1D1F] text-white border-transparent rounded-lg shadow-md font-bold min-w-[120px]';
    } else if (nodeLevel === -1) {
      base += 'bg-amber-50 text-amber-900 border-dashed border-amber-200 rounded-full px-6 min-w-[100px] italic';
    } else {
      base += 'bg-white text-[#1D1D1F] border-[#E5E5E7] rounded-lg shadow-sm font-medium min-w-[100px]';
    }
    
    return base;
  }, [isRoot, nodeLevel, isGhost]);

  // Dynamic Styles from data
  const dynamicStyle = useMemo(() => {
    const s: any = {};
    if (!isGhost && nodeLevel > 0) {
      if (data.backgroundColor) s.backgroundColor = data.backgroundColor;
      else if (data.color) s.backgroundColor = data.color; // backward compatibility
      
      if (data.fontColor) s.color = data.fontColor;
      if (data.fontSize) s.fontSize = `${data.fontSize}px`;
      if (data.fontWeight) s.fontWeight = data.fontWeight;
    }
    return s;
  }, [data.backgroundColor, data.color, data.fontColor, data.fontSize, data.fontWeight, isGhost, nodeLevel]);

  const nodeWidth = useMemo(() => estimateWidth({ id, data }), [id, data.label, data.fontSize, data.parentId]);

  return (
    <div 
      className={`${nodeStyle} relative px-4 py-2 ${selected && !isRoot ? 'ring-2 ring-[#3B82F6] ring-offset-2' : ''} ${isSnapTarget ? 'bg-blue-50 border-blue-400 scale-105' : ''}`}
      style={{ ...dynamicStyle, width: `${nodeWidth}px` }}
      onDoubleClick={() => !isGhost && setIsEditing(true)}
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
           className="w-full bg-transparent outline-none text-center font-bold text-inherit p-0"
           style={{ 
             fontSize: data.fontSize ? `${data.fontSize}px` : undefined,
             fontWeight: data.fontWeight || undefined
           }}
         />
       ) : (
         <div className="w-full text-center select-none" style={{ 
           fontSize: data.fontSize ? `${data.fontSize}px` : undefined,
           fontWeight: data.fontWeight || undefined
         }}>
            {localLabel}
         </div>
       )}

       {!isEditing && !isRoot && nodeLevel !== -1 && (
         <div className="absolute top-[-30px] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex justify-center w-full">
            <div className="relative" onMouseLeave={() => setShowPalette(false)}>
              <button onMouseEnter={() => setShowPalette(true)} className="w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color || '#ffffff' }} />
              </button>
              {showPalette && (
                <div className="absolute top-7 left-1/2 -translate-x-1/2 bg-white p-2 rounded-xl shadow-2xl flex gap-1 border border-gray-100 z-30">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => onChangeColor(c)} className="w-5 h-5 rounded-full border border-gray-100" style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}
            </div>
         </div>
       )}
       
       {hasChildren && !isGhost && (
         <button 
           onClick={(e) => { e.stopPropagation(); toggleCollapse(); }}
           className={`absolute ${direction === 'left' ? '-left-3' : '-right-3'} top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-black flex items-center justify-center text-[10px] font-bold text-black z-10 hover:scale-110 transition-transform shadow-sm`}
         >
            {isCollapsed ? '+' : '-'}
         </button>
       )}

       {/* Precision ports for Mind Map style - Providing both allows flexible routing */}
       <Handle id="left" type="target" position={Position.Left} style={{ top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', opacity: 0 }} />
       <Handle id="right" type="target" position={Position.Right} style={{ top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', opacity: 0 }} />
       <Handle id="left" type="source" position={Position.Left} style={{ top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', opacity: 0 }} />
       <Handle id="right" type="source" position={Position.Right} style={{ top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', opacity: 0 }} />
    </div>
  );
};

const MindMapEdge = ({ id, sourceX, sourceY, targetX, targetY, style = {}, data }: any) => {
  const dx = Math.abs(targetX - sourceX);
  const dy = Math.abs(targetY - sourceY);
  const isLeft = targetX < sourceX;
  const edgeStyle = data?.edgeStyle || 'bezier';
  
  let path = '';
  
  if (edgeStyle === 'step') {
    // Rigid Right-angler (Rigid Step)
    const midX = sourceX + (isLeft ? -30 : 30);
    path = `M ${sourceX} ${sourceY} 
            L ${midX} ${sourceY} 
            L ${midX} ${targetY} 
            L ${targetX} ${targetY}`;
  } else {
    // Smooth Bezier
    const offset = Math.min(dx / 2, 80);
    path = `M ${sourceX} ${sourceY} 
            C ${sourceX + (isLeft ? -offset : offset)} ${sourceY}, 
              ${targetX + (isLeft ? offset : -offset)} ${targetY}, 
              ${targetX} ${targetY}`;
  }

  return (
    <path
      id={id}
      style={{ ...style, fill: 'none' }}
      className="react-flow__edge-path"
      d={path}
    />
  );
};

const nodeTypes = { mindmap: MindMapNode };
const edgeTypes = { mindmap: MindMapEdge };

const MindMapEditor = ({ id, maps, profile, isAdmin, isSuperAdmin, currentCompanyId, users, getUserDisplayName, navigate }: any) => {
  const { screenToFlowPosition, fitView, getNodes, getEdges } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [title, setTitle] = useState('');
  const [currentMap, setCurrentMap] = useState<any>(null);
  const [edgeStyle, setEdgeStyle] = useState<'step' | 'bezier'>('step');
  const [spawnDirection, setSpawnDirection] = useState<'right' | 'left'>('right');
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [selectedMapForPerms, setSelectedMapForPerms] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dragGhost, setDragGhost] = useState<Node | null>(null);
  const [snapTargetId, setSnapTargetId] = useState<string | null>(null);
  const [snapLandingGhost, setSnapLandingGhost] = useState<Node | null>(null);

  // Global Node Style (Theme)
  const [globalNodeStyle, setGlobalNodeStyle] = useState({
    fontSize: 14,
    fontWeight: 'normal',
    fontColor: '', // Inherit
    backgroundColor: '' // Default per level
  });

  // Refs to prevent stale closures in auto-save/cleanup
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const titleRef = useRef(title);
  const configRef = useRef({ edgeStyle, spawnDirection });

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { configRef.current = { edgeStyle, spawnDirection }; }, [edgeStyle, spawnDirection]);

  // Undo/Redo states
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [clipboard, setClipboard] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const pushToHistory = useCallback((nds: Node[], eds: Edge[]) => {
    setHistory(prev => [...prev.slice(-19), { nodes: nds, edges: eds }]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const lastState = history[history.length - 1];
    setRedoStack(prev => [...prev, { nodes, edges }]);
    setNodes(lastState.nodes);
    setEdges(lastState.edges);
    setHistory(prev => prev.slice(0, -1));
    toast.success('已撤回');
  }, [history, nodes, edges, setNodes, setEdges]);
  
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev, { nodes, edges }]);
    setNodes(nextState.nodes);
    setEdges(nextState.edges);
    setRedoStack(prev => prev.slice(0, -1));
    toast.success('已重做');
  }, [redoStack, nodes, edges, setNodes, setEdges]);

  useEffect(() => {
    if (id === 'new') {
      setTitle('新建头脑风暴');
      const rootNodeWithCallbacks = initialNodes.map(n => ({
        ...n,
        data: { ...n.data, onDataChange: (id: string, newData: any) => handleNodeDataChange(id, newData) }
      }));
      setNodes(rootNodeWithCallbacks);
      setEdges(initialEdges);
      setCurrentMap(null);
    } else {
      const found = maps.find((m: any) => m.id === id);
      if (found) {
        setCurrentMap(found);
        setTitle(found.title);
        if (found.data) {
          try {
            const parsed = JSON.parse(found.data);
            const loadedNodes = parsed.nodes || initialNodes;
            const config = parsed.mapConfig || {};
            setEdgeStyle(config.edgeStyle || 'step');
            setSpawnDirection(config.spawnDirection || 'right');
            setNodes(loadedNodes.map((n: any) => ({ 
              ...n, 
              type: 'mindmap',
              data: { ...n.data, onDataChange: (id: string, newData: any) => handleNodeDataChange(id, newData) }
            })));
            setEdges(parsed.edges || initialEdges);
          } catch(e) {}
        }
      }
    }
  }, [id, maps]);

  const handleNodeDataChange = useCallback((nodeId: string, newData: any) => {
    setNodes(nds => {
      const target = nds.find(n => n.id === nodeId);
      if (!target) return nds;
      // We push history if the label actually changed and it's not the initial 'isEditing' toggle
      if (newData.label !== undefined && newData.label !== target.data.label) {
        pushToHistory(nds, edges);
      }
      return nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n);
    });
  }, [edges, pushToHistory, setNodes]);

  const handleSave = useCallback(async (silent = false) => {
    if (!id || id === 'new' || !nodes.length) return;
    try {
      const dataStr = JSON.stringify({ nodes, edges, mapConfig: { edgeStyle, spawnDirection } });
      await updateDoc(doc(db, 'mindmaps', id), {
        title: title || '未命名脑图',
        data: dataStr,
        updatedAt: new Date().toISOString()
      });
      if (!silent) toast.success('保存成功');
    } catch(e) {
      if (!silent) toast.error('保存失败');
    }
  }, [id, nodes, edges, title, edgeStyle, spawnDirection]);

  // Debounced auto-save during editing
  useEffect(() => {
    if (!id || id === 'new' || nodes.length === 0) return;
    
    const timer = setTimeout(() => {
      handleSave(true);
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(timer);
  }, [nodes, edges, title, edgeStyle, spawnDirection, id, handleSave]);

  // Reliable auto-save on unmount using Refs
  useEffect(() => {
    return () => {
      if (id && id !== 'new' && nodesRef.current.length > 0) {
        const dataStr = JSON.stringify({ 
          nodes: nodesRef.current, 
          edges: edgesRef.current, 
          mapConfig: configRef.current 
        });
        updateDoc(doc(db, 'mindmaps', id), {
          title: titleRef.current || '未命名脑图',
          data: dataStr,
          updatedAt: new Date().toISOString()
        }).catch(console.error);
      }
    };
  }, [id]);

  const canEdit = !currentMap || currentMap.ownerId === profile?.uid || isAdmin || isSuperAdmin || 
                  (currentMap.permissions && ['editor', 'manager'].includes(currentMap.permissions[profile?.uid || '']));

  const canManage = !currentMap || currentMap.ownerId === profile?.uid || isAdmin || isSuperAdmin || 
                  (currentMap.permissions && currentMap.permissions[profile?.uid || ''] === 'manager');

  const handleExit = async () => {
    if (canEdit && id && id !== 'new') {
      await handleSave(true);
      toast.success('已为您自动保存修改', { duration: 2000 });
    }
    navigate('/brainstorming');
  };

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!canEdit) return;
    
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
      return;
    }

    // Ctrl + Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
      return;
    }

    // Ctrl + Y: Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
      return;
    }

    // Ctrl + C: Copy
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      const selectedNodes = nodes.filter(n => n.selected);
      if (selectedNodes.length > 0) {
        setClipboard({ 
          nodes: selectedNodes,
          edges: edges.filter(e => selectedNodes.some(n => n.id === e.source) && selectedNodes.some(n => n.id === e.target))
        });
        toast.success(`已复制 ${selectedNodes.length} 个节点`);
      }
      return;
    }

    // Ctrl + V: Paste
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      if (clipboard) {
        pushToHistory(nodes, edges);
        
        // Find if any node is currently selected to be the new parent
        const targetParent = nodes.find(n => n.selected);
        
        const idMap = new Map<string, string>();
        
        // Sort clipboard nodes by Y to maintain relative order if pasting as children
        const sortedPastedNodes = [...clipboard.nodes].sort((a, b) => a.position.y - b.position.y);
        
        const newNodes = sortedPastedNodes.map(n => {
          const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          idMap.set(n.id, newId);
          
          let direction = n.data.direction || spawnDirection;
          let parentId = null;
          let position = { x: n.position.x + 40, y: n.position.y + 40 };

          if (targetParent) {
            parentId = targetParent.id;
            direction = targetParent.id === 'root' ? (n.position.x < targetParent.position.x ? 'left' : 'right') : (targetParent.data.direction || spawnDirection);
            // Position will be handled by layout
          }

          return {
            ...n,
            id: newId,
            position,
            selected: true,
            data: { 
              ...n.data, 
              parentId, 
              direction,
              ...globalNodeStyle // Apply current theme to pasted nodes if no explicit parent logic?
              // Actually, user wants "subsequent nodes follow global", so we apply it here too
            }
          };
        });

        const newEdges = clipboard.edges.map(e => ({
          ...e,
          id: `edge_${idMap.get(e.source)}_${idMap.get(e.target)}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!
        }));

        // If targetParent exists, add connection edges from parent to the root-level nodes of the pasted selection
        const extraEdges: Edge[] = [];
        if (targetParent) {
          // A node in pasted selection is a "root-level" pasted node if its original parent was not in the pasted selection
          sortedPastedNodes.forEach(rn => {
            const isRootLevel = !clipboard.nodes.some(cn => cn.id === rn.data.parentId);
            if (isRootLevel) {
              const newChildId = idMap.get(rn.id)!;
              const direction = targetParent.id === 'root' ? (rn.position.x < targetParent.position.x ? 'left' : 'right') : (targetParent.data.direction || spawnDirection);
              extraEdges.push({
                id: `edge_${targetParent.id}_${newChildId}`,
                source: targetParent.id,
                target: newChildId,
                sourceHandle: direction,
                targetHandle: direction === 'left' ? 'right' : 'left',
                type: 'mindmap',
                style: { stroke: '#4F46E5', strokeWidth: 2 }
              });
            }
          });
        }
        
        setNodes(nds => {
          const nextNds = nds.map(n => ({ ...n, selected: false })).concat(newNodes);
          return targetParent ? layoutMindMap(nextNds, spawnDirection) : nextNds;
        });
        setEdges(eds => eds.concat(newEdges).concat(extraEdges));
        toast.success(`已粘贴 ${newNodes.length} 个节点`);
      }
      return;
    }
    
    // Tab: New Child
    if (e.key === 'Tab') {
      e.preventDefault();
      const selectedNodes = nodes.filter(n => n.selected);
      if (selectedNodes.length === 0) return;
      pushToHistory(nodes, edges);
      
      const parentId = selectedNodes[0].id;
      const parentNode = selectedNodes[0];
      
      const direction = parentId === 'root' ? spawnDirection : (parentNode.data.direction || spawnDirection);
      const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newNode: any = {
        id: newNodeId,
        type: 'mindmap',
        position: { x: parentNode.position.x + (direction === 'left' ? -200 : 200), y: parentNode.position.y },
        data: { 
          label: '新节点', 
          parentId, 
          direction, 
          isEditing: true, 
          onDataChange: (nodeId: string, newData: any) => handleNodeDataChange(nodeId, newData),
          ...globalNodeStyle
        },
        hidden: false,
        selected: true
      };

      const newEdge: Edge = {
        id: `edge_${parentId}_${newNodeId}`,
        source: parentId,
        target: newNodeId,
        sourceHandle: direction,
        targetHandle: direction === 'left' ? 'right' : 'left',
        type: 'mindmap',
        style: { stroke: '#4F46E5', strokeWidth: 2 }
      };

      setNodes(nds => {
        const nextNds = nds.map(n => ({ ...n, selected: false, data: { ...n.data, collapsed: n.id === parentId ? false : n.data.collapsed } }));
        return layoutMindMap([...nextNds, newNode], spawnDirection);
      });
      setEdges((eds) => [...eds, newEdge]);
    }

    // Enter: New Sibling
    if (e.key === 'Enter') {
      e.preventDefault();
      const selectedNodes = nodes.filter(n => n.selected);
      if (selectedNodes.length === 0) return;
      const selectedNode = selectedNodes[0];
      if (selectedNode.id === 'root') return;
      pushToHistory(nodes, edges);
      
      const parentId = selectedNode.data.parentId;
      const direction = selectedNode.data.direction;
      const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newNode: any = {
        id: newNodeId,
        type: 'mindmap',
        position: { x: selectedNode.position.x, y: selectedNode.position.y + 60 },
        data: { 
          label: '新分支', 
          parentId, 
          direction, 
          isEditing: true, 
          onDataChange: (nodeId: string, newData: any) => handleNodeDataChange(nodeId, newData),
          ...globalNodeStyle
        },
        hidden: false,
        selected: true
      };

      const newEdge: Edge = {
        id: `edge_${parentId}_${newNodeId}`,
        source: parentId,
        target: newNodeId,
        sourceHandle: direction,
        targetHandle: direction === 'left' ? 'right' : 'left',
        type: 'mindmap',
        style: { stroke: '#4F46E5', strokeWidth: 2 }
      };

      setNodes(nds => {
        const nextNds = nds.map(n => ({ ...n, selected: false }));
        return layoutMindMap([...nextNds, newNode], spawnDirection);
      });
      setEdges((eds) => [...eds, newEdge]);
    }

    // Space: Edit Node
    if (e.key === ' ') {
      e.preventDefault();
      const selectedNodes = nodes.filter(n => n.selected);
      if (selectedNodes.length === 0) return;
      setNodes(nds => nds.map(n => n.selected ? { ...n, data: { ...n.data, isEditing: true } } : n));
    }

    // Navigation (Arrow Keys)
    const navigationKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (navigationKeys.includes(e.key)) {
      e.preventDefault();
      const selectedNode = nodes.find(n => n.selected);
      if (!selectedNode) return;

      const currentPos = selectedNode.position;
      let closestNode: any = null;
      let minDistance = Infinity;

      nodes.forEach(n => {
        if (n.id === selectedNode.id || n.hidden) return;
        
        const dx = n.position.x - currentPos.x;
        const dy = n.position.y - currentPos.y;
        
        let isRightDirection = false;
        if (e.key === 'ArrowUp') isRightDirection = dy < 0 && Math.abs(dx) < Math.abs(dy);
        if (e.key === 'ArrowDown') isRightDirection = dy > 0 && Math.abs(dx) < Math.abs(dy);
        if (e.key === 'ArrowLeft') isRightDirection = dx < 0 && Math.abs(dy) < Math.abs(dx);
        if (e.key === 'ArrowRight') isRightDirection = dx > 0 && Math.abs(dy) < Math.abs(dx);

        if (isRightDirection) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDistance) {
            minDistance = dist;
            closestNode = n;
          }
        }
      });

      if (closestNode) {
        setNodes(nds => nds.map(n => ({
          ...n,
          selected: n.id === closestNode.id
        })));
      }
    }

    // Deletion
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const selectedNodeIds = new Set(nodes.filter(n => n.selected && n.id !== 'root').map(n => n.id));
      if (selectedNodeIds.size > 0) {
        pushToHistory(nodes, edges);
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
  }, [nodes, canEdit, spawnDirection, setNodes, setEdges]);

  const onPaneDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!canEdit) return;
    const target = e.target as HTMLElement;
    if (target.classList.contains('react-flow__pane')) {
      pushToHistory(nodes, edges);
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const newNodeId = `node_${Date.now()}`;
      const newNode: any = {
        id: newNodeId,
        type: 'mindmap',
        position,
        data: { 
          label: '新灵感', 
          isEditing: true, 
          onDataChange: (nodeId: string, newData: any) => handleNodeDataChange(nodeId, newData),
          ...globalNodeStyle
        },
        selected: true
      };
      setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(newNode));
    }
  }, [canEdit, screenToFlowPosition, setNodes, nodes, edges, pushToHistory]);

  const onNodeDragStart = useCallback((e: React.MouseEvent, node: Node) => {
    if (canEdit) {
      pushToHistory(nodes, edges);
      // The ghost is the "original position" anchor
      setDragGhost({ 
        ...node, 
        id: `${node.id}_ghost`, 
        selected: false, 
        selectable: false, 
        draggable: false, 
        zIndex: -1,
        data: { ...node.data, isGhost: true } 
      });
    }
  }, [canEdit, nodes, edges, pushToHistory]);

  const onNodeDrag = useCallback((e: React.MouseEvent, node: Node) => {
    if (!canEdit || node.id === 'root') return;
    
    // Find nearest node for snapping preview
    const currentNodes = getNodes();
    let nearest: any = null;
    let minDist = 80; // Reduced sensitivity

    currentNodes.forEach(n => {
      if (n.id === node.id || n.id.endsWith('_ghost') || n.id.endsWith('_landing') || n.hidden) return;
      const dx = n.position.x - node.position.x;
      const dy = n.position.y - node.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        nearest = n;
      }
    });

    if (nearest) {
      setSnapTargetId(nearest.id);
      // Create a "Landing Ghost" to show where it would snap
      const direction = nearest.id === 'root' ? (node.position.x < nearest.position.x ? 'left' : 'right') : (nearest.data.direction || 'right');
      const gapX = 180;
      setSnapLandingGhost({
        ...node,
        id: `${node.id}_landing`,
        selected: false,
        selectable: false,
        draggable: false,
        zIndex: -1,
        position: {
          x: nearest.position.x + (direction === 'left' ? -gapX : gapX),
          y: nearest.position.y 
        },
        data: { ...node.data, isGhost: true, direction, parentId: nearest.id }
      });
    } else {
      setSnapTargetId(null);
      setSnapLandingGhost(null);
    }
  }, [canEdit, getNodes]);

  const onNodeDragStop = useCallback((e: React.MouseEvent, node: Node, draggedNodes: Node[]) => {
    setDragGhost(null);
    setSnapTargetId(null);
    setSnapLandingGhost(null);
    if (!canEdit) return;

    // Use draggedNodes if it contains multiple nodes, otherwise fallback to the single node
    const nodesToReparent = draggedNodes.length > 1 ? draggedNodes : [node];
    
    // Sort nodes to reparent by Y position to maintain order
    const sortedNodesToReparent = [...nodesToReparent].sort((a, b) => a.position.y - b.position.y);
    const mainNode = nodesToReparent.find(n => n.id === node.id) || node;

    if (mainNode.id === 'root') {
      setNodes(nds => layoutMindMap(nds, spawnDirection));
      return;
    }
    
    // Snap to nearest node using the "main" node under cursor
    const currentNodes = getNodes();
    let nearestNode: any = null;
    let minDistance = 80;

    currentNodes.forEach(n => {
      const isDragged = nodesToReparent.some(dn => dn.id === n.id);
      if (isDragged || n.id.endsWith('_ghost') || n.id.endsWith('_landing') || n.hidden) return;
      
      const dx = n.position.x - mainNode.position.x;
      const dy = n.position.y - mainNode.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDistance) {
        minDistance = dist;
        nearestNode = n;
      }
    });

    if (nearestNode) {
      pushToHistory(nodes, edges);
      const newParentId = nearestNode.id;
      const rootNode = currentNodes.find(n => n.id === 'root');
      
      setNodes(nds => {
        const targetIds = nodesToReparent.map(n => n.id);
        const otherNodes = nds.filter(n => !targetIds.includes(n.id));
        
        const updatedNodes = sortedNodesToReparent.map(n => {
          let direction = 'right';
          if (newParentId === 'root') {
            direction = n.position.x < (rootNode?.position.x || 0) ? 'left' : 'right';
          } else {
            direction = nearestNode.data.direction || 'right';
          }
          return { ...n, data: { ...n.data, parentId: newParentId, direction } };
        });

        return layoutMindMap([...otherNodes, ...updatedNodes], spawnDirection);
      });

      setEdges(eds => {
        const targetIds = nodesToReparent.map(n => n.id);
        const filtered = eds.filter(edge => !targetIds.includes(edge.target));
        
        const newEdges = sortedNodesToReparent.map(n => {
          let direction = 'right';
          if (newParentId === 'root') {
            direction = n.position.x < (rootNode?.position.x || 0) ? 'left' : 'right';
          } else {
            direction = nearestNode.data.direction || 'right';
          }
          return {
            id: `edge_${newParentId}_${n.id}`,
            source: newParentId,
            target: n.id,
            sourceHandle: direction,
            targetHandle: direction === 'left' ? 'right' : 'left',
            type: 'mindmap',
            style: { stroke: '#4F46E5', strokeWidth: 2 }
          };
        });
        
        return [...filtered, ...newEdges];
      });

      toast.success(`已连接 ${nodesToReparent.length} 个节点到: ${nearestNode.data.label}`);
    } else {
       setNodes(nds => layoutMindMap(nds, spawnDirection));
    }
  }, [canEdit, getNodes, setNodes, setEdges, spawnDirection, nodes, edges, pushToHistory]);

  const onConnect = useCallback((params: Connection | Edge) => {
    pushToHistory(nodes, edges);
    setEdges((eds) => addEdge(params, eds));
  }, [setEdges, nodes, edges, pushToHistory]);

  const applyNodeStyle = (update: Partial<typeof globalNodeStyle>) => {
    const selectedNodes = nodes.filter(n => n.selected);
    const allNodesCount = nodes.length;
    
    pushToHistory(nodes, edges);

    if (selectedNodes.length > 0) {
      // If some nodes selected, update them
      setNodes(nds => nds.map(n => n.selected ? { ...n, data: { ...n.data, ...update } } : n));
      
      // If "Select All" case (selected count equals total nodes)
      if (selectedNodes.length === allNodesCount) {
        setGlobalNodeStyle(prev => ({ ...prev, ...update }));
      }
    } else {
      // If no nodes selected, update default for future nodes
      setGlobalNodeStyle(prev => ({ ...prev, ...update }));
      toast.info('已设置默认样式');
    }
  };

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col bg-white rounded-3xl shadow-sm border border-black/5 overflow-hidden">
        <div className="h-16 border-b border-black/5 px-6 flex items-center justify-between shrink-0 bg-[#F5F5F7]/30">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleExit}>
              <ArrowLeft size={18} />
            </Button>
            <input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              className="text-lg font-bold bg-transparent border-none outline-none focus:ring-0 text-[#1D1D1F] w-48"
            />
            {canEdit && (
              <div className="flex items-center gap-1.5 px-3 border-l border-black/10 ml-2">
                <Select value={String(globalNodeStyle.fontSize)} onValueChange={(v) => applyNodeStyle({ fontSize: parseInt(v) })}>
                   <SelectTrigger className="w-20 h-8 text-xs rounded-lg border-black/5 bg-[#F5F5F7]">
                     <SelectValue placeholder="字号" />
                   </SelectTrigger>
                   <SelectContent>
                      {[12, 14, 16, 18, 20, 24, 28, 32].map(s => (
                        <SelectItem key={s} value={String(s)}>{s}px</SelectItem>
                      ))}
                   </SelectContent>
                </Select>

                <Button 
                  variant={globalNodeStyle.fontWeight === 'bold' ? 'default' : 'ghost'} 
                  size="icon" 
                  className={`h-8 w-8 rounded-lg ${globalNodeStyle.fontWeight === 'bold' ? 'bg-[#1D1D1F] text-white' : 'hover:bg-[#F5F5F7]'}`}
                  onClick={() => applyNodeStyle({ fontWeight: globalNodeStyle.fontWeight === 'bold' ? 'normal' : 'bold' })}
                >
                  <Bold size={14} />
                </Button>

                <Popover>
                  <PopoverTrigger className="h-8 w-8 rounded-lg hover:bg-[#F5F5F7] flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <Baseline size={14} style={{ color: globalNodeStyle.fontColor || '#1D1D1F' }} />
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2">
                    <div className="grid grid-cols-5 gap-1">
                      {['#000000', '#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#8B5CF6', '#EC4899', '#ffffff', '#6B7280'].map(c => (
                        <button key={c} onClick={() => applyNodeStyle({ fontColor: c })} className={`w-6 h-6 rounded-md border ${c === '#ffffff' ? 'border-gray-200' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger className="h-8 w-8 rounded-lg hover:bg-[#F5F5F7] flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <Palette size={14} style={{ color: globalNodeStyle.backgroundColor || '#1D1D1F' }} />
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2">
                    <div className="grid grid-cols-5 gap-1">
                      {['#ffffff', '#F5F5F7', '#3B82F6', '#1D1D1F', '#EF4444', '#10B981', '#F59E0B', '#6366F1', '#8B5CF6', '#000000'].map(c => (
                        <button key={c} onClick={() => applyNodeStyle({ backgroundColor: c })} className={`w-6 h-6 rounded-md border ${c === '#ffffff' ? 'border-gray-200' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
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
                <Button onClick={() => handleSave()} className="bg-[#1D1D1F] hover:bg-black text-white rounded-xl">
                  <Save size={16} className="mr-2" /> 保存
                </Button>
              </>
            )}
            {canManage && currentMap && (
              <>
                <Button variant="outline" onClick={() => { setSelectedMapForPerms(currentMap); setPermissionsOpen(true); }} className="rounded-xl border-black/10 hover:bg-[#F5F5F7]">
                  <Settings size={16} className="mr-2" /> 协作权限
                </Button>
                <Button variant="outline" onClick={() => setDeleteId(id)} className="rounded-xl border-red-500/20 text-red-500 hover:bg-red-50 hover:text-red-600">
                  <Trash2 size={16} className="mr-2" /> 删除
                </Button>
              </>
            )}
          </div>
        </div>
        <div id="mindmap-editor-container" ref={containerRef} className="flex-1 relative focus:outline-none" onKeyDown={canEdit ? handleEditorKeyDown : undefined} tabIndex={0}>
            <ReactFlow 
              nodes={[...nodes, ...(dragGhost ? [dragGhost] : []), ...(snapLandingGhost ? [snapLandingGhost] : [])].map(n => ({
                ...n,
                data: { ...n.data, isSnapTarget: n.id === snapTargetId }
              }))} 
              edges={edges.map(e => {
                const sourceNode = nodes.find(n => n.id === e.source);
                const targetNode = nodes.find(n => n.id === e.target);
                const isLeft = targetNode?.data.direction === 'left';
                
                return {
                  ...e, 
                  type: 'mindmap', 
                  sourceHandle: isLeft ? 'left' : 'right',
                  targetHandle: isLeft ? 'right' : 'left',
                  data: { edgeStyle }, // Pass edgeStyle to custom component
                  style: { 
                    stroke: sourceNode?.data?.color || '#4F46E5', 
                    strokeWidth: sourceNode?.id === 'root' ? 4 : 2, 
                    opacity: e.hidden ? 0 : 0.8 
                  }
                };
              })}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={canEdit ? onNodesChange : undefined}
              onEdgesChange={canEdit ? onEdgesChange : undefined}
              onConnect={canEdit ? onConnect : undefined}
              onPaneClick={(e) => {
                if (e.detail === 2) onPaneDoubleClick(e);
              }}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              fitView
              defaultEdgeOptions={{ 
                type: 'smoothstep', 
                animated: false, 
                style: { stroke: '#FF6B00', strokeWidth: 2 }
              }}
              proOptions={{ hideAttribution: true }}
              multiSelectionKeyCode="Shift"
              selectionMode={SelectionMode.Partial}
              panOnScroll
              selectionOnDrag
            >
              <Controls />
              <MiniMap />
              <Background gap={12} size={1} />
            </ReactFlow>
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

        {/* Delete Confim inside editor */}
        <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <DialogContent className="max-w-sm bg-white rounded-[24px]">
            <DialogHeader>
              <DialogTitle>确认删除？</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-[#86868B] py-4">删除后将无法找回此头脑风暴。</p>
            <div className="flex justify-end gap-3">
               <Button variant="ghost" onClick={() => setDeleteId(null)}>取消</Button>
               <Button variant="destructive" onClick={async () => {
                 try {
                   await deleteDoc(doc(db, 'mindmaps', id));
                   toast.success('已删除');
                   navigate('/brainstorming');
                 } catch(e) {
                   toast.error('删除失败');
                 }
               }}>确认删除</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
};

export const Brainstorming: React.FC = () => {
  const { id } = useParams();
  const { profile, isAdmin, isSuperAdmin, currentCompanyId } = useAuth();
  const navigate = useNavigate();
  const [maps, setMaps] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Permissions state
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [selectedMapForPerms, setSelectedMapForPerms] = useState<any>(null);

  // Delete confirmation state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [activeFolder, setActiveFolder] = useState<string>('all');

  useEffect(() => {
    if (!currentCompanyId) return;
    const unsubMaps = onSnapshot(query(collection(db, 'mindmaps'), where('companyId', '==', currentCompanyId)), (snapshot) => {
      const allMaps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setMaps(allMaps.filter(m => {
        if (isAdmin || isSuperAdmin) return true;
        if (m.ownerId === profile?.uid) return true;
        if (m.permissions && m.permissions[profile?.uid || '']) return true;
        return false;
      }));
    });

    const unsubUsers = onSnapshot(query(collection(db, 'users'), where('companyId', '==', currentCompanyId)), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubMaps();
      unsubUsers();
    };
  }, [profile?.uid, isAdmin, isSuperAdmin, currentCompanyId]);

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
      setDeleteId(null);
    } catch(e) {
      toast.error('删除失败');
    }
  };

  const handleUpdateMapInfo = async () => {
    if (!renameMap) return;
    try {
      await updateDoc(doc(db, 'mindmaps', renameMap.id), {
        title: renameTitle,
        folder: renameFolder
      });
      toast.success('已更新');
      setRenameOpen(false);
    } catch(e) {
      toast.error('更新失败');
    }
  };

  const handleCreate = async () => {
    try {
      const docRef = await addDoc(collection(db, 'mindmaps'), {
        title: '新建头脑风暴',
        ownerId: profile?.uid,
        ownerName: profile?.displayName || profile?.email,
        companyId: currentCompanyId,
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
    const emailOrNameStr = typeof emailOrName === 'string' ? emailOrName : String(emailOrName || '');
    return user?.displayName || user?.username || (emailOrNameStr.includes('@') ? emailOrNameStr.split('@')[0] : emailOrNameStr);
  }, [users]);

  if (id && id !== 'list') {
    return (
      <ReactFlowProvider>
        <MindMapEditor 
          id={id}
          maps={maps}
          profile={profile}
          isAdmin={isAdmin}
          isSuperAdmin={isSuperAdmin}
          currentCompanyId={currentCompanyId}
          users={users}
          getUserDisplayName={getUserDisplayName}
          navigate={navigate}
        />
      </ReactFlowProvider>
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
                  <Select value={String(role) || ''} onValueChange={(v: string) => handleRoleChange(userId, v)}>
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
