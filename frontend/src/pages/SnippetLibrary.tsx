import { useState, useEffect } from 'react';
import { getSnippets, createSnippet, updateSnippet, deleteSnippet, analyzeFolder } from '../api/snippets';
import type { Snippet } from '../api/snippets';
import { getSettings } from '../api/settings';
import { STANDARD_CATEGORIES, SYSTEM_SETTING_CUSTOM_CATEGORIES } from '../utils/categories';

export default function SnippetLibrary() {
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [categories, setCategories] = useState<string[]>(STANDARD_CATEGORIES);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', content: '', description: '', tags: '', category: 'General' });

    // Edit Mode State
    const [selectedSnippet, setSelectedSnippet] = useState<Snippet | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({ name: '', content: '', description: '', tags: '', category: 'General' });

    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Tag Modal State
    const [showTagModal, setShowTagModal] = useState(false);
    const [tagSearchQuery, setTagSearchQuery] = useState('');

    // Import Modal State
    const [showImportModal, setShowImportModal] = useState(false);
    const [importPath, setImportPath] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [detectedSnippets, setDetectedSnippets] = useState<any[]>([]);
    const [snippetsToImport, setSnippetsToImport] = useState<number[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [snippetsData, settingsData] = await Promise.all([
                getSnippets(),
                getSettings()
            ]);
            setSnippets(snippetsData);

            const customCatSetting = settingsData.find(s => s.key === SYSTEM_SETTING_CUSTOM_CATEGORIES);
            if (customCatSetting && customCatSetting.value) {
                try {
                    const custom = JSON.parse(customCatSetting.value);
                    if (Array.isArray(custom)) {
                        setCategories([...STANDARD_CATEGORIES, ...custom]);
                    }
                } catch (e) {
                    console.error("Failed to parse custom categories", e);
                }
            }
        } catch (error) {
            console.error("Failed to load data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createSnippet({
                ...formData,
                tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
                category: formData.category || 'General'
            });
            setShowForm(false);
            setFormData({ name: '', content: '', description: '', tags: '', category: 'General' });
            loadData();
        } catch (error) {
            console.error("Failed to save snippet", error);
            alert("Failed to save snippet. Please check backend connection.");
        }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSnippet) return;
        try {
            const updated = await updateSnippet(selectedSnippet.id, {
                ...editData,
                tags: editData.tags.split(',').map(t => t.trim()).filter(Boolean),
                category: editData.category || 'General'
            });
            setSelectedSnippet(updated);
            setIsEditing(false);
            loadData();
        } catch (error) {
            console.error("Failed to update snippet", error);
            alert("Failed to update snippet.");
        }
    };

    const handleDelete = async (id: number) => {
        if (confirm("Are you sure?")) {
            await deleteSnippet(id);
            if (selectedSnippet?.id === id) {
                setSelectedSnippet(null);
                setIsEditing(false);
            }
            loadData();
        }
    };

    const openModal = (snippet: Snippet) => {
        setSelectedSnippet(snippet);
        setEditData({
            name: snippet.name,
            content: snippet.content,
            description: snippet.description || '',
            tags: snippet.tags.join(', '),
            category: snippet.category || 'General'
        });
        setIsEditing(false);
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            alert("Code copied to clipboard!");
        } catch (err) {
            console.error('Failed to copy!', err);
        }
    };

    const toggleTagFilter = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
    };

    const handleAnalyze = async () => {
        if (!importPath) return;
        setAnalyzing(true);
        try {
            const results = await analyzeFolder(importPath);
            // Add a temporary ID for selection
            const resultsWithId = results.map((s: any, idx: number) => ({ ...s, _tempId: idx }));
            setDetectedSnippets(resultsWithId);
            setSnippetsToImport(resultsWithId.map((s: any) => s._tempId)); // Select all by default
        } catch (error) {
            console.error("Analysis failed", error);
            alert("Failed to analyze folder. Ensure path exists on server.");
        } finally {
            setAnalyzing(false);
        }
    };

    const handleImportSubmit = async () => {
        const toImport = detectedSnippets.filter(s => snippetsToImport.includes(s._tempId));
        if (toImport.length === 0) return;

        try {
            // Sequential import to avoid overwhelming backend/db
            for (const s of toImport) {
                // Remove temp ID
                const { _tempId, ...snippetData } = s;
                await createSnippet(snippetData);
            }
            alert(`Successfully imported ${toImport.length} snippets!`);
            setShowImportModal(false);
            setDetectedSnippets([]);
            setImportPath('');
            loadData();
        } catch (error) {
            console.error("Import failed", error);
            alert("Some imports failed. Check console.");
        }
    };

    const toggleImportSelection = (id: number) => {
        setSnippetsToImport(prev =>
            prev.includes(id)
                ? prev.filter(i => i !== id)
                : [...prev, id]
        );
    };

    // Filter Logic
    const filteredSnippets = snippets.filter(snippet => {
        const matchesSearch = (
            snippet.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (snippet.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            snippet.content.toLowerCase().includes(searchQuery.toLowerCase())
        );

        // Filter by tags: Snippet must match ALL selected tags (AND logic)
        const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => snippet.tags.includes(tag));

        return matchesSearch && matchesTags;
    });

    // Get all unique tags for filter
    const allTags = Array.from(new Set(snippets.flatMap(s => s.tags))).sort();
    const filteredTags = allTags.filter(tag => tag.toLowerCase().includes(tagSearchQuery.toLowerCase()));

    if (loading) return <div className="p-4 text-center">Loading...</div>;

    return (
        <div className="container mx-auto p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Snippet Library</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage and organize your PowerShell scripts</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg transition"
                    >
                        Import Folder
                    </button>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition shadow-md"
                    >
                        {showForm ? 'Cancel' : '+ New Snippet'}
                    </button>
                </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm mb-6 flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-grow w-full">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            placeholder="Search snippets..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={() => setShowTagModal(true)}
                        className={`px-4 py-2 rounded-lg border flex items-center gap-2 transition ${selectedTags.length > 0
                            ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300'
                            : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                            }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        Filter Tags
                        {selectedTags.length > 0 && (
                            <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full ml-1">
                                {selectedTags.length}
                            </span>
                        )}
                    </button>

                    {selectedTags.length > 0 && (
                        <button
                            onClick={() => setSelectedTags([])}
                            className="text-sm text-red-500 hover:text-red-700 hover:underline px-2"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Active Filter Pills */}
                {selectedTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                        <span className="text-sm text-gray-500 dark:text-gray-400 self-center mr-2">Filters:</span>
                        {selectedTags.map(tag => (
                            <span
                                key={tag}
                                className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-xs font-medium"
                            >
                                #{tag}
                                <button
                                    onClick={() => toggleTagFilter(tag)}
                                    className="hover:text-blue-900 dark:hover:text-blue-100 ml-1 focus:outline-none"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Snippet Form */}
            {showForm && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <input
                            placeholder="Snippet Name"
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                        <input
                            placeholder="Description"
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                        />
                        <select
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            value={formData.category}
                            onChange={e => setFormData({ ...formData, category: e.target.value })}
                        >
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <textarea
                            placeholder="PowerShell Content"
                            className="w-full p-2 border rounded h-32 font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            value={formData.content}
                            onChange={e => setFormData({ ...formData, content: e.target.value })}
                            required
                        />
                        <input
                            placeholder="Tags (comma separated)"
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            value={formData.tags}
                            onChange={e => setFormData({ ...formData, tags: e.target.value })}
                        />
                        <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded">Save</button>
                    </form>
                </div>
            )}

            {/* Snippet Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSnippets.map(snippet => (
                    <div key={snippet.id} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-100 dark:border-gray-700 flex flex-col hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <h3
                                onClick={() => openModal(snippet)}
                                className="font-bold text-lg text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                                {snippet.name}
                            </h3>
                            <span className="text-xs bg-purple-100 dark:bg-purple-900/30 px-2 py-1 rounded text-purple-600 dark:text-purple-300 mr-2">
                                {snippet.category || 'General'}
                            </span>
                            <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                                {snippet.source || 'Manual'}
                            </span>
                        </div>

                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 flex-grow line-clamp-2">
                            {snippet.description || 'No description'}
                        </p>

                        <div className="relative group bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono mb-4 overflow-hidden">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(snippet.content);
                                }}
                                className="absolute top-2 right-2 p-1 bg-gray-700 hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy full code"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </button>
                            <pre className="overflow-x-auto custom-scrollbar">{snippet.content.substring(0, 150)}{snippet.content.length > 150 ? '...' : ''}</pre>
                        </div>

                        <div className="flex justify-between items-center mt-auto">
                            <div className="flex gap-2 flex-wrap">
                                {snippet.tags.map(tag => (
                                    <span
                                        key={tag}
                                        onClick={(e) => { e.stopPropagation(); toggleTagFilter(tag); }}
                                        className={`text-xs cursor-pointer hover:underline ${selectedTags.includes(tag) ? 'font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-1 rounded' : 'text-blue-600 dark:text-blue-400'}`}
                                    >
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                            <button
                                onClick={() => handleDelete(snippet.id)}
                                className="text-red-500 hover:text-red-700 text-sm"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Empty State */}
            {filteredSnippets.length === 0 && !loading && (
                <div className="col-span-full text-center py-12 text-gray-500">
                    No snippets found. Create one or analyze a folder.
                </div>
            )}

            {/* Detail Modal */}
            {selectedSnippet && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedSnippet(null)}>
                    <div
                        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start">
                            <div className="flex-1">
                                {isEditing ? (
                                    <input
                                        className="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-blue-500 focus:outline-none w-full"
                                        value={editData.name}
                                        onChange={e => setEditData({ ...editData, name: e.target.value })}
                                    />
                                ) : (
                                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{selectedSnippet.name}</h2>
                                )}

                                <div className="flex gap-2 text-sm text-gray-500 dark:text-gray-400 mt-2">
                                    <span>{selectedSnippet.source || 'Manual'}</span>
                                    <span>•</span>
                                    <span>{selectedSnippet.category || 'General'}</span>
                                    <span>•</span>
                                    <span>{new Date(selectedSnippet.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {!isEditing ? (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="px-4 py-2 text-sm bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg hover:bg-blue-200 transition"
                                    >
                                        Edit
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleEditSubmit}
                                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                                    >
                                        Save
                                    </button>
                                )}
                                <button
                                    onClick={() => setSelectedSnippet(null)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                            {isEditing ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                                        <input
                                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            value={editData.description}
                                            onChange={e => setEditData({ ...editData, description: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                                        <select
                                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            value={editData.category}
                                            onChange={e => setEditData({ ...editData, category: e.target.value })}
                                        >
                                            {categories.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags</label>
                                        <input
                                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            value={editData.tags}
                                            onChange={e => setEditData({ ...editData, tags: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content</label>
                                        <textarea
                                            className="w-full p-2 border rounded h-64 font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            value={editData.content}
                                            onChange={e => setEditData({ ...editData, content: e.target.value })}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="text-gray-700 dark:text-gray-300 mb-6 text-lg">
                                        {selectedSnippet.description}
                                    </p>

                                    <div className="relative group">
                                        <div className="absolute top-2 right-2 flex gap-2">
                                            <button
                                                onClick={() => copyToClipboard(selectedSnippet.content)}
                                                className="p-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition shadow-sm flex items-center gap-2 text-sm"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                                Copy Code
                                            </button>
                                        </div>
                                        <pre className="bg-gray-900 text-gray-100 p-6 rounded-xl overflow-x-auto font-mono text-sm leading-relaxed border border-gray-700">
                                            {selectedSnippet.content}
                                        </pre>
                                    </div>

                                    <div className="mt-6 flex flex-wrap gap-2">
                                        {selectedSnippet.tags.map(tag => (
                                            <span key={tag} className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Tag Selection Modal */}
            {showTagModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowTagModal(false)}>
                    <div
                        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Filter Tags</h3>
                            <button onClick={() => setShowTagModal(false)} className="text-gray-500 hover:text-gray-700">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                            <input
                                placeholder="Search tags..."
                                className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={tagSearchQuery}
                                onChange={e => setTagSearchQuery(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                            <div className="flex flex-col gap-2">
                                {filteredTags.map(tag => {
                                    const isSelected = selectedTags.includes(tag);
                                    return (
                                        <label
                                            key={tag}
                                            className={`flex items-center p-2 rounded-lg cursor-pointer transition ${isSelected
                                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3 h-4 w-4"
                                                checked={isSelected}
                                                onChange={() => toggleTagFilter(tag)}
                                            />
                                            <span className="flex-1">{tag}</span>
                                        </label>
                                    );
                                })}
                                {filteredTags.length === 0 && (
                                    <p className="text-center text-gray-500 py-4">No tags found.</p>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-between">
                            <button
                                onClick={() => setSelectedTags([])}
                                className="text-red-500 hover:text-red-700 text-sm font-medium px-2"
                                disabled={selectedTags.length === 0}
                            >
                                Clear All
                            </button>
                            <button
                                onClick={() => setShowTagModal(false)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowImportModal(false)}>
                    <div
                        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Import from Folder</h3>
                            <button onClick={() => setShowImportModal(false)} className="text-gray-500 hover:text-gray-700">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 flex-col flex flex-1 overflow-hidden">
                            {!detectedSnippets.length ? (
                                <div className="space-y-4">
                                    <p className="text-gray-600 dark:text-gray-300">Enter the absolute path to a folder on the server containing <code>.ps1</code> files.</p>
                                    <div className="flex gap-2">
                                        <input
                                            className="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            placeholder="/path/to/my/scripts"
                                            value={importPath}
                                            onChange={e => setImportPath(e.target.value)}
                                        />
                                        <button
                                            onClick={handleAnalyze}
                                            disabled={analyzing || !importPath}
                                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition"
                                        >
                                            {analyzing ? 'Scanning...' : 'Scan'}
                                        </button>
                                    </div>
                                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-4 rounded-lg text-sm">
                                        Tip: The scanner detects functions (<code>function Name &#123;...&#125;</code>) and comment blocks. Files without these structures will be imported as whole file snippets.
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col h-full">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-bold text-lg dark:text-white">Found {detectedSnippets.length} Snippets</h4>
                                        <div className="text-sm">
                                            <button onClick={() => setSnippetsToImport(detectedSnippets.map(s => s._tempId))} className="text-blue-600 hover:underline mr-4">Select All</button>
                                            <button onClick={() => setSnippetsToImport([])} className="text-gray-600 hover:underline">Deselect All</button>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar border rounded dark:border-gray-700">
                                        {detectedSnippets.map((snippet) => (
                                            <div
                                                key={snippet._tempId}
                                                className={`p-4 border-b last:border-0 dark:border-gray-700 flex gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition ${snippetsToImport.includes(snippet._tempId) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                                                onClick={() => toggleImportSelection(snippet._tempId)}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={snippetsToImport.includes(snippet._tempId)}
                                                    onChange={() => { }}
                                                    className="mt-1 h-4 w-4 text-blue-600 rounded"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between">
                                                        <h5 className="font-bold text-gray-900 dark:text-white truncate">{snippet.name}</h5>
                                                        <span className="text-xs bg-gray-100 dark:bg-gray-600 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 ml-2 whitespace-nowrap">{snippet.tags.length} tags</span>
                                                    </div>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{snippet.description || 'No description'}</p>
                                                    <div className="text-xs font-mono text-gray-400 mt-2 truncate">{snippet.source}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-6 flex justify-end gap-3">
                                        <button
                                            onClick={() => { setDetectedSnippets([]); setImportPath(''); }}
                                            className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-white"
                                        >
                                            Back
                                        </button>
                                        <button
                                            onClick={handleImportSubmit}
                                            disabled={snippetsToImport.length === 0}
                                            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg transition shadow"
                                        >
                                            Import {snippetsToImport.length} Selected
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
