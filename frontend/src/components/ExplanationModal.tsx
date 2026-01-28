import React from 'react';

interface ExplanationModalProps {
    isOpen: boolean;
    onClose: () => void;
    explanation: string;
}

const ExplanationModal: React.FC<ExplanationModalProps> = ({ isOpen, onClose, explanation }) => {
    if (!isOpen || !explanation) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-blue-50 dark:bg-gray-900 rounded-t-xl">
                    <h3 className="font-bold text-gray-800 dark:text-blue-400 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        AI Explanation
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-white">✕</button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                    {explanation}
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
                    >
                        OK, Got it that
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExplanationModal;
