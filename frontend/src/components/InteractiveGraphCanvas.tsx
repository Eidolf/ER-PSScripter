import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';

export interface GraphNode {
    id: number;
    label: string;
    category: string;
    module?: string | null;
    trust?: number;
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
}

/**
 * Render a force-directed graph with category filtering, dragging, zoom, and a node inspector.
 * Edges are visible only when both endpoints pass the category filter.
 * Call onSelectNode on node mouse-down; clearing selection does not invoke it.
 */
export const InteractiveGraphCanvas: React.FC<InteractiveGraphCanvasProps> = ({
    nodes,
    edges,
    onSelectNode,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);

    // Zoom and pan state
    const [zoom, setZoom] = useState<number>(1.0);
    const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const panRef = useRef(pan);
    panRef.current = pan;

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

    // Node category colors
    /** Return the category's display color, falling back to slate for unknown categories. */
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

    // Helper: screen coordinates to world coordinates (taking zoom & pan into account)
    /** Convert pixel offsets from the canvas's top-left corner to graph coordinates. */
    const toWorldCoords = useCallback((screenX: number, screenY: number) => {
        const z = zoomRef.current;
        const p = panRef.current;
        return {
            x: (screenX - p.x) / z,
            y: (screenY - p.y) / z,
        };
    }, []);

    // Initialize simulation nodes with existing positions preserved when possible
    useEffect(() => {
        const width = 820;
        const height = 520;
        const prevMap = new Map<number, SimNode>();
        simNodesRef.current.forEach((n) => prevMap.set(n.id, n));

        simNodesRef.current = filteredNodes.map((n, i) => {
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
    }, [filteredNodes]);

    // Force simulation and rendering loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animId: number;
        const nodeMap = new Map<number, SimNode>();

        /** Advance node positions, redraw the graph, and schedule the next animation frame. */
        const step = () => {
            const width = canvas.width;
            const height = canvas.height;
            const currentNodes = simNodesRef.current;
            nodeMap.clear();
            currentNodes.forEach((n) => nodeMap.set(n.id, n));

            // Force simulation: Center gravity
            const cx = width / 2;
            const cy = height / 2;

            for (const n of currentNodes) {
                if (dragRef.current.node?.id === n.id) continue;
                n.vx += (cx - n.x) * 0.0005;
                n.vy += (cy - n.y) * 0.0005;
            }

            // Repulsion between nodes
            for (let i = 0; i < currentNodes.length; i++) {
                for (let j = i + 1; j < currentNodes.length; j++) {
                    const n1 = currentNodes[i];
                    const n2 = currentNodes[j];
                    const dx = n2.x - n1.x;
                    const dy = n2.y - n1.y;
                    const distSq = dx * dx + dy * dy + 1;
                    const dist = Math.sqrt(distSq);
                    const minDist = n1.radius + n2.radius + 35;

                    if (dist < 280) {
                        const force = (minDist * 20) / distSq;
                        const fx = (dx / dist) * force;
                        const fy = (dy / dist) * force;

                        if (dragRef.current.node?.id !== n1.id) {
                            n1.vx -= fx;
                            n1.vy -= fy;
                        }
                        if (dragRef.current.node?.id !== n2.id) {
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
                    const targetDist = 120;
                    const force = (dist - targetDist) * 0.015;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;

                    if (dragRef.current.node?.id !== s.id) {
                        s.vx += fx;
                        s.vy += fy;
                    }
                    if (dragRef.current.node?.id !== t.id) {
                        t.vx -= fx;
                        t.vy -= fy;
                    }
                }
            }

            // Update positions with damping
            for (const n of currentNodes) {
                if (dragRef.current.node?.id !== n.id) {
                    n.x += n.vx;
                    n.y += n.vy;
                    n.vx *= 0.85;
                    n.vy *= 0.85;
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
                ctx.strokeStyle = isHighlight ? '#3b82f6' : 'rgba(148, 163, 184, 0.45)';
                ctx.lineWidth = isHighlight ? 2.5 : 1.2;
                ctx.stroke();

                // Relation text label at midpoint with readable white pill background
                const midX = (s.x + t.x) / 2;
                const midY = (s.y + t.y) / 2;
                const relText = edge.relation.replace('_', ' ');

                ctx.font = '9px system-ui, sans-serif';
                const textWidth = ctx.measureText(relText).width;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
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

                // Outer halo if selected or hovered
                if (isSelected || isHovered) {
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, n.radius + 8, 0, 2 * Math.PI);
                    ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.3)' : 'rgba(203, 213, 225, 0.4)';
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

                // Node label text with readable background pill
                ctx.font = `${n.category === 'module' ? 'bold ' : ''}11px monospace`;
                const label = n.label;
                const labelWidth = ctx.measureText(label).width;
                const labelY = n.y + n.radius + 15;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
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

    // Mouse Interactions (Pan / Drag / Click)
    /**
     * Select and begin dragging the first node within its radius plus 10 graph units,
     * or clear selection and begin panning on a background hit.
     * Errors from onSelectNode propagate to the caller.
     */
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = toWorldCoords(screenX, screenY);

        // Check if a node was clicked (entire circle interior + generous touch padding)
        for (const n of simNodesRef.current) {
            const dx = world.x - n.x;
            const dy = world.y - n.y;
            // Radius + 10px generous padding so the user can easily click anywhere inside or near the circle
            const hitRadius = n.radius + 10;
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
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
            startX: screenX,
            startY: screenY,
            panStartX: panRef.current.x,
            panStartY: panRef.current.y,
        };
        setSelectedNodeId(null);
    };

    /** Move a dragged node, pan the view, or update hover using 8 graph units of hit padding. */
    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = toWorldCoords(screenX, screenY);

        // 1. Dragging Node
        if (dragRef.current.mode === 'node' && dragRef.current.node) {
            dragRef.current.node.x = world.x;
            dragRef.current.node.y = world.y;
            dragRef.current.node.vx = 0;
            dragRef.current.node.vy = 0;
            return;
        }

        // 2. Panning Canvas
        if (dragRef.current.mode === 'pan') {
            const dx = screenX - dragRef.current.startX;
            const dy = screenY - dragRef.current.startY;
            setPan({
                x: dragRef.current.panStartX + dx,
                y: dragRef.current.panStartY + dy,
            });
            return;
        }

        // 3. Hover detection
        let found: SimNode | null = null;
        for (const n of simNodesRef.current) {
            const dx = world.x - n.x;
            const dy = world.y - n.y;
            const hitRadius = n.radius + 8;
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                found = n;
                break;
            }
        }
        setHoveredNode(found);
    };

    /** End node dragging or panning, including when the pointer leaves the canvas. */
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

    // Zoom on wheel (mouse wheel zoom centered at cursor)
    /** Zoom around the cursor, clamped to 0.3–3.5 times the original scale. */
    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
        const newZoom = Math.min(3.5, Math.max(0.3, zoomRef.current * zoomFactor));

        // Adjust pan to keep cursor position fixed in world space
        const newPanX = mouseX - (mouseX - panRef.current.x) * (newZoom / zoomRef.current);
        const newPanY = mouseY - (mouseY - panRef.current.y) * (newZoom / zoomRef.current);

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
    };

    // Reset Zoom & Pan
    /** Restore the original scale and clear the pan offset. */
    const handleResetView = () => {
        setZoom(1.0);
        setPan({ x: 0, y: 0 });
    };

    /** Increase the scale by 25%, capped at 3.5 times the original scale. */
    const handleZoomIn = () => {
        setZoom((prev) => Math.min(3.5, prev * 1.25));
    };

    /** Reduce the scale by 20%, floored at 0.3 times the original scale. */
    const handleZoomOut = () => {
        setZoom((prev) => Math.max(0.3, prev * 0.8));
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
            {/* Filter controls and stats */}
            <div className="flex flex-wrap justify-between items-center gap-3 bg-gray-50 dark:bg-gray-900/60 p-3 rounded-xl border border-gray-200 dark:border-gray-800 text-xs">
                <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Filter Category:</span>
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="px-2.5 py-1 rounded-lg border dark:bg-gray-800 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                    >
                        <option value="all">All Categories ({nodes.length} nodes)</option>
                        <option value="cmdlet">Cmdlets</option>
                        <option value="module">Modules</option>
                        <option value="best_practice">Best Practices</option>
                        <option value="security_guidance">Security</option>
                        <option value="authentication_method">Authentication</option>
                    </select>

                    <div className="flex items-center gap-1 border-l border-gray-300 dark:border-gray-700 pl-3">
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
                            className="px-2.5 py-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 rounded text-gray-700 dark:text-gray-200"
                            title="Reset View"
                        >
                            {Math.round(zoom * 100)}% Reset
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-4 text-gray-500">
                    <div>Nodes: <strong className="text-gray-800 dark:text-gray-200">{filteredNodes.length}</strong></div>
                    <div>Edges: <strong className="text-gray-800 dark:text-gray-200">{filteredEdges.length}</strong></div>
                    <span className="text-gray-400">💡 Mausrad: Zoom | Canvas ziehen: Pan | Node greifen: Bewegen</span>
                </div>
            </div>

            {/* Canvas and Inspector Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden relative shadow-inner">
                    <canvas
                        ref={canvasRef}
                        width={820}
                        height={540}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onWheel={handleWheel}
                        className="w-full h-[540px] cursor-grab active:cursor-grabbing block"
                    />

                    {/* Legend badge */}
                    <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] pointer-events-none">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Cmdlet</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Module</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Best Practice</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Security</span>
                    </div>

                    {/* Zoom indicator overlay */}
                    <div className="absolute top-3 right-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 text-[11px] font-mono text-gray-600 dark:text-gray-300 pointer-events-none">
                        Zoom: {Math.round(zoom * 100)}%
                    </div>
                </div>

                {/* Details sidecard */}
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col">
                    <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-2">Node Inspector</h3>
                    {selectedDetails ? (
                        <div className="space-y-4 text-xs">
                            <div>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                                    {selectedDetails.node.category}
                                </span>
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
                            Klicke auf einen Knoten im Graphen, um seine Verbindungen und Abhängigkeiten im Detail zu prüfen.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
