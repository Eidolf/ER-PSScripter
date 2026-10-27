import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface HealthMetrics {
    total_entities: number;
    total_sources: number;
    total_relations: number;
    total_modules: number;
    total_cmdlets: number;
    total_snippets: number;
    knowledge_coverage_score: number;
    documentation_coverage_score: number;
    repository_freshness_score: number;
    source_quality_score: number;
    knowledge_utilization_score: number;
    categories_breakdown: Record<string, number>;
    weak_areas: string[];
    learning_recommendations: string[];
}

interface GraphNode {
    id: number;
    label: string;
    category: string;
    module?: string | null;
    trust?: number;
}

interface GraphEdge {
    id: number;
    source: number;
    target: number;
    relation: string;
    confidence: number;
}

interface KnowledgeEntity {
    id: number;
    canonical_name: string;
    category: string;
    description: string | null;
    tags: string[];
    source_type: string;
    source_url: string | null;
    ps_edition: string;
    min_ps_version: string | null;
    module_name: string | null;
    trust_level: number;
    confidence_score: number;
    structured_details: Record<string, unknown>;
    date_updated: string;
}

interface KnowledgeSource {
    id: number;
    name: string;
    source_type: string;
    url: string | null;
    trust_level: number;
    is_active: boolean;
    auto_refresh: boolean;
    entity_count: number;
}

