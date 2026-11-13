import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';

export interface GraphNode {
    id: number;
    label: string;
    category: string;
    module?: string | null;
    trust?: number;
    isPinned?: boolean;
}

export interface GraphEdge {
    id: number;
    source: number;
    target: number;
    relation: string;
    confidence: number;
}

interface InteractiveGraphCanvasProps {
    nodes: GraphNode[];
    edges: GraphEdge[];
    onSelectNode?: (nodeId: number) => void;
}

interface SimNode extends GraphNode {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    isPinned?: boolean;
}

type LayoutMode = 'force' | 'exploded' | 'module_clusters' | 'hierarchical';

const pinNode = (node: SimNode) => {
    node.isPinned = true;
};

export const InteractiveGraphCanvas: React.FC<InteractiveGraphCanvasProps> = ({
    nodes,
    edges,
    onSelectNode,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('force');
    const layoutModeRef = useRef<LayoutMode>('force');
    const [pinnedNodeIds, setPinnedNodeIds] = useState<Set<number>>(new Set());

    // Zoom and pan state
    const [zoom, setZoom] = useState<number>(1.0);
    const [, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

    const zoomRef = useRef(1.0);
    const panRef = useRef({ x: 0, y: 0 });

    // Filter nodes and related edges
    const filteredNodes = useMemo(() => {
        if (filterCategory === 'all') return nodes;
        return nodes.filter((n) => n.category === filterCategory);
    }, [nodes, filterCategory]);

    const activeNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

    const filteredEdges = useMemo(() => {
        return edges.filter((e) => activeNodeIds.has(e.source) && activeNodeIds.has(e.target));
    }, [edges, activeNodeIds]);

    const simNodesRef = useRef<SimNode[]>([]);
    const dragRef = useRef<{
        mode: 'none' | 'node' | 'pan';
        node: SimNode | null;
        startX: number;
        startY: number;
        panStartX: number;
        panStartY: number;
    }>({
        mode: 'none',
        node: null,
        startX: 0,
        startY: 0,
        panStartX: 0,
        panStartY: 0,
    });

    // Helper: Convert client/screen pointer coordinates into canvas backing-store coordinates
    const getCanvasCoordinates = useCallback((clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { canvasX: 0, canvasY: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
        return {
            canvasX: (clientX - rect.left) * scaleX,
            canvasY: (clientY - rect.top) * scaleY,
        };
    }, []);

    // Helper: screen coordinates to world coordinates (taking backing store, zoom & pan into account)
    const toWorldCoords = useCallback((clientX: number, clientY: number) => {
        const { canvasX, canvasY } = getCanvasCoordinates(clientX, clientY);
        const z = zoomRef.current;
        const p = panRef.current;
        return {
            x: (canvasX - p.x) / z,
            y: (canvasY - p.y) / z,
            canvasX,
            canvasY,
        };
    }, [getCanvasCoordinates]);

    // Node category colors
    const getCategoryColor = (cat: string) => {
        switch (cat) {
            case 'cmdlet':
                return '#3b82f6'; // Blue
            case 'module':
                return '#8b5cf6'; // Purple
            case 'best_practice':
                return '#10b981'; // Green
            case 'security_guidance':
                return '#f59e0b'; // Amber
            case 'authentication_method':
                return '#ec4899'; // Pink
            default:
                return '#64748b'; // Slate
        }
    };

    // Apply layout formations (exploded / clusters / grid)
    const applyLayoutFormation = useCallback((mode: LayoutMode, currentNodes: SimNode[], width: number, height: number) => {
        const cx = width / 2;
        const cy = height / 2;
        const count = currentNodes.length;
        if (count === 0) return;

        if (mode === 'exploded') {
            // Exploded layout: Generous sunflower spiral / radial explosion separating all nodes cleanly
            const goldenAngle = Math.PI * (3 - Math.sqrt(5));
            const baseDist = Math.max(340, Math.sqrt(count) * 85);

            currentNodes.forEach((n, idx) => {
                const theta = idx * goldenAngle;
                const r = Math.sqrt(idx + 1) * (baseDist / Math.sqrt(count + 1));
                n.x = cx + Math.cos(theta) * r;
                n.y = cy + Math.sin(theta) * r;
                n.vx = 0;
                n.vy = 0;
            });
        } else if (mode === 'module_clusters') {
            // Cluster by module or category
            const clusters = new Map<string, SimNode[]>();
            currentNodes.forEach((n) => {
                const key = n.module || n.category || 'misc';
                if (!clusters.has(key)) clusters.set(key, []);
                clusters.get(key)!.push(n);
            });

            const clusterKeys = Array.from(clusters.keys());
            const clusterCount = clusterKeys.length;
            const orbitR = Math.max(260, clusterCount * 55);

            clusterKeys.forEach((key, cIdx) => {
                const angle = (cIdx / Math.max(1, clusterCount)) * 2 * Math.PI;
                const clusterCx = cx + Math.cos(angle) * orbitR;
                const clusterCy = cy + Math.sin(angle) * orbitR;

                const cNodes = clusters.get(key)!;
                cNodes.forEach((node, nIdx) => {
                    const subAngle = (nIdx / Math.max(1, cNodes.length)) * 2 * Math.PI;
                    const subR = nIdx === 0 && node.category === 'module' ? 0 : 55 + Math.floor(nIdx / 6) * 45;
                    node.x = clusterCx + Math.cos(subAngle) * subR;
                    node.y = clusterCy + Math.sin(subAngle) * subR;
                    node.vx = 0;
                    node.vy = 0;
                });
            });
        } else if (mode === 'hierarchical') {
            // Multi-row horizontal rank by category: Module (top) -> Cmdlet (middle) -> Best Practice (bottom)
            const ranks: Record<string, number> = {
                module: 0,
                cmdlet: 1,
                best_practice: 2,
                security_guidance: 2,
                authentication_method: 1,
            };

            const rows: SimNode[][] = [[], [], []];
            currentNodes.forEach((n) => {
                const r = ranks[n.category] ?? 1;
                rows[r].push(n);
            });

            const ySpacing = (height - 120) / Math.max(1, rows.length - 1);
            rows.forEach((rowNodes, rowIdx) => {
                const rowY = 80 + rowIdx * ySpacing;
                const xSpacing = (width - 120) / Math.max(1, rowNodes.length + 1);
                rowNodes.forEach((node, colIdx) => {
                    node.x = 60 + (colIdx + 1) * xSpacing;
                    node.y = rowY + (colIdx % 2 === 0 ? -12 : 12);
                    node.vx = 0;
                    node.vy = 0;
                });
            });
        }
    }, []);

    // Resize canvas backing dimensions according to layout container offsetWidth & offsetHeight
    useEffect(() => {
        const updateDimensions = () => {
            const canvas = canvasRef.current;
            const container = containerRef.current;
            if (!canvas || !container) return;
            const w = container.offsetWidth || 820;
            const h = container.offsetHeight || 540;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
        };

        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    // Initialize simulation nodes with existing positions preserved when possible
    useEffect(() => {
        const canvas = canvasRef.current;
        const width = canvas ? canvas.width : 820;
        const height = canvas ? canvas.height : 540;
        const prevMap = new Map<number, SimNode>();
        simNodesRef.current.forEach((n) => prevMap.set(n.id, n));

        const updated = filteredNodes.map((n, i) => {
            const existing = prevMap.get(n.id);
            if (existing) {
                return { ...existing, ...n };
            }
            const angle = (i / Math.max(1, filteredNodes.length)) * 2 * Math.PI;
            const radius = 170 + Math.random() * 80;
            return {
                ...n,
                x: width / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 40,
                y: height / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 40,
                vx: 0,
                vy: 0,
                radius: n.category === 'module' ? 26 : 20,
            };
        });

        simNodesRef.current = updated;

        if (layoutModeRef.current !== 'force') {
            applyLayoutFormation(layoutModeRef.current, updated, width, height);
        }
    }, [filteredNodes, applyLayoutFormation]);

    // Force simulation and rendering loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animId: number;
        const nodeMap = new Map<number, SimNode>();

        const step = () => {
            const width = canvas.width;
            const height = canvas.height;
            const currentNodes = simNodesRef.current;
            const currentMode = layoutModeRef.current;
            nodeMap.clear();
            currentNodes.forEach((n) => nodeMap.set(n.id, n));

            // In 'force' mode: Gentle physics simulation
            // In other modes ('exploded', 'module_clusters', 'hierarchical'): Static positioned, nodes don't drift back
            if (currentMode === 'force') {
                const cx = width / 2;
                const cy = height / 2;

                // Center gravity
                for (const n of currentNodes) {
                    if (dragRef.current.node?.id === n.id || n.isPinned) continue;
                    n.vx += (cx - n.x) * 0.0003;
                    n.vy += (cy - n.y) * 0.0003;
                }

                // Repulsion between nodes (increased distance to prevent huge blobs)
                for (let i = 0; i < currentNodes.length; i++) {
                    for (let j = i + 1; j < currentNodes.length; j++) {
                        const n1 = currentNodes[i];
                        const n2 = currentNodes[j];
                        const dx = n2.x - n1.x;
                        const dy = n2.y - n1.y;
                        const distSq = dx * dx + dy * dy + 1;
                        const dist = Math.sqrt(distSq);
                        const minDist = n1.radius + n2.radius + 60;

                        if (dist < 340) {
                            const force = (minDist * 28) / distSq;
                            const fx = (dx / dist) * force;
                            const fy = (dy / dist) * force;

                            if (dragRef.current.node?.id !== n1.id && !n1.isPinned) {
                                n1.vx -= fx;
                                n1.vy -= fy;
                            }
                            if (dragRef.current.node?.id !== n2.id && !n2.isPinned) {
                                n2.vx += fx;
                                n2.vy += fy;
                            }
                        }
                    }
                }

                // Spring force along edges
                for (const edge of filteredEdges) {
                    const s = nodeMap.get(edge.source);
                    const t = nodeMap.get(edge.target);
                    if (s && t) {
                        const dx = t.x - s.x;
                        const dy = t.y - s.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        const targetDist = 150;
                        const force = (dist - targetDist) * 0.012;
                        const fx = (dx / dist) * force;
                        const fy = (dy / dist) * force;

                        if (dragRef.current.node?.id !== s.id && !s.isPinned) {
                            s.vx += fx;
                            s.vy += fy;
                        }
                        if (dragRef.current.node?.id !== t.id && !t.isPinned) {
                            t.vx -= fx;
                            t.vy -= fy;
                        }
                    }
                }

                // Update positions with damping
                for (const n of currentNodes) {
                    if (dragRef.current.node?.id !== n.id && !n.isPinned) {
                        n.x += n.vx;
                        n.y += n.vy;
                        n.vx *= 0.82;
                        n.vy *= 0.82;
                    }
                }
            }

            // RENDER CANVAS
            ctx.clearRect(0, 0, width, height);

            // Save and apply camera transformation (Pan & Zoom)
            ctx.save();
            ctx.translate(panRef.current.x, panRef.current.y);
            ctx.scale(zoomRef.current, zoomRef.current);

            // 1. Draw Edges
            for (const edge of filteredEdges) {
                const s = nodeMap.get(edge.source);
                const t = nodeMap.get(edge.target);
                if (!s || !t) continue;

                const isHighlight =
                    selectedNodeId && (selectedNodeId === edge.source || selectedNodeId === edge.target);

                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(t.x, t.y);
                ctx.strokeStyle = isHighlight ? '#2563eb' : 'rgba(148, 163, 184, 0.4)';
                ctx.lineWidth = isHighlight ? 2.5 : 1.2;
                ctx.stroke();

                // Relation text label at midpoint with readable white pill background
                const midX = (s.x + t.x) / 2;
                const midY = (s.y + t.y) / 2;
                const relText = edge.relation.replace('_', ' ');

                ctx.font = '9px system-ui, sans-serif';
                const textWidth = ctx.measureText(relText).width;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
                ctx.fillRect(midX - textWidth / 2 - 3, midY - 11, textWidth + 6, 12);

                ctx.fillStyle = isHighlight ? '#1d4ed8' : '#64748b';
                ctx.textAlign = 'center';
                ctx.fillText(relText, midX, midY - 2);
            }

            // 2. Draw Nodes
            for (const n of currentNodes) {
                const isSelected = selectedNodeId === n.id;
                const isHovered = hoveredNode?.id === n.id;
                const color = getCategoryColor(n.category);

                // Outer halo if selected, hovered, or pinned
                if (isSelected || isHovered || n.isPinned) {
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, n.radius + 8, 0, 2 * Math.PI);
                    ctx.fillStyle = isSelected
                        ? 'rgba(59, 130, 246, 0.35)'
                        : n.isPinned
                        ? 'rgba(245, 158, 11, 0.25)'
                        : 'rgba(203, 213, 225, 0.4)';
                    ctx.fill();
                }

                // Node circle
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.lineWidth = isSelected ? 3.5 : 2;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();

                // Pinned indicator dot in top-right
                if (n.isPinned) {
                    ctx.beginPath();
                    ctx.arc(n.x + n.radius * 0.7, n.y - n.radius * 0.7, 4, 0, 2 * Math.PI);
                    ctx.fillStyle = '#f59e0b';
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }

                // Node label text with readable background pill
                ctx.font = `${n.category === 'module' ? 'bold ' : ''}11px monospace`;
                const label = n.label;
                const labelWidth = ctx.measureText(label).width;
                const labelY = n.y + n.radius + 15;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
                ctx.fillRect(n.x - labelWidth / 2 - 4, labelY - 10, labelWidth + 8, 14);

                ctx.fillStyle = '#0f172a';
                ctx.textAlign = 'center';
                ctx.fillText(label, n.x, labelY);
            }

            ctx.restore();

            animId = requestAnimationFrame(step);
        };

        animId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(animId);
    }, [filteredEdges, selectedNodeId, hoveredNode]);

    // Native Wheel Listener to support preventDefault() and prevent document scrolling
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleNativeWheel = (e: WheelEvent) => {
            e.preventDefault();
            const { canvasX, canvasY } = getCanvasCoordinates(e.clientX, e.clientY);

            const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
            const currentZ = zoomRef.current;
            const currentP = panRef.current;
            const newZoom = Math.min(3.5, Math.max(0.2, currentZ * zoomFactor));

            // Adjust pan to keep cursor position fixed in world space
            const newPanX = canvasX - (canvasX - currentP.x) * (newZoom / currentZ);
            const newPanY = canvasY - (canvasY - currentP.y) * (newZoom / currentZ);

            zoomRef.current = newZoom;
            panRef.current = { x: newPanX, y: newPanY };
            setZoom(newZoom);
            setPan({ x: newPanX, y: newPanY });
        };

        canvas.addEventListener('wheel', handleNativeWheel, { passive: false });
        return () => {
            canvas.removeEventListener('wheel', handleNativeWheel);
        };
    }, [getCanvasCoordinates]);

    // Mouse Interactions (Pan / Drag / Click)
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const world = toWorldCoords(e.clientX, e.clientY);

        // Check if a node was clicked (entire circle interior + generous touch padding)
        for (const n of simNodesRef.current) {
            const dx = world.x - n.x;
            const dy = world.y - n.y;
            const hitRadius = n.radius + 12;
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                // Pin the node at dropped location so physics doesn't snap it back
                pinNode(n);
                setPinnedNodeIds((prev) => new Set(prev).add(n.id));
                dragRef.current = {
                    mode: 'node',
                    node: n,
                    startX: world.x,
                    startY: world.y,
                    panStartX: panRef.current.x,
                    panStartY: panRef.current.y,
                };
                setSelectedNodeId(n.id);
                if (onSelectNode) onSelectNode(n.id);
                return;
            }
        }

        // Clicked background: Start canvas pan
        dragRef.current = {
            mode: 'pan',
            node: null,
            startX: world.canvasX,
            startY: world.canvasY,
            panStartX: panRef.current.x,
            panStartY: panRef.current.y,
        };
        setSelectedNodeId(null);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const world = toWorldCoords(e.clientX, e.clientY);

        // 1. Dragging Node (stays where dragged)
        if (dragRef.current.mode === 'node' && dragRef.current.node) {
            dragRef.current.node.x = world.x;
            dragRef.current.node.y = world.y;
            dragRef.current.node.vx = 0;
            dragRef.current.node.vy = 0;
            dragRef.current.node.isPinned = true;
            return;
        }

        // 2. Panning Canvas
        if (dragRef.current.mode === 'pan') {
            const dx = world.canvasX - dragRef.current.startX;
            const dy = world.canvasY - dragRef.current.startY;
            const nextPan = {
                x: dragRef.current.panStartX + dx,
                y: dragRef.current.panStartY + dy,
            };
            panRef.current = nextPan;
            setPan(nextPan);
            return;
        }

        // 3. Hover detection
        let found: SimNode | null = null;
        for (const n of simNodesRef.current) {
            const dx = world.x - n.x;
            const dy = world.y - n.y;
            const hitRadius = n.radius + 10;
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                found = n;
                break;
            }
        }
        setHoveredNode(found);
    };

    const handleMouseUp = () => {
        dragRef.current = {
            mode: 'none',
            node: null,
            startX: 0,
            startY: 0,
            panStartX: 0,
            panStartY: 0,
        };
    };

    // Layout switcher button handler
    const handleSetLayout = (mode: LayoutMode) => {
        setLayoutMode(mode);
        layoutModeRef.current = mode;
        const canvas = canvasRef.current;
        const width = canvas ? canvas.width : 820;
        const height = canvas ? canvas.height : 540;

        // Unpin all nodes for fresh calculation
        simNodesRef.current.forEach((n) => {
            n.isPinned = false;
        });
        setPinnedNodeIds(new Set());

        if (mode !== 'force') {
            applyLayoutFormation(mode, simNodesRef.current, width, height);
            // Center camera for exploded view
            zoomRef.current = mode === 'exploded' ? 0.75 : 0.9;
            panRef.current = { x: 0, y: 0 };
            setZoom(zoomRef.current);
            setPan(panRef.current);
        }
    };

    // Reset Zoom & Pan
    const handleResetView = () => {
        zoomRef.current = 1.0;
        panRef.current = { x: 0, y: 0 };
        setZoom(1.0);
        setPan({ x: 0, y: 0 });
    };

    const handleZoomIn = () => {
        const nextZoom = Math.min(3.5, zoomRef.current * 1.25);
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
    };

    const handleZoomOut = () => {
        const nextZoom = Math.max(0.2, zoomRef.current * 0.8);
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
    };

    const handleUnpinAll = () => {
        simNodesRef.current.forEach((n) => {
            n.isPinned = false;
        });
        setPinnedNodeIds(new Set());
    };

    const selectedDetails = useMemo(() => {
        if (!selectedNodeId) return null;
        const node = nodes.find((n) => n.id === selectedNodeId);
        if (!node) return null;
        const incoming = edges.filter((e) => e.target === selectedNodeId);
        const outgoing = edges.filter((e) => e.source === selectedNodeId);
        return { node, incoming, outgoing };
    }, [selectedNodeId, nodes, edges]);

    return (
        <div className="space-y-4">
            {/* Filter controls, layout switcher, and zoom toolbar */}
            <div className="flex flex-wrap justify-between items-center gap-3 bg-gray-50 dark:bg-gray-900/60 p-3 rounded-xl border border-gray-200 dark:border-gray-800 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Category:</span>
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="px-2 py-1 rounded-lg border dark:bg-gray-800 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                    >
                        <option value="all">All ({nodes.length})</option>
                        <option value="cmdlet">Cmdlets</option>
                        <option value="module">Modules</option>
                        <option value="best_practice">Best Practices</option>
                        <option value="security_guidance">Security</option>
                        <option value="authentication_method">Authentication</option>
                    </select>

                    {/* Layout switcher buttons */}
                    <div className="flex items-center gap-1 border-l border-gray-300 dark:border-gray-700 pl-2">
                        <span className="font-semibold text-gray-700 dark:text-gray-300 mr-1">Layout:</span>
                        <button
                            onClick={() => handleSetLayout('force')}
                            className={`px-2 py-1 rounded font-medium transition ${
                                layoutMode === 'force'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100'
                            }`}
                            title="Interactive Physics Network"
                        >
                            Physics
                        </button>
                        <button
                            onClick={() => handleSetLayout('exploded')}
                            className={`px-2 py-1 rounded font-medium transition ${
                                layoutMode === 'exploded'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100'
                            }`}
                            title="Exploded Radial View (separates big blobs)"
                        >
                            💥 Exploded
                        </button>
                        <button
                            onClick={() => handleSetLayout('module_clusters')}
                            className={`px-2 py-1 rounded font-medium transition ${
                                layoutMode === 'module_clusters'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100'
                            }`}
                            title="Group by Module Clusters"
                        >
                            Clusters
                        </button>
                        <button
                            onClick={() => handleSetLayout('hierarchical')}
                            className={`px-2 py-1 rounded font-medium transition ${
                                layoutMode === 'hierarchical'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100'
                            }`}
                            title="Tiered Hierarchy: Modules -> Cmdlets -> Practices"
                        >
                            Hierarchy
                        </button>
                    </div>

                    {/* Zoom & Pin controls */}
                    <div className="flex items-center gap-1 border-l border-gray-300 dark:border-gray-700 pl-2">
                        <button
                            onClick={handleZoomIn}
                            className="px-2 py-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 rounded font-bold text-gray-700 dark:text-gray-200"
                            title="Zoom In"
                        >
                            +
                        </button>
                        <button
                            onClick={handleZoomOut}
                            className="px-2 py-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 rounded font-bold text-gray-700 dark:text-gray-200"
                            title="Zoom Out"
                        >
                            -
                        </button>
                        <button
                            onClick={handleResetView}
                            className="px-2 py-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 rounded text-gray-700 dark:text-gray-200"
                            title="Reset Camera"
                        >
                            {Math.round(zoom * 100)}%
                        </button>
                        <button
                            onClick={handleUnpinAll}
                            className="px-2 py-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 rounded text-gray-700 dark:text-gray-200"
                            title="Unpin dragged nodes"
                        >
                            Release Pins
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-3 text-gray-500">
                    <div>Nodes: <strong className="text-gray-800 dark:text-gray-200">{filteredNodes.length}</strong></div>
                    <div>Edges: <strong className="text-gray-800 dark:text-gray-200">{filteredEdges.length}</strong></div>
                    <span className="text-gray-400">💡 Dragged nodes stay pinned</span>
                </div>
            </div>

            {/* Canvas and Inspector Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div
                    ref={containerRef}
                    className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden relative shadow-inner h-[560px]"
                >
                    <canvas
                        ref={canvasRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        className="w-full h-full cursor-grab active:cursor-grabbing block"
                    />

                    {/* Legend badge */}
                    <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] pointer-events-none">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Cmdlet</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Module</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Best Practice</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Security</span>
                    </div>

                    {/* Zoom & Mode indicator overlay */}
                    <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none">
                        <span className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-[11px] font-mono text-gray-600 dark:text-gray-300 uppercase">
                            {layoutMode}
                        </span>
                        <span className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-[11px] font-mono text-gray-600 dark:text-gray-300">
                            {Math.round(zoom * 100)}%
                        </span>
                    </div>
                </div>

                {/* Details sidecard */}
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col">
                    <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-2">Node Inspector</h3>
                    {selectedDetails ? (
                        <div className="space-y-4 text-xs">
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                                        {selectedDetails.node.category}
                                    </span>
                                    {(selectedNodeId !== null && pinnedNodeIds.has(selectedNodeId)) && (
                                        <span className="text-[10px] text-amber-600 font-semibold">📌 Pinned</span>
                                    )}
                                </div>
                                <h4 className="text-base font-bold text-gray-900 dark:text-white mt-1 break-all">
                                    {selectedDetails.node.label}
                                </h4>
                                {selectedDetails.node.module && (
                                    <div className="text-gray-500 mt-0.5">Module: <span className="font-mono">{selectedDetails.node.module}</span></div>
                                )}
                            </div>

                            <div className="space-y-2 border-t border-gray-200 dark:border-gray-800 pt-2">
                                <h5 className="font-semibold text-gray-700 dark:text-gray-300">Outgoing Relations ({selectedDetails.outgoing.length})</h5>
                                {selectedDetails.outgoing.length === 0 ? (
                                    <div className="text-gray-400 italic">No outgoing connections</div>
                                ) : (
                                    <div className="space-y-1">
                                        {selectedDetails.outgoing.map((edge) => (
                                            <div key={edge.id} className="p-1.5 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                                                <span className="text-[10px] text-blue-500 font-bold uppercase">{edge.relation.replace('_', ' ')}</span>
                                                <div className="font-medium truncate text-gray-900 dark:text-white">
                                                    → {nodes.find((n) => n.id === edge.target)?.label || edge.target}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2 border-t border-gray-200 dark:border-gray-800 pt-2">
                                <h5 className="font-semibold text-gray-700 dark:text-gray-300">Incoming Relations ({selectedDetails.incoming.length})</h5>
                                {selectedDetails.incoming.length === 0 ? (
                                    <div className="text-gray-400 italic">No incoming connections</div>
                                ) : (
                                    <div className="space-y-1">
                                        {selectedDetails.incoming.map((edge) => (
                                            <div key={edge.id} className="p-1.5 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                                                <span className="text-[10px] text-purple-500 font-bold uppercase">{edge.relation.replace('_', ' ')}</span>
                                                <div className="font-medium truncate text-gray-900 dark:text-white">
                                                    ← {nodes.find((n) => n.id === edge.source)?.label || edge.source}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-16 text-gray-400 text-xs">
                            Click on a node in the graph to inspect its connections and dependencies in detail.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
