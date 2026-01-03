import { useState, useEffect } from 'react';
import { getSnippets, createSnippet, deleteSnippet } from '../api/snippets';
import type { Snippet } from '../api/snippets';

export default function SnippetLibrary() {
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', content: '', description: '', tags: '' });

    useEffect(() => {
        loadSnippets();
    }, []);

    const loadSnippets = async () => {
        try {
            const data = await getSnippets();
            setSnippets(data);
        } catch (error) {
            console.error("Failed to load snippets", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (confirm("Are you sure?")) {
            await deleteSnippet(id);
            loadSnippets();
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createSnippet({
                ...formData,
                tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean)
            });
            setShowForm(false);
            setFormData({ name: '', content: '', description: '', tags: '' });
            loadSnippets();
        } catch (error) {
            console.error("Failed to save snippet", error);
            alert("Failed to save snippet. Please check backend connection.");
        }
    }

    const [selectedSnippet, setSelectedSnippet] = useState<Snippet | null>(null);

    // ... existing loadSnippets ...

    // Helper to copy text
    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            alert("Code copied to clipboard!");
        } catch (err) {
            console.error('Failed to copy!', err);
        }
    };

    // ... existing handleDelete, handleSubmit ...

    if (loading) return <div className="p-4 text-center">Loading...</div>;

    return (
        <div className="container mx-auto p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Snippet Library</h1>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
                >
                    {showForm ? 'Cancel' : '+ New Snippet'}
                </button>
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
                {snippets.map(snippet => (
                    <div key={snippet.id} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-100 dark:border-gray-700 flex flex-col hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <h3
                                onClick={() => setSelectedSnippet(snippet)}
                                className="font-bold text-lg text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                                {snippet.name}
                            </h3>
                            <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                                {snippet.source || 'Manual'}
                            </span>
                        </div>

                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 flex-grow line-clamp-2">
                            {snippet.description || 'No description'}
                        </p>

                        <div className="relative group bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono mb-4 overflow-hidden">
                            {/* Copy Button Overlay */}
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
                                    <span key={tag} className="text-xs text-blue-600 dark:text-blue-400">#{tag}</span>
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
            {snippets.length === 0 && !loading && (
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
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{selectedSnippet.name}</h2>
                                <div className="flex gap-2 text-sm text-gray-500 dark:text-gray-400">
                                    <span>{selectedSnippet.source || 'Manual'}</span>
                                    <span>•</span>
                                    <span>{new Date(selectedSnippet.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedSnippet(null)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto custom-scrollbar">
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
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
