import React from 'react';

interface KnowledgeBaseModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const KnowledgeBaseModal: React.FC<KnowledgeBaseModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center shrink-0">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="text-2xl">📚</span> Knowledge Base
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">

                    {/* Section: Web Overlay */}
                    <section>
                        <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400 mb-4 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
                                <path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
                            </svg>
                            Web Overlay (Out-WebGridView)
                        </h3>
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-4 text-gray-700 dark:text-gray-300">
                            <p>
                                The <strong>Out-WebGridView</strong> cmdlet allows you to display PowerShell objects in a rich, interactive table window directly within your browser.
                            </p>

                            <div className="space-y-4">
                                <h4 className="font-semibold text-gray-900 dark:text-gray-200">Examples:</h4>

                                <div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Display list of processes:</p>
                                    <pre className="bg-gray-800 text-gray-100 p-3 rounded-lg text-sm overflow-x-auto">
                                        {`Get-Process | Select-Object -First 10 | Out-WebGridView`}
                                    </pre>
                                </div>

                                <div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Display multiple variables/items (comma-separated):</p>
                                    <pre className="bg-gray-800 text-gray-100 p-3 rounded-lg text-sm overflow-x-auto">
                                        {`$var1 = "Hello"
$var2 = "World"
$var1, $var2 | Out-WebGridView`}
                                    </pre>
                                </div>

                                <div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Create a custom table (Custom Columns):</p>
                                    <pre className="bg-gray-800 text-gray-100 p-3 rounded-lg text-sm overflow-x-auto">
                                        {`[PSCustomObject]@{ Name = "Server01"; Status = "Online"; IP = "192.168.1.10" },
[PSCustomObject]@{ Name = "Server02"; Status = "Offline"; IP = "192.168.1.11" } | Out-WebGridView`}
                                    </pre>
                                </div>

                                <div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Display simple text input:</p>
                                    <pre className="bg-gray-800 text-gray-100 p-3 rounded-lg text-sm overflow-x-auto">
                                        {`$input = Read-Host "Enter text"
$input | Out-WebGridView`}
                                    </pre>
                                </div>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-3 text-sm">
                                <div className="flex items-center gap-2 mb-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                                    </svg>
                                    <span className="font-medium text-blue-800 dark:text-blue-300">Tip for Scalar Values</span>
                                </div>
                                <p className="mt-1">
                                    If you pipe a simple string, number, or date (e.g., from <code>Read-Host</code>), the overlay will automatically wrap it in an object so it can be displayed in the grid under a "Value" column.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Section: Authentication */}
                    <section>
                        <h3 className="text-xl font-semibold text-green-600 dark:text-green-400 mb-4 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                            Authentication
                        </h3>
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-4 text-gray-700 dark:text-gray-300">
                            <p>
                                Since the terminal runs in a headless environment, standard browser popups for login will not work. You must use <strong>Device Code Authentication</strong>.
                            </p>

                            <div className="space-y-2">
                                <h4 className="font-semibold text-gray-900 dark:text-gray-200">Examples:</h4>
                                <pre className="bg-gray-800 text-gray-100 p-3 rounded-lg text-sm overflow-x-auto">
                                    {`# Exchange Online
Connect-ExchangeOnline -Device

# Microsoft Graph
Connect-MgGraph -UseDeviceAuthentication`}
                                </pre>
                            </div>

                            <p className="text-sm">
                                A code will appear in the terminal. Open <a href="https://microsoft.com/devicelogin" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">microsoft.com/devicelogin</a> on your local machine and enter the code to authenticate.
                            </p>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors font-medium"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default KnowledgeBaseModal;
