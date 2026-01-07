import { useState, useEffect, useMemo } from 'react';
import { getSnippets, createSnippet } from '../api/snippets';
import type { Snippet } from '../api/snippets';
import { generateScript } from '../api/generator';
import TagInput from '../components/TagInput';
import { getSettings } from '../api/settings';
import { STANDARD_CATEGORIES, SYSTEM_SETTING_CUSTOM_CATEGORIES } from '../utils/categories';

export default function Generator() {
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [selectedSnippetIds, setSelectedSnippetIds] = useState<number[]>([]);
    const [prompt, setPrompt] = useState('');
    const [generatedCode, setGeneratedCode] = useState('');
    const [tokenUsage, setTokenUsage] = useState<{ prompt_tokens: number; completion_tokens: number; total_tokens: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [categories, setCategories] = useState<string[]>(STANDARD_CATEGORIES);

    // Save Modal State
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveData, setSaveData] = useState({ name: '', description: '', tags: '', category: 'General' });
    const [saving, setSaving] = useState(false);

    // Context Filter State
    const [contextSearch, setContextSearch] = useState('');
    const [contextTags, setContextTags] = useState<string[]>([]);
    const [showContextTagModal, setShowContextTagModal] = useState(false);
    const [tagSearchQuery, setTagSearchQuery] = useState('');

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

    const toggleSnippetSelection = (id: number) => {
        setSelectedSnippetIds(prev =>
            prev.includes(id)
                ? prev.filter(i => i !== id)
                : [...prev, id]
        );
    };

    const toggleContextTagFilter = (tag: string) => {
        setContextTags(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
    };

    // Filter Logic
    const filteredSnippets = useMemo(() => {
        return snippets.filter(snippet => {
            const matchesSearch = (
                snippet.name.toLowerCase().includes(contextSearch.toLowerCase()) ||
                (snippet.description || '').toLowerCase().includes(contextSearch.toLowerCase()) ||
                snippet.content.toLowerCase().includes(contextSearch.toLowerCase())
            );
            const matchesTags = contextTags.length === 0 || contextTags.every(tag => snippet.tags.includes(tag));
            return matchesSearch && matchesTags;
        });
    }, [snippets, contextSearch, contextTags]);

    // Group by Category
    const groupedSnippets = useMemo(() => {
        const groups: { [key: string]: Snippet[] } = {};
        filteredSnippets.forEach(s => {
            const cat = s.category || 'General';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(s);
        });
        return groups;
    }, [filteredSnippets]);

    // Display Categories
    const displayCategories = useMemo(() => {
        const presentCats = Object.keys(groupedSnippets);
        const standard = STANDARD_CATEGORIES.filter(c => presentCats.includes(c));
        const custom = presentCats.filter(c => !STANDARD_CATEGORIES.includes(c)).sort();
        return [...standard, ...custom];
    }, [groupedSnippets]);

    // Get all unique tags for filter modal
    const allTags = useMemo(() => Array.from(new Set(snippets.flatMap(s => s.tags))).sort(), [snippets]);
    // Category Expansion State
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

    // Initialize expanded state when categories change
    useEffect(() => {
        setExpandedCategories(new Set(displayCategories));
    }, [displayCategories]);

    const toggleCategory = (cat: string, e: React.MouseEvent) => {
        e.preventDefault();
        const newSet = new Set(expandedCategories);
        if (newSet.has(cat)) {
            newSet.delete(cat);
        } else {
            newSet.add(cat);
        }
        setExpandedCategories(newSet);
    };

    const toggleAllCategories = () => {
        if (expandedCategories.size === displayCategories.length) {
            setExpandedCategories(new Set());
        } else {
            setExpandedCategories(new Set(displayCategories));
        }
    };

    const handleCategorySelect = (cat: string, e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        const categorySnippets = groupedSnippets[cat] || [];
        const ids = categorySnippets.map(s => s.id);
        const allSelected = ids.every(id => selectedSnippetIds.includes(id));

        if (allSelected) {
            setSelectedSnippetIds(prev => prev.filter(id => !ids.includes(id)));
        } else {
            setSelectedSnippetIds(prev => [...prev, ...ids.filter(id => !prev.includes(id))]);
        }
    };

    const filteredTags = allTags.filter(tag => tag.toLowerCase().includes(tagSearchQuery.toLowerCase()));

    const handleGenerate = async () => {
        if (!prompt) return;
        setGenerating(true);
        setGeneratedCode(''); // Clear previous
        setTokenUsage(null);
        try {
            const response = await generateScript({
                prompt,
                snippet_ids: selectedSnippetIds
            });
            setGeneratedCode(response.content);
            if (response.usage) {
                setTokenUsage(response.usage);
            }
        } catch (error) {
            console.error("Generation failed", error);
            alert("Failed to generate script. Please check backend connection and API keys.");
        } finally {
            setGenerating(false);
        }
    };

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(generatedCode);
            alert("Code copied!");
        } catch (err) {
            console.error('Failed to copy!', err);
        }
    };

    const openSaveModal = () => {
        setSaveData({
            name: 'Generated Script',
            description: `Generated from prompt: ${prompt.substring(0, 50)}...`,
            tags: 'generated, ai',
            category: 'General'
        });
        setShowSaveModal(true);
    };

    const handleSaveToLibrary = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await createSnippet({
                name: saveData.name,
                description: saveData.description,
                content: generatedCode,
                tags: saveData.tags.split(',').map(t => t.trim()).filter(Boolean),
                category: saveData.category || 'General',
                source: 'AI Generator'
            });
            alert("Saved to Library!");
            setShowSaveModal(false);
            loadData(); // Refresh context list
        } catch (error) {
            console.error("Failed to save snippet", error);
            alert("Failed to save snippet.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-4 text-center">Loading...</div>;

    return (
        <div className="container mx-auto p-6 h-[calc(100vh-4rem)] flex flex-col">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">AI Script Generator</h1>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden">
                {/* Left Panel: Configuration & Context */}
                <div className="lg:w-1/3 flex flex-col gap-4 overflow-hidden">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col flex-1 overflow-hidden">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h2 className="font-bold text-lg text-gray-800 dark:text-gray-200">1. Select Context</h2>
                                <p className="text-sm text-gray-500">Choose snippets for context.</p>
                            </div>
                            <button
                                onClick={toggleAllCategories}
                                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                                {expandedCategories.size === displayCategories.length ? 'Collapse All' : 'Expand All'}
                            </button>
                        </div>

                        <div className="flex flex-col gap-2 mb-4">
                            <input
                                placeholder="Search snippets..."
                                className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                value={contextSearch}
                                onChange={e => setContextSearch(e.target.value)}
                            />
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setShowContextTagModal(true)}
                                    className={`px-3 py-1.5 rounded text-xs border flex items-center gap-1 transition-colors ${contextTags.length > 0
                                        ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300'
                                        : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-100'
                                        }`}
                                >
                                    <span>Filter Tags</span>
                                    {contextTags.length > 0 && (
                                        <span className="bg-blue-600 text-white px-1.5 rounded-full text-[10px]">
                                            {contextTags.length}
                                        </span>
                                    )}
                                </button>
                                {contextTags.length > 0 && (
                                    <button
                                        onClick={() => setContextTags([])}
                                        className="text-xs text-red-500 hover:underline"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar border rounded-lg dark:border-gray-700">
                            {displayCategories.length === 0 ? (
                                <div className="p-4 text-center text-gray-400 text-sm">No snippets found.</div>
                            ) : (
                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {displayCategories.map(cat => {
                                        const catSnippets = groupedSnippets[cat] || [];
                                        const allCatSelected = catSnippets.length > 0 && catSnippets.every(s => selectedSnippetIds.includes(s.id));
                                        const isExpanded = expandedCategories.has(cat);

                                        return (
                                            <div key={cat} className="group">
                                                <div
                                                    className="p-2 bg-gray-50 dark:bg-gray-700/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition flex items-center gap-2 select-none sticky top-0 z-10"
                                                    onClick={(e) => toggleCategory(cat, e)}
                                                >
                                                    <span className={`transform transition-transform text-[10px] ${isExpanded ? 'rotate-90' : ''}`}>▶</span>

                                                    {/* Category Select All Checkbox */}
                                                    <input
                                                        type="checkbox"
                                                        checked={allCatSelected}
                                                        onChange={(e) => handleCategorySelect(cat, e)}
                                                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        onClick={(e) => e.stopPropagation()}
                                                    />

                                                    <span className="font-bold text-xs text-gray-700 dark:text-gray-300 flex-1">{cat}</span>

                                                    <span className="text-[10px] bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full text-gray-600 dark:text-gray-400">
                                                        {catSnippets.length}
                                                    </span>
                                                </div>

                                                {/* Use conditional rendering instead of details/summary for full control */}
                                                {isExpanded && (
                                                    <div className="pl-2">
                                                        {catSnippets.map(snippet => (
                                                            <div
                                                                key={snippet.id}
                                                                className={`p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition border-b dark:border-gray-700 last:border-0 ${selectedSnippetIds.includes(snippet.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                                                                onClick={() => toggleSnippetSelection(snippet.id)}
                                                            >
                                                                <div className="flex items-start gap-3">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedSnippetIds.includes(snippet.id)}
                                                                        onChange={() => { }}
                                                                        className="mt-1 h-4 w-4 text-blue-600 rounded shrink-0"
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <div className="font-medium text-sm text-gray-900 dark:text-white truncate" title={snippet.name}>{snippet.name}</div>
                                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                                            {snippet.tags.slice(0, 3).map(tag => (
                                                                                <span key={tag} className="text-[10px] bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">#{tag}</span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="mt-2 text-right text-xs text-gray-500">
                            {selectedSnippetIds.length} selected
                        </div>
                    </div>
                </div>

                {/* Right Panel: Prompt & output */}
                <div className="lg:w-2/3 flex flex-col gap-6 overflow-hidden">
                    {/* Input Area */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 shrink-0">
                        <h2 className="font-bold text-lg mb-2 text-gray-800 dark:text-gray-200">2. Request Script</h2>
                        <textarea
                            className="w-full p-3 border rounded-lg h-32 resize-none focus:ring-2 focus:ring-blue-500 outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            placeholder="Describe what you want the script to do. E.g., 'Create a user onboarding script that generates a password and logs the action using my Log-Message function.'"
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                        />
                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={handleGenerate}
                                disabled={generating || !prompt}
                                className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2 shadow-md"
                            >
                                {generating ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Generating...
                                    </>
                                ) : (
                                    'Generate Script'
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Output Area */}
                    <div className="bg-gray-900 rounded-xl shadow-lg border border-gray-700 flex flex-col flex-1 overflow-hidden relative">
                        <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex justify-between items-center">
                            <span className="text-gray-300 text-sm font-mono">Output.ps1</span>
                            {generatedCode && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={openSaveModal}
                                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition flex items-center gap-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                        </svg>
                                        Save to Library
                                    </button>
                                    <button
                                        onClick={copyToClipboard}
                                        className="text-xs text-gray-400 hover:text-white flex items-center gap-1 px-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        Copy
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 p-4 overflow-auto custom-scrollbar relative">
                            {generatedCode ? (
                                <pre className="font-mono text-sm text-green-400 whitespace-pre-wrap pb-8">{generatedCode}</pre>
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-600 italic">
                                    Generated script will appear here...
                                </div>
                            )}
                            {tokenUsage && (
                                <div className="absolute bottom-2 right-4 text-xs text-gray-500 flex gap-4 bg-gray-900/80 p-1 rounded backdrop-blur-sm">
                                    <span>Prompt: {tokenUsage.prompt_tokens}</span>
                                    <span>Completion: {tokenUsage.completion_tokens}</span>
                                    <span className="font-bold text-gray-400">Total: {tokenUsage.total_tokens}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Save Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowSaveModal(false)}>
                    <div
                        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg"
                        onClick={e => e.stopPropagation()}
                    >
                        <form onSubmit={handleSaveToLibrary}>
                            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Save Snippet</h3>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                                    <input
                                        className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        value={saveData.name}
                                        onChange={e => setSaveData({ ...saveData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                                    <input
                                        className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        value={saveData.description}
                                        onChange={e => setSaveData({ ...saveData, description: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                                    <select
                                        className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        value={saveData.category}
                                        onChange={e => setSaveData({ ...saveData, category: e.target.value })}
                                    >
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags</label>
                                    <TagInput
                                        value={saveData.tags}
                                        onChange={(val) => setSaveData({ ...saveData, tags: val })}
                                    />
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowSaveModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition disabled:bg-blue-300"
                                >
                                    {saving ? 'Saving...' : 'Save Snippet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Context Tag Filter Modal */}
            {showContextTagModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowContextTagModal(false)}>
                    <div
                        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm max-h-[60vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                            <h3 className="font-bold text-gray-900 dark:text-white">Filter Tags</h3>
                            <button onClick={() => setShowContextTagModal(false)} className="text-gray-500">✕</button>
                        </div>
                        <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                            <input
                                placeholder="Search tags..."
                                className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                value={tagSearchQuery}
                                onChange={e => setTagSearchQuery(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="p-2 flex-1 overflow-y-auto custom-scrollbar">
                            {filteredTags.map(tag => (
                                <label key={tag} className="flex items-center p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={contextTags.includes(tag)}
                                        onChange={() => toggleContextTagFilter(tag)}
                                        className="rounded border-gray-300 text-blue-600 mr-2"
                                    />
                                    <span className="text-sm dark:text-gray-300">{tag}</span>
                                </label>
                            ))}
                        </div>
                        <div className="p-3 border-t border-gray-100 dark:border-gray-700 flex justify-end">
                            <button
                                onClick={() => setShowContextTagModal(false)}
                                className="bg-blue-600 text-white px-3 py-1 text-sm rounded"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
