import React, { useState } from 'react';

interface AiEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (prompt: string) => void;
    isLoading: boolean;
}

const AiEditModal: React.FC<AiEditModalProps> = ({ isOpen, onClose, onSubmit, isLoading }) => {
    const [prompt, setPrompt] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
                <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    AI Assistant
                </h2>

                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Describe how you want to modify the current script.
                </p>

                <textarea
                    className="w-full h-32 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-gray-800 dark:text-gray-200 resize-none"
                    placeholder="e.g. Add error handling, refactor into functions, or add comments..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    autoFocus
                />

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSubmit(prompt)}
                        disabled={isLoading || !prompt.trim()}
                        className={`px-4 py-2 rounded-lg text-white transition flex items-center gap-2 ${isLoading || !prompt.trim()
                                ? 'bg-purple-400 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-700 shadow-lg hover:shadow-purple-500/25'
                            }`}
                    >
                        {isLoading ? 'Processing...' : 'Apply Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AiEditModal;
