
import React from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';

interface PowerShellEditorProps {
    code: string;
    onChange: (value: string | undefined) => void;
    height?: string;
    readOnly?: boolean;
}

const PowerShellEditor: React.FC<PowerShellEditorProps> = ({
    code,
    onChange,
    height = "80vh",
    readOnly = false
}) => {
    const handleEditorMount: OnMount = () => {
        // You can configure the monaco instance here if needed
        // e.g., define custom themes or configure compiler options
        console.log('Editor mounted');
    };

    return (
        <div
            className="border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm"
            style={{ height }}
        >
            <Editor
                height="100%"
                defaultLanguage="powershell"
                value={code}
                onChange={onChange}
                theme="vs-dark"
                options={{
                    minimap: { enabled: true },
                    fontSize: 14,
                    scrollBeyondLastLine: false,
                    readOnly: readOnly,
                    automaticLayout: true,
                    fontFamily: "'Fira Code', 'Consolas', monospace",
                    fontLigatures: true,
                }}
                onMount={handleEditorMount}
            />
        </div>
    );
};

export default PowerShellEditor;
