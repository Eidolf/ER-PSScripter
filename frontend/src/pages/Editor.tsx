import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PowerShellEditor from '../components/PowerShellEditor';
import { useAuth } from '../context/AuthContext';
import { getSnippet, updateSnippet, createSnippet } from '../api/snippets';
import type { Snippet } from '../api/snippets';
import { generateScript } from '../api/generator';
import SaveSnippetModal from '../components/SaveSnippetModal';
import AiEditModal from '../components/AiEditModal';
import ExplanationModal from '../components/ExplanationModal';
import TerminalComponent from '../components/Terminal';

interface ExecutionResult {
    stdout: string;
    stderr: string;
    exit_code: number; // Changed from 'int' to 'number' for TypeScript
}

const Editor: React.FC = () => {
    const { token } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // URL Params
    const searchParams = new URLSearchParams(location.search);
    const snippetId = searchParams.get('id');

    const [code, setCode] = useState<string>(`# Welcome to the PowerShell Editor
Write-Host "Hello, World!"

# Try writing some PowerShell code here
$date = Get-Date
Write-Output "Current date is: $date"
`);
    const [output, setOutput] = useState<ExecutionResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showOutput, setShowOutput] = useState(false);
    const [showTerminal, setShowTerminal] = useState(false);

    // Snippet State
    const [currentSnippet, setCurrentSnippet] = useState<Snippet | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);

    useEffect(() => {
        if (snippetId) {
            loadSnippet(parseInt(snippetId));
        } else {
            // Check for passed state (e.g. from Generator)
            const state = location.state as { code?: string } | null;
            if (state?.code) {
                setCode(state.code);
            }
        }
    }, [snippetId, location.state]);

    const loadSnippet = async (id: number) => {
        try {
            const snippet = await getSnippet(id);
            setCurrentSnippet(snippet);
            setCode(snippet.content);
        } catch (error) {
            console.error("Failed to load snippet", error);
        }
    };

    const handleCodeChange = (value: string | undefined) => {
        setCode(value || '');
    };

    const handleRun = async () => {
        setIsLoading(true);
        setShowOutput(true);
        setOutput(null);

        try {
            // In a real app, this should go through a proper API client service
            // but for this task we can fetch directly or use the axios instance if imported
            const response = await fetch('/api/v1/execute/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ script: code })
            });

            if (!response.ok) {
                throw new Error(`Error: ${response.statusText}`);
            }

            const result = await response.json();
            setOutput(result);
        } catch (error) {
            setOutput({
                stdout: '',
                stderr: error instanceof Error ? error.message : "Unknown error occurred",
                exit_code: 1
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClear = () => {
        setCode('');
        setOutput(null);
        setShowOutput(false);
        setCurrentSnippet(null);
        navigate('/editor');
    };

    const handleSave = async () => {
        if (currentSnippet) {
            // Update existing
            setIsSaving(true);
            try {
                const updated = await updateSnippet(currentSnippet.id, {
                    ...currentSnippet,
                    content: code
                });
                setCurrentSnippet(updated);
                alert("Saved successfully!");
            } catch (error) {
                console.error("Failed to save", error);
                alert("Failed to save changes.");
            } finally {
                setIsSaving(false);
            }
        } else {
            // Open modal to create new
            setShowSaveModal(true);
        }
    };

    const handleSaveNew = (data: { name: string; description: string; tags: string[]; category: string }) => {
        createSnippet({
            ...data,
            content: code
        }).then(snippet => {
            setCurrentSnippet(snippet);
            navigate(`/editor?id=${snippet.id}`);
            alert("Snippet created!");
        }).catch(err => {
            console.error("Failed to create snippet", err);
            alert("Failed to create snippet.");
        });
    };

    // AI Edit Logic
    const [showAiModal, setShowAiModal] = useState(false);
    const [isAiProcessing, setIsAiProcessing] = useState(false);

    // Explanation Modal State
    const [explanation, setExplanation] = useState('');
    const [showExplanationModal, setShowExplanationModal] = useState(false);

    // RAG Info State
    const [ragInfo, setRagInfo] = useState<{ count: number; snippets: string[] } | null>(null);

    const handleAiSubmit = async (instruction: string) => {
        setIsAiProcessing(true);
        try {
            const prompt = `Original Code:\n\`\`\`powershell\n${code}\n\`\`\`\n\nInstruction:\n${instruction}`;
            const response = await generateScript({
                prompt,
                snippet_ids: []
            });
            setCode(response.content);
            setShowAiModal(false);

            if (response.explanation) {
                setExplanation(response.explanation);
                setShowExplanationModal(true);
            }

            if (response.rag_info) {
                setRagInfo(response.rag_info);
            } else {
                setRagInfo(null);
            }
        } catch (error) {
            console.error("AI Edit failed", error);
            alert("Failed to process with AI.");
        } finally {
            setIsAiProcessing(false);
        }
    };

    return (
        <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 h-[calc(100vh-80px)] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 sm:gap-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">PowerShell Editor</h1>
                <div className="flex gap-3 w-full sm:w-auto">
                    <button
                        onClick={() => setShowAiModal(true)}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        AI Edit
                    </button>
                    <button
                        onClick={handleClear}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition text-center"
                    >
                        Clear
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition flex items-center justify-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        {isSaving ? 'Saving...' : (currentSnippet ? 'Save' : 'Save as Is')}
                    </button>

                    {currentSnippet && (
                        <button
                            onClick={() => setShowSaveModal(true)}
                            className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-700 text-white transition flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                            </svg>
                            Save As
                        </button>
                    )}
                    <button
                        onClick={handleRun}
                        disabled={isLoading}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-white transition flex items-center justify-center gap-2 ${isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                    >
                        {isLoading ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                            </svg>
                        )}
                        {isLoading ? 'Running...' : 'Run Script'}
                    </button>
                    <button
                        onClick={() => {
                            setShowOutput(false);
                            setShowTerminal(true);
                        }}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition flex items-center justify-center gap-2"
                        title="Start interactive session (supports Read-Host)"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                        </svg>
                        Terminal
                    </button>
                </div>
            </div>

            <div className={`flex-1 flex flex-col ${showOutput ? 'h-3/5' : 'h-full'} gap-4`}>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-1 flex-1 overflow-hidden relative">
                    <PowerShellEditor
                        code={code}
                        onChange={handleCodeChange}
                        height="100%"
                    />
                    {ragInfo && ragInfo.count > 0 && (
                        <div className="absolute bottom-2 left-4 text-xs bg-green-900/80 text-green-200 p-1.5 rounded backdrop-blur-sm border border-green-700/50 flex items-center gap-2 group cursor-help z-10">
                            <span className="flex items-center gap-1 font-bold">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                </svg>
                                Used {ragInfo.count} learned snippets
                            </span>

                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full left-0 mb-2 w-max max-w-xs bg-gray-800 text-white text-xs rounded p-2 shadow-xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all pointer-events-none border border-gray-600">
                                <div className="font-bold mb-1 border-b border-gray-600 pb-1">Auto-Included Context:</div>
                                <ul className="list-disc pl-4 space-y-0.5">
                                    {ragInfo.snippets.map((name, i) => (
                                        <li key={i}>{name}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                {showOutput && (
                    <div className="bg-gray-900 rounded-xl shadow-lg p-4 h-2/5 overflow-auto flex flex-col">
                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-700">
                            <span className="text-gray-400 text-sm font-mono">Console Output</span>
                            <button
                                onClick={() => setShowOutput(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <pre className="font-mono text-sm text-gray-300 whitespace-pre-wrap flex-1">
                            {output ? (
                                <>
                                    {output.stdout && <span className="text-green-400">{output.stdout}</span>}
                                    {output.stderr && <span className="text-red-400">{output.stderr}</span>}
                                    {!output.stdout && !output.stderr && <span className="text-gray-500 italic">No output</span>}
                                    <div className="mt-2 text-xs text-gray-600">
                                        Exit Code: {output.exit_code}
                                    </div>
                                </>
                            ) : (
                                <span className="text-gray-500">Waiting for output...</span>
                            )}
                        </pre>
                    </div>
                )}

                {showTerminal && (
                    <div className="bg-gray-900 rounded-xl shadow-lg h-2/5 overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-700">
                            <span className="text-gray-400 text-sm font-mono">Interactive Terminal</span>
                            <button
                                onClick={() => setShowTerminal(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden bg-black rounded p-0">
                            <TerminalComponent
                                initialInput={code}
                                onSessionEnd={() => console.log("Session ended")}
                            />
                        </div>
                    </div>
                )}
            </div>
            {showSaveModal && (
                <SaveSnippetModal
                    isOpen={showSaveModal}
                    onClose={() => setShowSaveModal(false)}
                    onSave={handleSaveNew}
                    initialData={currentSnippet ? {
                        name: currentSnippet.name + ' (Copy)',
                        description: currentSnippet.description || '',
                        tags: currentSnippet.tags,
                        category: currentSnippet.category || 'General'
                    } : undefined}
                />
            )}
            <AiEditModal
                isOpen={showAiModal}
                onClose={() => setShowAiModal(false)}
                onSubmit={handleAiSubmit}
                isLoading={isAiProcessing}
            />
            <ExplanationModal
                isOpen={showExplanationModal}
                onClose={() => setShowExplanationModal(false)}
                explanation={explanation}
            />
        </div>
    );
};

export default Editor;
