import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { InteractiveGraphCanvas } from '../components/InteractiveGraphCanvas';

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
    last_crawled_at: string | null;
}

interface CrawlerStatus {
    is_running: boolean;
    continuous_mode?: boolean;
    source_id: number | null;
    source_name: string | null;
    current_url?: string | null;
    progress_message: string;
    pages_crawled: number;
    max_pages?: number;
    entities_extracted?: number;
    queue_size?: number;
    recent_logs?: string[];
}

export const KnowledgeExplorer: React.FC = () => {
    const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
    const [entities, setEntities] = useState<KnowledgeEntity[]>([]);
    const [sources, setSources] = useState<KnowledgeSource[]>([]);
    const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
    const [crawlerStatus, setCrawlerStatus] = useState<CrawlerStatus>({
        is_running: false,
        source_id: null,
        source_name: null,
        progress_message: 'Idle',
        pages_crawled: 0,
    });

    const [activeTab, setActiveTab] = useState<'entities' | 'graph' | 'sources' | 'health'>('entities');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedEntity, setSelectedEntity] = useState<KnowledgeEntity | null>(null);
    const [loading, setLoading] = useState(false);

    // Modal state for adding custom KB Article / Entity
    const [showAddModal, setShowAddModal] = useState(false);
    const [newArticle, setNewArticle] = useState({
        canonical_name: '',
        category: 'best_practice',
        description: '',
        module_name: '',
        tags: '',
        source_url: '',
    });

    // Modal state for adding URL / Documentation Source
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [newSource, setNewSource] = useState({
        name: '',
        source_type: 'microsoft_learn',
        url: '',
        trust_level: 1.0,
    });

    // Modal state for editing existing Documentation Source
    const [editingSource, setEditingSource] = useState<KnowledgeSource | null>(null);

    const token = localStorage.getItem('token');
    const headers = React.useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        try {
            const [metricsRes, entitiesRes, sourcesRes, graphRes, crawlerRes] = await Promise.all([
                axios.get('/api/v1/knowledge/metrics', { headers }),
                axios.get('/api/v1/knowledge/entities', { headers }),
                axios.get('/api/v1/knowledge/sources', { headers }),
                axios.get('/api/v1/knowledge/graph', { headers }),
                axios.get('/api/v1/knowledge/crawler/status', { headers }),
            ]);
            setMetrics(metricsRes.data);
            setEntities(entitiesRes.data);
            setSources(sourcesRes.data);
            setGraphData(graphRes.data);
            setCrawlerStatus(crawlerRes.data);
        } catch (error) {
            console.error('Failed to load knowledge data:', error);
        } finally {
            setLoading(false);
        }
    }, [headers]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Live status polling when crawling is in progress
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | null = null;

        if (crawlerStatus.is_running) {
            interval = setInterval(async () => {
                try {
                    const res = await axios.get('/api/v1/knowledge/crawler/status', { headers });
                    setCrawlerStatus(res.data);
                    if (!res.data.is_running) {
                        fetchData();
                    }
                } catch (e) {
                    console.error('Failed to poll crawler status:', e);
                }
            }, 2000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [crawlerStatus.is_running, headers, fetchData]);

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

    const handleStartCrawl = async (sourceId: number) => {
        try {
            setCrawlerStatus((prev) => ({ ...prev, is_running: true, progress_message: 'Triggering crawl...' }));
            await axios.post(`/api/v1/knowledge/sources/${sourceId}/crawl`, {}, { headers });
            // Immediate status poll to capture running state and background details
            const res = await axios.get('/api/v1/knowledge/crawler/status', { headers });
            setCrawlerStatus(res.data);
        } catch (err) {
            console.error('Failed to trigger crawl:', err);
            const res = await axios.get('/api/v1/knowledge/crawler/status', { headers }).catch(() => null);
            if (res) setCrawlerStatus(res.data);
        }
    };

    const handleStartContinuousCrawl = async () => {
        try {
            setCrawlerStatus((prev) => ({
                ...prev,
                is_running: true,
                continuous_mode: true,
                progress_message: 'Starting 24/7 background crawler...',
            }));
            await axios.post('/api/v1/knowledge/crawler/start-continuous', {}, { headers });
            const res = await axios.get('/api/v1/knowledge/crawler/status', { headers });
            setCrawlerStatus(res.data);
        } catch (err) {
            console.error('Failed to start continuous crawl:', err);
        }
    };

    const handleStopCrawl = async () => {
        try {
            await axios.post('/api/v1/knowledge/crawler/stop', {}, { headers });
            const res = await axios.get('/api/v1/knowledge/crawler/status', { headers });
            setCrawlerStatus(res.data);
        } catch (err) {
            console.error('Failed to stop crawl:', err);
        }
    };

    const handleCreateArticle = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const tagsList = newArticle.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
            await axios.post(
                '/api/v1/knowledge/entities',
                {
                    canonical_name: newArticle.canonical_name,
                    category: newArticle.category,
                    description: newArticle.description,
                    module_name: newArticle.module_name || null,
                    tags: tagsList,
                    source_url: newArticle.source_url || null,
                    source_type: 'manual_entry',
                    trust_level: 0.95,
                    confidence_score: 1.0,
                },
                { headers }
            );
            setShowAddModal(false);
            setNewArticle({
                canonical_name: '',
                category: 'best_practice',
                description: '',
                module_name: '',
                tags: '',
                source_url: '',
            });
            fetchData();
        } catch (err) {
            console.error('Failed to create knowledge article:', err);
        }
    };

    const handleCreateSource = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post(
                '/api/v1/knowledge/sources',
                {
                    name: newSource.name,
                    source_type: newSource.source_type,
                    url: newSource.url || null,
                    trust_level: newSource.trust_level,
                    is_active: true,
                    auto_refresh: false,
                },
                { headers }
            );
            setShowSourceModal(false);
            setNewSource({
                name: '',
                source_type: 'microsoft_learn',
                url: '',
                trust_level: 1.0,
            });
            fetchData();
        } catch (err) {
            console.error('Failed to create knowledge source:', err);
        }
    };

    const handleUpdateSource = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSource) return;
        try {
            await axios.put(
                `/api/v1/knowledge/sources/${editingSource.id}`,
                {
                    name: editingSource.name,
                    source_type: editingSource.source_type,
                    url: editingSource.url || null,
                    trust_level: editingSource.trust_level,
                },
                { headers }
            );
            setEditingSource(null);
            fetchData();
        } catch (err) {
            console.error('Failed to update knowledge source:', err);
        }
    };

    const handleDeleteSource = async (sourceId: number, sourceName: string) => {
        if (!window.confirm(`Are you sure you want to delete the source "${sourceName}"? Existing crawled entities will be preserved.`)) {
            return;
        }
        try {
            await axios.delete(`/api/v1/knowledge/sources/${sourceId}`, { headers });
            fetchData();
        } catch (err) {
            console.error('Failed to delete knowledge source:', err);
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

                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow transition flex items-center gap-2 text-sm"
                    >
                        <span>+</span> Add KB Article
                    </button>
                    <button
                        onClick={() => setShowSourceModal(true)}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium rounded-lg border border-gray-300 dark:border-gray-700 transition text-sm"
                    >
                        + Add Documentation URL
                    </button>
                </div>
            </div>

            {/* Live Crawler Status Bar & Details */}
            <div className={`p-4 rounded-xl border mb-6 transition-all ${
                crawlerStatus.is_running
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
            }`}>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <div className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${crawlerStatus.is_running ? 'bg-amber-500 animate-ping' : 'bg-green-500'}`} />
                            <span className="font-semibold text-sm">
                                {crawlerStatus.is_running
                                    ? crawlerStatus.continuous_mode
                                        ? '24/7 BACKGROUND CRAWLER RUNNING'
                                        : `CRAWLING: ${crawlerStatus.source_name || 'Active'}`
                                    : 'CRAWLER IDLE'}
                            </span>
                        </div>
                        <span className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 px-2.5 py-1 rounded-md font-mono">
                            {crawlerStatus.progress_message}
                        </span>
                        {crawlerStatus.entities_extracted !== undefined && crawlerStatus.entities_extracted > 0 && (
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                +{crawlerStatus.entities_extracted} entities extracted
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {!crawlerStatus.is_running ? (
                            <button
                                onClick={handleStartContinuousCrawl}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded shadow transition flex items-center gap-1.5"
                                title="Continuously and gently crawl all registered documentation sources 24/7"
                            >
                                <span>▶</span> Start 24/7 Background Ingestion
                            </button>
                        ) : (
                            <button
                                onClick={handleStopCrawl}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded shadow transition flex items-center gap-1.5"
                            >
                                <span>⏹</span> Stop Crawler
                            </button>
                        )}
                    </div>
                </div>

                {/* Detailed Live Telemetry when running or when logs exist */}
                {crawlerStatus.is_running && (
                    <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800/60 text-xs space-y-2">
                        <div className="flex flex-wrap items-center gap-4 text-xs">
                            {crawlerStatus.max_pages ? (
                                <div>
                                    <span className="text-gray-500 dark:text-gray-400">Pages: </span>
                                    <span className="font-bold">{crawlerStatus.pages_crawled} / {crawlerStatus.max_pages}</span>
                                </div>
                            ) : (
                                <div>
                                    <span className="text-gray-500 dark:text-gray-400">Pages processed: </span>
                                    <span className="font-bold">{crawlerStatus.pages_crawled}</span>
                                </div>
                            )}

                            {crawlerStatus.queue_size !== undefined && (
                                <div>
                                    <span className="text-gray-500 dark:text-gray-400">Queue size: </span>
                                    <span className="font-bold">{crawlerStatus.queue_size} link(s) pending</span>
                                </div>
                            )}

                            {crawlerStatus.current_url && (
                                <div className="truncate max-w-xl">
                                    <span className="text-gray-500 dark:text-gray-400">Current URL: </span>
                                    <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">{crawlerStatus.current_url}</span>
                                </div>
                            )}
                        </div>

                        {/* Recent Activity Log Snippet */}
                        {crawlerStatus.recent_logs && crawlerStatus.recent_logs.length > 0 && (
                            <div className="mt-2 bg-gray-900 text-gray-200 rounded p-2.5 font-mono text-[11px] max-h-28 overflow-y-auto space-y-1">
                                {crawlerStatus.recent_logs.slice(-5).map((log, index) => (
                                    <div key={index} className="truncate">{log}</div>
                                ))}
                            </div>
                        )}
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
                                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-line">
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
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Knowledge Concept Relationship Graph</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Interactive concept network of modules, cmdlets, and best-practice rules. Expands dynamically on every crawl with discovered module associations and cross-references.
                        </p>
                    </div>

                    <InteractiveGraphCanvas
                        nodes={graphData.nodes}
                        edges={graphData.edges}
                        onSelectNode={(nodeId) => {
                            const found = entities.find((e) => e.id === nodeId);
                            if (found) {
                                setSelectedEntity(found);
                            }
                        }}
                    />
                </div>
            )}

            {/* Tab: Knowledge Sources */}
            {activeTab === 'sources' && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Registered Knowledge Sources</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Authoritative documentation repositories, PowerShell Gallery specs, and verified community feeds.
                            </p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700 text-xs font-semibold uppercase text-gray-500">
                                    <th className="py-3 px-4">Source Name</th>
                                    <th className="py-3 px-4">Type</th>
                                    <th className="py-3 px-4">Trust Level</th>
                                    <th className="py-3 px-4">Last Crawled</th>
                                    <th className="py-3 px-4">Entities</th>
                                    <th className="py-3 px-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                                {sources.map((src) => (
                                    <tr key={src.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                        <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
                                            {src.name}
                                            {src.url && (
                                                <a href={src.url} target="_blank" rel="noreferrer" className="block text-xs text-blue-500 hover:underline">
                                                    {src.url}
                                                </a>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 capitalize text-gray-600 dark:text-gray-300">{src.source_type.replace('_', ' ')}</td>
                                        <td className="py-3 px-4">
                                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                                                {Math.round(src.trust_level * 100)}%
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-xs text-gray-500">
                                            {src.last_crawled_at ? new Date(src.last_crawled_at).toLocaleString() : 'Never'}
                                        </td>
                                        <td className="py-3 px-4 font-bold">{src.entity_count}</td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    disabled={crawlerStatus.is_running}
                                                    onClick={() => handleStartCrawl(src.id)}
                                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded text-xs shadow transition"
                                                    title="Run on-demand crawl on this source"
                                                >
                                                    Start Crawl
                                                </button>
                                                <button
                                                    onClick={() => setEditingSource(src)}
                                                    className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded text-xs transition"
                                                    title="Edit source name and URL"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteSource(src.id, src.name)}
                                                    className="px-2.5 py-1 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded text-xs transition"
                                                    title="Delete source"
                                                >
                                                    Delete
                                                </button>
                                            </div>
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

            {/* Modal: Add Manual KB Article */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Add New PowerShell KB Article</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
                        </div>
                        <form onSubmit={handleCreateArticle} className="space-y-4 text-sm">
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Title / Concept Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. ConvertTo-SecureString Best Practice"
                                    value={newArticle.canonical_name}
                                    onChange={(e) => setNewArticle({ ...newArticle, canonical_name: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Category</label>
                                    <select
                                        value={newArticle.category}
                                        onChange={(e) => setNewArticle({ ...newArticle, category: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white capitalize"
                                    >
                                        <option value="best_practice">Best Practice</option>
                                        <option value="security_guidance">Security Guidance</option>
                                        <option value="cmdlet">Cmdlet</option>
                                        <option value="module">Module</option>
                                        <option value="authentication_method">Authentication Method</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Module Name (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Microsoft.Graph"
                                        value={newArticle.module_name}
                                        onChange={(e) => setNewArticle({ ...newArticle, module_name: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Content / Description</label>
                                <textarea
                                    rows={4}
                                    required
                                    placeholder="Explain the pattern, rules, examples or troubleshooting steps..."
                                    value={newArticle.description}
                                    onChange={(e) => setNewArticle({ ...newArticle, description: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Tags (Comma separated)</label>
                                <input
                                    type="text"
                                    placeholder="security, credentials, powershell7"
                                    value={newArticle.tags}
                                    onChange={(e) => setNewArticle({ ...newArticle, tags: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Source URL (Optional reference)</label>
                                <input
                                    type="url"
                                    placeholder="https://learn.microsoft.com/..."
                                    value={newArticle.source_url}
                                    onChange={(e) => setNewArticle({ ...newArticle, source_url: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                                >
                                    Save Article
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Add URL Documentation Source */}
            {showSourceModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Register Documentation Source</h3>
                            <button onClick={() => setShowSourceModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
                        </div>
                        <form onSubmit={handleCreateSource} className="space-y-4 text-sm">
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Source Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Azure PowerShell Modules Docs"
                                    value={newSource.name}
                                    onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Source Type</label>
                                <select
                                    value={newSource.source_type}
                                    onChange={(e) => setNewSource({ ...newSource, source_type: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white capitalize"
                                >
                                    <option value="microsoft_learn">Microsoft Learn Docs</option>
                                    <option value="psgallery">PowerShell Gallery</option>
                                    <option value="microsoft_repo">Microsoft GitHub Repo</option>
                                    <option value="community_blog">Technical Blog / Community</option>
                                    <option value="custom_url">Custom Documentation URL</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Target Documentation URL</label>
                                <input
                                    type="url"
                                    required
                                    placeholder="https://learn.microsoft.com/powershell/module/..."
                                    value={newSource.url}
                                    onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setShowSourceModal(false)}
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                                >
                                    Register Source
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Modal: Edit Documentation Source */}
            {editingSource && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Edit Knowledge Source</h3>
                            <button onClick={() => setEditingSource(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
                        </div>
                        <form onSubmit={handleUpdateSource} className="space-y-4 text-sm">
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Source Name</label>
                                <input
                                    type="text"
                                    required
                                    value={editingSource.name}
                                    onChange={(e) => setEditingSource({ ...editingSource, name: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Source Type</label>
                                <select
                                    value={editingSource.source_type}
                                    onChange={(e) => setEditingSource({ ...editingSource, source_type: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white capitalize"
                                >
                                    <option value="microsoft_learn">Microsoft Learn Docs</option>
                                    <option value="psgallery">PowerShell Gallery</option>
                                    <option value="microsoft_repo">Microsoft GitHub Repo</option>
                                    <option value="community_blog">Technical Blog / Community</option>
                                    <option value="custom_url">Custom Documentation URL</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Documentation URL</label>
                                <input
                                    type="url"
                                    required
                                    placeholder="https://..."
                                    value={editingSource.url || ''}
                                    onChange={(e) => setEditingSource({ ...editingSource, url: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Trust Level ({Math.round(editingSource.trust_level * 100)}%)</label>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="1.0"
                                    step="0.05"
                                    value={editingSource.trust_level}
                                    onChange={(e) => setEditingSource({ ...editingSource, trust_level: parseFloat(e.target.value) })}
                                    className="w-full"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setEditingSource(null)}
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KnowledgeExplorer;
