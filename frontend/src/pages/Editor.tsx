import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PowerShellEditor from '../components/PowerShellEditor';

import { getSnippet, updateSnippet, createSnippet } from '../api/snippets';
import type { Snippet } from '../api/snippets';
import { generateScript } from '../api/generator';
import SaveSnippetModal from '../components/SaveSnippetModal';
import AiEditModal from '../components/AiEditModal';
import ExplanationModal from '../components/ExplanationModal';
import TerminalComponent, { type TerminalRef } from '../components/Terminal';

const Editor: React.FC = () => {
    // const { token } = useAuth(); // Unused now
    const location = useLocation();
    const navigate = useNavigate();
    const terminalRef = useRef<TerminalRef>(null);

    // URL Params
    const searchParams = new URLSearchParams(location.search);
    const snippetId = searchParams.get('id');

    const [code, setCode] = useState<string>(`# Welcome to the PowerShell Editor
Write-Host "Hello, World!"

# Try writing some PowerShell code here
$date = Get-Date
Write-Output "Current date is: $date"
`);
    const [showTerminal, setShowTerminal] = useState(false);
    const [scriptToRun, setScriptToRun] = useState<string | undefined>(undefined);

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

    // Primary Action: Run Script (in Terminal)
    const handleRunScript = () => {
        if (!showTerminal) {
            // If terminal is closed, open it and pass script to run on mount
            setScriptToRun(code);
            setShowTerminal(true);
        } else {
            // If terminal is already open, send text directly
            if (terminalRef.current) {
                terminalRef.current.sendText(code);
            }
        }
    };

    const handleClear = () => {
        setCode('');
        setScriptToRun(undefined);
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
                        onClick={handleRunScript}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition flex items-center justify-center gap-2"
                        title="Run script in interactive terminal"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                        Run Script
                    </button>



                    <button
                        onClick={() => {
                            if (showTerminal) {
                                setShowTerminal(false);
                            } else {
                                setScriptToRun(undefined); // Just open, don't run anything
                                setShowTerminal(true);
                            }
                        }}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 ${showTerminal ? 'bg-orange-600 hover:bg-orange-700' : 'bg-orange-600 hover:bg-orange-700'} text-white`}
                        title="Show/Hide Terminal"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                        Terminal
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className={`flex-1 flex flex-col items-stretch gap-4 ${showTerminal ? 'h-3/5' : 'h-full'}`}>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-1 flex-1 overflow-hidden relative" style={{ minHeight: '300px' }}>
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

                {showTerminal && (
                    <div className="bg-gray-900 rounded-xl shadow-lg h-2/5 overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center px-4 py-2 border-b border-gray-700 bg-gray-800">
                            <span className="text-gray-300 text-sm font-mono flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                                </svg>
                                Interactive Terminal
                            </span>
                            <button
                                onClick={() => setShowTerminal(false)}
                                className="text-gray-400 hover:text-white transition"
                                title="Close Terminal"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden bg-black rounded-b-xl p-0 relative">
                            <TerminalComponent
                                ref={terminalRef}
                                onSessionEnd={() => console.log("Session ended")}
                                executeOnMount={scriptToRun}
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