export const KnowledgeExplorer: React.FC = () => {
    const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
    const [entities, setEntities] = useState<KnowledgeEntity[]>([]);
    const [sources, setSources] = useState<KnowledgeSource[]>([]);
    const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
    
    const [activeTab, setActiveTab] = useState<'entities' | 'graph' | 'sources' | 'health'>('entities');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedEntity, setSelectedEntity] = useState<KnowledgeEntity | null>(null);
    const [loading, setLoading] = useState(false);

    const token = localStorage.getItem('token');
    const headers = React.useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        try {
            const [metricsRes, entitiesRes, sourcesRes, graphRes] = await Promise.all([
                axios.get('/api/v1/knowledge/metrics', { headers }),
                axios.get('/api/v1/knowledge/entities', { headers }),
                axios.get('/api/v1/knowledge/sources', { headers }),
                axios.get('/api/v1/knowledge/graph', { headers }),
            ]);
            setMetrics(metricsRes.data);
            setEntities(entitiesRes.data);
            setSources(sourcesRes.data);
            setGraphData(graphRes.data);
        } catch (error) {
            console.error('Failed to load knowledge data:', error);
        } finally {
            setLoading(false);
        }
    }, [headers]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);


    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/knowledge/entities', {
                params: {
                    query: searchQuery || undefined,
                    category: selectedCategory !== 'all' ? selectedCategory : undefined,
                },
                headers,
            });
            setEntities(res.data);
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            setLoading(false);
        }
    };

    const categories = ['all', 'cmdlet', 'module', 'best_practice', 'security_guidance', 'authentication_method'];

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            {/* Header / Intro */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-200 dark:border-gray-800 pb-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
                        <span className="p-2 rounded-lg bg-blue-600 text-white shadow-md">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        </span>
                        PowerShell Knowledge Platform
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Authoritative, structured PowerShell repository serving as the single source of truth for generation and code verification.
                    </p>
                </div>

                {/* Score Pills */}
                {metrics && (
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-3 py-1.5 rounded-lg text-center">
                            <span className="block text-xs uppercase font-semibold text-blue-600 dark:text-blue-400">Coverage</span>
                            <span className="text-lg font-bold text-blue-700 dark:text-blue-300">{metrics.knowledge_coverage_score}%</span>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 px-3 py-1.5 rounded-lg text-center">
                            <span className="block text-xs uppercase font-semibold text-green-600 dark:text-green-400">Source Quality</span>
                            <span className="text-lg font-bold text-green-700 dark:text-green-300">{metrics.source_quality_score}%</span>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 px-3 py-1.5 rounded-lg text-center">
                            <span className="block text-xs uppercase font-semibold text-purple-600 dark:text-purple-400">Freshness</span>
                            <span className="text-lg font-bold text-purple-700 dark:text-purple-300">{metrics.repository_freshness_score}%</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 space-x-8">
                {(['entities', 'graph', 'sources', 'health'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`pb-4 px-1 text-sm font-medium border-b-2 capitalize transition-colors duration-200 ${
                            activeTab === tab
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                    >
                        {tab === 'entities' ? 'Knowledge Explorer' : tab === 'graph' ? 'Relationship Graph' : tab === 'sources' ? 'Knowledge Sources' : 'Repository Health'}
                    </button>
                ))}
            </div>

            {/* Tab: Entities & Deep Dive */}
            {activeTab === 'entities' && (
                <div className="space-y-6">
                    {/* Filter & Search Bar */}
                    <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search cmdlets, parameters, modules, security guidance (e.g. Connect-MgGraph, Try/Catch)..."
                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                            />
                            <svg className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 capitalize"
                        >
                            {categories.map((c) => (
                                <option key={c} value={c}>{c.replace('_', ' ')}</option>
                            ))}
                        </select>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow transition"
                        >
                            Filter
                        </button>
                    </form>

                    {/* Content Split: List & Deep-Dive */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Entity List */}
                        <div className="lg:col-span-2 space-y-4">
                            {loading ? (
                                <div className="p-8 text-center text-gray-500">Loading knowledge entities...</div>
                            ) : entities.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                                    No knowledge entities matched your query.
                                </div>
                            ) : (
                                entities.map((entity) => (
                                    <div
                                        key={entity.id}
                                        onClick={() => setSelectedEntity(entity)}
                                        className={`p-5 rounded-xl border transition cursor-pointer bg-white dark:bg-gray-800 ${
                                            selectedEntity?.id === entity.id
                                                ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                                                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 shadow-sm'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white font-mono">
                                                        {entity.canonical_name}
                                                    </h3>
                                                    <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 capitalize">
                                                        {entity.category.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                {entity.module_name && (
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                        Module: <span className="font-semibold">{entity.module_name}</span> | PS: {entity.ps_edition}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded text-xs font-semibold">
                                                <span>Trust {Math.round(entity.trust_level * 100)}%</span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 line-clamp-2">
                                            {entity.description || 'No detailed description available.'}
                                        </p>
                                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                                            {entity.tags?.map((tag) => (
                                                <span key={tag} className="px-2 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Deep-Dive Inspection Panel */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 h-fit sticky top-24 shadow-sm">
                            {selectedEntity ? (
                                <div className="space-y-4">
                                    <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                                        <span className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-400">
                                            Entity Deep-Dive
                                        </span>
                                        <h2 className="text-xl font-bold font-mono text-gray-900 dark:text-white mt-1">
                                            {selectedEntity.canonical_name}
                                        </h2>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Category: <span className="capitalize">{selectedEntity.category.replace('_', ' ')}</span>
                                        </p>
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-semibold text-gray-500 uppercase">Description</h4>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                                            {selectedEntity.description}
                                        </p>
                                    </div>

                                    {selectedEntity.source_url && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase">Source Reference</h4>
                                            <a
                                                href={selectedEntity.source_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all mt-1 block"
                                            >
                                                {selectedEntity.source_url}
                                            </a>
                                        </div>
                                    )}

                                    {selectedEntity.structured_details && Object.keys(selectedEntity.structured_details).length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Technical Specification</h4>
                                            <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-800 overflow-x-auto text-gray-800 dark:text-gray-200">
                                                {JSON.stringify(selectedEntity.structured_details, null, 2)}
                                            </pre>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-200 dark:border-gray-700 text-gray-500">
                                        <div>Trust Score: <strong>{Math.round(selectedEntity.trust_level * 100)}%</strong></div>
                                        <div>Confidence: <strong>{Math.round(selectedEntity.confidence_score * 100)}%</strong></div>
                                        <div>Min PS: <strong>{selectedEntity.min_ps_version || 'Any'}</strong></div>
                                        <div>Edition: <strong>{selectedEntity.ps_edition}</strong></div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-gray-400">
                                    <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                                    </svg>
                                    <p className="text-sm">Select an entity from the list to inspect authoritative technical details, syntax, and source attribution.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Tab: Graph Visualization */}
            {activeTab === 'graph' && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Knowledge Concept Relationship Graph</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Visualizing interconnected dependencies (modules $\leftrightarrow$ cmdlets $\leftrightarrow$ best practices $\leftrightarrow$ authentication).
                    </p>
                    
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {graphData.edges.map((edge, idx) => (
                                <div key={idx} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                                    <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">
                                        {edge.relation.replace('_', ' ')}
                                    </div>
                                    <div className="flex items-center gap-2 mt-2 font-mono text-sm">
                                        <span className="font-bold text-gray-900 dark:text-white">
                                            {graphData.nodes.find(n => n.id === edge.source)?.label || edge.source}
                                        </span>
                                        <span className="text-gray-400">→</span>
                                        <span className="text-gray-700 dark:text-gray-300">
                                            {graphData.nodes.find(n => n.id === edge.target)?.label || edge.target}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Tab: Knowledge Sources */}
            {activeTab === 'sources' && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 space-y-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Registered Knowledge Sources</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Authoritative documentation repositories, PowerShell Gallery specs, and verified community feeds.
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700 text-xs font-semibold uppercase text-gray-500">
                                    <th className="py-3 px-4">Source Name</th>
                                    <th className="py-3 px-4">Type</th>
                                    <th className="py-3 px-4">Trust Level</th>
                                    <th className="py-3 px-4">Auto Refresh</th>
                                    <th className="py-3 px-4">Entities</th>
                                    <th className="py-3 px-4">URL</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                                {sources.map((src) => (
                                    <tr key={src.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                        <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">{src.name}</td>
                                        <td className="py-3 px-4 capitalize text-gray-600 dark:text-gray-300">{src.source_type.replace('_', ' ')}</td>
                                        <td className="py-3 px-4">
                                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                                                {Math.round(src.trust_level * 100)}%
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{src.auto_refresh ? 'Enabled' : 'Manual'}</td>
                                        <td className="py-3 px-4 font-bold">{src.entity_count}</td>
                                        <td className="py-3 px-4">
                                            {src.url ? (
                                                <a href={src.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">
                                                    Visit Source
                                                </a>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Tab: Repository Health */}
            {activeTab === 'health' && metrics && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700">
                            <span className="text-xs uppercase text-gray-400 font-semibold">Total Entities</span>
                            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{metrics.total_entities}</div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700">
                            <span className="text-xs uppercase text-gray-400 font-semibold">Total Relationships</span>
                            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{metrics.total_relations}</div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700">
                            <span className="text-xs uppercase text-gray-400 font-semibold">Unique Modules</span>
                            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{metrics.total_modules}</div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700">
                            <span className="text-xs uppercase text-gray-400 font-semibold">Documentation Score</span>
                            <div className="text-2xl font-bold text-green-600 mt-1">{metrics.documentation_coverage_score}%</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Weak Areas */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                                Identified Knowledge Gaps
                            </h3>
                            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                {metrics.weak_areas.map((area, idx) => (
                                    <li key={idx} className="flex items-start gap-2">
                                        <span className="text-amber-500 font-bold">•</span>
                                        {area}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Learning Recommendations */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                                Automated Learning Priorities
                            </h3>
                            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                {metrics.learning_recommendations.map((rec, idx) => (
                                    <li key={idx} className="flex items-start gap-2">
                                        <span className="text-blue-500 font-bold">→</span>
                                        {rec}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KnowledgeExplorer;
