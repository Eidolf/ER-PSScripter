import React, { useState } from 'react';
import { STANDARD_CATEGORIES } from '../utils/categories';

interface SaveSnippetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: { name: string; description: string; tags: string[]; category: string }) => void;
    initialData?: { name: string; description: string; tags: string[]; category: string };
}

const SaveSnippetModal: React.FC<SaveSnippetModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [tags, setTags] = useState(initialData?.tags?.join(', ') || '');
    const [category, setCategory] = useState(initialData?.category || 'General');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            name,
            description,
            tags: tags.split(',').map(t => t.trim()).filter(Boolean),
            category
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Save Snippet</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✖</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Snippet Name</label>
                        <input
                            type="text"
                            required
                            className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            placeholder="MyScript.ps1"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                        <textarea
                            className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            rows={3}
                            placeholder="What does this script do?"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                        <select
                            className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                        >
                            {STANDARD_CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags (comma separated)</label>
                        <input
                            type="text"
                            className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            placeholder="powershell, automation, admin"
                            value={tags}
                            onChange={e => setTags(e.target.value)}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Save Snippet</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SaveSnippetModal;
