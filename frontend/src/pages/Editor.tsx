import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PowerShellEditor from '../components/PowerShellEditor';
import { DiffEditor } from '@monaco-editor/react';

import { getSnippet, updateSnippet, createSnippet, getSnippetVersions, deleteSnippetVersion } from '../api/snippets';
import type { Snippet, SnippetVersion } from '../api/snippets';
import { generateScript } from '../api/generator';
import SaveSnippetModal from '../components/SaveSnippetModal';
import AiEditModal from '../components/AiEditModal';
import ExplanationModal from '../components/ExplanationModal';
import TerminalComponent, { type TerminalRef } from '../components/Terminal';

interface VersionNode extends SnippetVersion {
    children: VersionNode[];
}

const buildVersionTree = (versions: SnippetVersion[]): VersionNode[] => {
    const map = new Map<number, VersionNode>();
    const roots: VersionNode[] = [];

    versions.forEach(v => {
        map.set(v.id, { ...v, children: [] });
    });

    versions.forEach(v => {
        const node = map.get(v.id)!;
        if (v.parent_version_id && map.has(v.parent_version_id)) {
            map.get(v.parent_version_id)!.children.push(node);
        } else {
            roots.push(node);
        }
    });

    return roots;
};

const VersionTreeItem: React.FC<{
    node: VersionNode;
    level: number;
    loadedVersionId: number | null;
    onLoad: (node: VersionNode) => void;
    onCompare: (node: VersionNode) => void;
    onDelete: (node: VersionNode) => void;
}> = ({ node, level, loadedVersionId, onLoad, onCompare, onDelete }) => {
    return (
        <div className="flex flex-col">
            <div 
                className={`group flex items-center justify-between p-2 rounded-lg my-1 border transition cursor-default ${
                    loadedVersionId === node.id 
                        ? 'bg-blue-50/85 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 shadow-sm' 
                        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
                style={{ marginLeft: `${level * 16}px` }}
            >
                <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-semibold text-xs text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                        <span className="px-1.5 py-0.2 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400 font-mono text-[10px]">
                            v{node.version}
                        </span>
                        <span className="truncate max-w-[120px]" title={node.name}>{node.name}</span>
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                        {new Date(node.created_at).toLocaleString()}
                    </span>
                </div>
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => onLoad(node)}
                        className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 transition"
                        title="Load this version"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                    </button>
                    <button
                        onClick={() => onCompare(node)}
                        className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900 text-green-600 dark:text-green-400 transition"
                        title="Compare with this version"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                    </button>
                    <button
                        onClick={() => onDelete(node)}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400 transition"
                        title="Delete this version"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
            {node.children.map(child => (
                <VersionTreeItem
                    key={child.id}
                    node={child}
                    level={level + 1}
                    loadedVersionId={loadedVersionId}
                    onLoad={onLoad}
                    onCompare={onCompare}
                    onDelete={onDelete}
                />
            ))}
        </div>
    );
};

const Editor: React.FC = () => {
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

    // Versioning State
    const [versions, setVersions] = useState<SnippetVersion[]>([]);
    const [showVersionsPanel, setShowVersionsPanel] = useState(false);
    const [loadedVersionId, setLoadedVersionId] = useState<number | null>(null);
    const [compareVersionId, setCompareVersionId] = useState<number | null>(null);
    const [isDiffMode, setIsDiffMode] = useState(false);

    useEffect(() => {
        if (snippetId) {
            loadSnippet(parseInt(snippetId));
        } else {
            // Check for passed state (e.g. from Generator)
            const state = location.state as { code?: string } | null;
            if (state?.code) {
                setCode(state.code);
            }
            // Clear versioning state for unsaved scripts
            setCurrentSnippet(null);
            setVersions([]);
            setLoadedVersionId(null);
            setCompareVersionId(null);
            setIsDiffMode(false);
        }
    }, [snippetId, location.state]);

    const loadSnippet = async (id: number) => {
        try {
            const snippet = await getSnippet(id);
            setCurrentSnippet(snippet);
            setCode(snippet.content);
            
            // Fetch versions
            const fetchedVersions = await getSnippetVersions(id);
            setVersions(fetchedVersions);
            
            if (fetchedVersions.length > 0) {
                // Find latest version or set default to latest in sequence
                const latest = fetchedVersions[fetchedVersions.length - 1];
                setLoadedVersionId(latest.id);
            } else {
                setLoadedVersionId(null);
            }
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
            setScriptToRun(code);
            setShowTerminal(true);
        } else {
            if (terminalRef.current) {
                terminalRef.current.sendText(code);
            }
        }
    };

    const handleClear = () => {
        setCode('');
        setScriptToRun(undefined);
        setCurrentSnippet(null);
        setVersions([]);
        setLoadedVersionId(null);
        setCompareVersionId(null);
        setIsDiffMode(false);
        navigate('/editor');
    };

    const handleSave = async () => {
        if (currentSnippet) {
            setIsSaving(true);
            try {
                const updated = await updateSnippet(currentSnippet.id, {
                    ...currentSnippet,
                    content: code,
                    parent_version_id: loadedVersionId || undefined
                });
                setCurrentSnippet(updated);
                
                // Refresh versions
                const fetchedVersions = await getSnippetVersions(updated.id);
                setVersions(fetchedVersions);
                
                if (fetchedVersions.length > 0) {
                    const latest = fetchedVersions[fetchedVersions.length - 1];
                    setLoadedVersionId(latest.id);
                }
                
                alert("Saved successfully!");
            } catch (error) {
                console.error("Failed to save", error);
                alert("Failed to save changes.");
            } finally {
                setIsSaving(false);
            }
        } else {
            setShowSaveModal(true);
        }
    };

    const handleSaveNew = (data: { name: string; description: string; tags: string[]; category: string }) => {
        createSnippet({
            ...data,
            content: code
        }).then(async (snippet) => {
            setCurrentSnippet(snippet);
            
            // Refresh versions
            const fetchedVersions = await getSnippetVersions(snippet.id);
            setVersions(fetchedVersions);
            if (fetchedVersions.length > 0) {
                setLoadedVersionId(fetchedVersions[0].id);
            }
            
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

    const compareVersion = versions.find(v => v.id === compareVersionId);
    const compareCode = compareVersion ? compareVersion.content : '';

    return (
        <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 h-[calc(100vh-80px)] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 sm:gap-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">PowerShell Editor</h1>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => setShowAiModal(true)}
                        className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20 text-sm font-semibold"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        AI Edit
                    </button>
                    <button
                        onClick={handleClear}
                        className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition text-sm font-semibold"
                    >
                        Clear
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition flex items-center justify-center gap-2 text-sm font-semibold"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        {isSaving ? 'Saving...' : (currentSnippet ? 'Save' : 'Save as Is')}
                    </button>

                    {currentSnippet && (
                        <>
                            <button
                                onClick={() => setShowSaveModal(true)}
                                className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-700 text-white transition flex items-center justify-center gap-2 text-sm font-semibold"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                </svg>
                                Save As
                            </button>
                            <button
                                onClick={() => setShowVersionsPanel(!showVersionsPanel)}
                                className={`px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 text-sm font-semibold ${
                                    showVersionsPanel 
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                                }`}
                                title="Show Version History"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                History
                            </button>
                        </>
                    )}
                    <button
                        onClick={handleRunScript}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition flex items-center justify-center gap-2 text-sm font-semibold"
                        title="Run script in interactive terminal"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                        Run Script
                    </button>

                    <button
                        onClick={() => {
                            if (!showTerminal) {
                                setShowTerminal(true);
                                setTimeout(() => {
                                    if (terminalRef.current) {
                                        terminalRef.current.uploadFile('Script.ps1', code);
                                        setTimeout(() => {
                                            terminalRef.current?.runScriptFile('Script.ps1');
                                        }, 200);
                                    }
                                }, 1000);
                            } else {
                                if (terminalRef.current) {
                                    terminalRef.current.uploadFile('Script.ps1', code);
                                    setTimeout(() => {
                                        terminalRef.current?.runScriptFile('Script.ps1');
                                    }, 200);
                                }
                            }
                        }}
                        className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition flex items-center justify-center gap-2 text-sm font-semibold"
                        title="Uploads script as file and executes it"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                        </svg>
                        Run File
                    </button>

                    <button
                        onClick={() => {
                            setShowTerminal(!showTerminal);
                        }}
                        className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition flex items-center justify-center gap-2 text-sm font-semibold"
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
            <div className={`flex-1 flex flex-col md:flex-row gap-4 ${showTerminal ? 'h-3/5' : 'h-full'} overflow-hidden`}>
                <div className="flex-1 flex flex-col items-stretch gap-4 overflow-hidden min-h-0">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-1 flex-1 overflow-hidden relative" style={{ minHeight: '300px' }}>
                        {isDiffMode && compareVersionId ? (
                            <div className="flex flex-col h-full bg-white dark:bg-gray-850 rounded-lg overflow-hidden">
                                <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 text-[10px] bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 rounded font-bold font-mono uppercase">
                                            Comparison Mode
                                        </span>
                                        <span className="text-xs text-gray-600 dark:text-gray-400">
                                            Comparing current code (Right) with <strong>v{compareVersion?.version} ({compareVersion?.name})</strong> (Left)
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setIsDiffMode(false)}
                                        className="px-2.5 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition text-gray-700 dark:text-gray-200 font-semibold"
                                    >
                                        Close Diff
                                    </button>
                                </div>
                                <div className="flex-1">
                                    <DiffEditor
                                        height="100%"
                                        original={compareCode}
                                        modified={code}
                                        language="powershell"
                                        theme="vs-dark"
                                        options={{
                                            originalEditable: false,
                                            readOnly: false,
                                            minimap: { enabled: false },
                                            automaticLayout: true,
                                            fontFamily: "'Fira Code', 'Consolas', monospace",
                                            fontSize: 14,
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <PowerShellEditor
                                code={code}
                                onChange={handleCodeChange}
                                height="100%"
                            />
                        )}
                        {ragInfo && ragInfo.count > 0 && (
                            <div className="absolute bottom-2 left-4 text-xs bg-green-900/80 text-green-200 p-1.5 rounded backdrop-blur-sm border border-green-700/50 flex items-center gap-2 group cursor-help z-10">
                                <span className="flex items-center gap-1 font-bold">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                    </svg>
                                    Used {ragInfo.count} learned snippets
                                </span>

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
                        <div className="bg-gray-900 rounded-xl shadow-lg h-2/5 overflow-hidden flex flex-col min-h-[150px]">
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

                {showVersionsPanel && currentSnippet && (
                    <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 overflow-y-auto flex flex-col h-full shadow-inner animate-in slide-in-from-right duration-200">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Version History
                            </span>
                            <button
                                onClick={() => setShowVersionsPanel(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        {versions.length === 0 ? (
                            <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
                                No versions recorded yet. Save to create the first version.
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col gap-1 pr-1 overflow-y-auto">
                                {buildVersionTree(versions).map(node => (
                                    <VersionTreeItem
                                        key={node.id}
                                        node={node}
                                        level={0}
                                        loadedVersionId={loadedVersionId}
                                        onLoad={(vNode) => {
                                            if (window.confirm(`Load version v${vNode.version} into editor? Unsaved changes will be lost.`)) {
                                                setCode(vNode.content);
                                                setLoadedVersionId(vNode.id);
                                            }
                                        }}
                                        onCompare={(vNode) => {
                                            setCompareVersionId(vNode.id);
                                            setIsDiffMode(true);
                                        }}
                                        onDelete={async (vNode) => {
                                            if (window.confirm(`Are you sure you want to delete version v${vNode.version}? This will re-parent any child versions.`)) {
                                                try {
                                                    await deleteSnippetVersion(currentSnippet.id, vNode.id);
                                                    const fetched = await getSnippetVersions(currentSnippet.id);
                                                    setVersions(fetched);
                                                    if (loadedVersionId === vNode.id) {
                                                        if (fetched.length > 0) {
                                                            setLoadedVersionId(fetched[fetched.length - 1].id);
                                                        } else {
                                                            setLoadedVersionId(null);
                                                        }
                                                    }
                                                } catch (err) {
                                                    console.error("Failed to delete version", err);
                                                    alert("Failed to delete version.");
                                                }
                                            }
                                        }}
                                    />
                                ))}
                            </div>
                        )}
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
