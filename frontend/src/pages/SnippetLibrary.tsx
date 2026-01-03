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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {snippets.map(snippet => (
                    <div key={snippet.id} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow border border-gray-100 dark:border-gray-700 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">{snippet.name}</h3>
                            <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                                {snippet.source || 'Manual'}
                            </span>
                        </div>

                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 flex-grow">
                            {snippet.description || 'No description'}
                        </p>

                        <div className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono mb-4 overflow-x-auto">
                            <pre>{snippet.content.substring(0, 100)}...</pre>
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

                {snippets.length === 0 && !loading && (
                    <div className="col-span-full text-center py-12 text-gray-500">
                        No snippets found. Create one or analyze a folder.
                    </div>
                )}
            </div>
        </div>
    );
}
