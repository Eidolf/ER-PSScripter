import React, { useRef, useEffect, useState, useMemo } from 'react';

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

export const InteractiveGraphCanvas: React.FC<InteractiveGraphCanvasProps> = ({
    nodes,
    edges,
    onSelectNode,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);

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
    const dragRef = useRef<{ node: SimNode | null; isDragging: boolean }>({ node: null, isDragging: false });

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

    // Initialize simulation nodes
    useEffect(() => {
        const width = 800;
        const height = 500;
        simNodesRef.current = filteredNodes.map((n, i) => {
            const angle = (i / Math.max(1, filteredNodes.length)) * 2 * Math.PI;
            const radius = 160 + Math.random() * 80;
            return {
                ...n,
                x: width / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 40,
                y: height / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 40,
                vx: 0,
                vy: 0,
                radius: n.category === 'module' ? 24 : 18,
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
                n.vx += (cx - n.x) * 0.0006;
                n.vy += (cy - n.y) * 0.0006;
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
                    const minDist = n1.radius + n2.radius + 30;

                    if (dist < 260) {
                        const force = (minDist * 18) / distSq;
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
                    const targetDist = 110;
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

            // Update positions with damping and boundaries
            for (const n of currentNodes) {
                if (dragRef.current.node?.id !== n.id) {
                    n.x += n.vx;
                    n.y += n.vy;
                    n.vx *= 0.85;
                    n.vy *= 0.85;

                    n.x = Math.max(n.radius + 10, Math.min(width - n.radius - 10, n.x));
                    n.y = Math.max(n.radius + 10, Math.min(height - n.radius - 10, n.y));
                }
            }

            // RENDER CANVAS
            ctx.clearRect(0, 0, width, height);

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

                // Relation text label at midpoint
                const midX = (s.x + t.x) / 2;
                const midY = (s.y + t.y) / 2;
                ctx.font = '9px system-ui, sans-serif';
                ctx.fillStyle = isHighlight ? '#1d4ed8' : '#94a3b8';
                ctx.textAlign = 'center';
                ctx.fillText(edge.relation.replace('_', ' '), midX, midY - 3);
            }

            // 2. Draw Nodes
            for (const n of currentNodes) {
                const isSelected = selectedNodeId === n.id;
                const isHovered = hoveredNode?.id === n.id;
                const color = getCategoryColor(n.category);

                // Outer halo if selected or hovered
                if (isSelected || isHovered) {
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, n.radius + 6, 0, 2 * Math.PI);
                    ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(203, 213, 225, 0.3)';
                    ctx.fill();
                }

                // Node circle
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.lineWidth = isSelected ? 3 : 1.5;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();

                // Node label text
                ctx.font = `${n.category === 'module' ? 'bold ' : ''}11px monospace`;
                ctx.fillStyle = '#1e293b';
                ctx.textAlign = 'center';
                const label = n.label.length > 18 ? n.label.substring(0, 16) + '…' : n.label;
                ctx.fillText(label, n.x, n.y + n.radius + 14);
            }

            animId = requestAnimationFrame(step);
        };

        animId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(animId);
    }, [filteredEdges, selectedNodeId, hoveredNode]);

    // Mouse Interactions (Pan / Drag / Click)
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        for (const n of simNodesRef.current) {
            const dx = mx - n.x;
            const dy = my - n.y;
            if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) {
                dragRef.current = { node: n, isDragging: true };
                setSelectedNodeId(n.id);
                if (onSelectNode) onSelectNode(n.id);
                return;
            }
        }
        setSelectedNodeId(null);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (dragRef.current.isDragging && dragRef.current.node) {
            dragRef.current.node.x = mx;
            dragRef.current.node.y = my;
            dragRef.current.node.vx = 0;
            dragRef.current.node.vy = 0;
            return;
        }

        // Hover detection
        let found: SimNode | null = null;
        for (const n of simNodesRef.current) {
            const dx = mx - n.x;
            const dy = my - n.y;
            if (dx * dx + dy * dy <= n.radius * n.radius) {
                found = n;
                break;
            }
        }
        setHoveredNode(found);
    };

    const handleMouseUp = () => {
        dragRef.current = { node: null, isDragging: false };
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
                <div className="flex items-center gap-2">
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
                </div>

                <div className="flex items-center gap-4 text-gray-500">
                    <div>Nodes: <strong className="text-gray-800 dark:text-gray-200">{filteredNodes.length}</strong></div>
                    <div>Edges: <strong className="text-gray-800 dark:text-gray-200">{filteredEdges.length}</strong></div>
                    <span className="text-gray-400">💡 Drag nodes to explore or click to inspect relationships</span>
                </div>
            </div>

            {/* Canvas and Inspector Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden relative shadow-inner">
                    <canvas
                        ref={canvasRef}
                        width={820}
                        height={520}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        className="w-full h-[520px] cursor-grab active:cursor-grabbing block"
                    />

                    {/* Legend badge */}
                    <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px]">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Cmdlet</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Module</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Best Practice</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Security</span>
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

