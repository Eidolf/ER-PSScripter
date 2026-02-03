import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import GridViewModal from './GridViewModal';

export interface TerminalRef {
    sendText: (text: string) => void;
}

interface TerminalProps {
    onSessionEnd?: () => void;
    executeOnMount?: string;
}

const TerminalComponent = forwardRef<TerminalRef, TerminalProps>(({ onSessionEnd, executeOnMount }, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const xtermRef = useRef<Terminal | null>(null);

    // GridView Modal State
    const [isGridViewOpen, setIsGridViewOpen] = useState(false);
    const [gridViewData, setGridViewData] = useState<Record<string, unknown>[]>([]);
    const [gridViewTitle, setGridViewTitle] = useState<string>("Out-WebGridView");

    const sendTextToTerminal = (text: string) => {
        if (xtermRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            // Use xterm.paste() to handle multi-line input correctly (handles Bracketed Paste Mode if supported)
            xtermRef.current.paste(text);

            // If the text doesn't end with a newline, we might want to append one to execute
            // But usually paste is just paste. The user can hit enter or we can append it.
            // For "Run Script", we usually want immediate execution of the last line too.
            if (!text.endsWith('\n') && !text.endsWith('\r')) {
                xtermRef.current.paste('\r');
            }

            xtermRef.current.focus();
        } else {
            console.warn("Terminal not ready");
        }
    };

    useImperativeHandle(ref, () => ({
        sendText: sendTextToTerminal
    }));

    useEffect(() => {
        if (!terminalRef.current) return;

        // Initialize xterm
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#1a1b26',
                foreground: '#a9b1d6',
            },
            allowProposedApi: true
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());

        // CUSTOM OSC HANDLER (ID 1337)
        // Protocol: OSC 1337 ; WebGridView ; [Base64JSON] ST
        term.parser.registerOscHandler(1337, (data) => {
            try {
                const parts = data.split(';');
                if (parts[0] === 'WebGridView') {
                    const base64Data = parts[1];
                    const jsonString = atob(base64Data);
                    const parsedData = JSON.parse(jsonString);

                    // Handle single object or array
                    const dataArray = Array.isArray(parsedData) ? parsedData : [parsedData];

                    setGridViewData(dataArray);
                    setGridViewTitle("Out-WebGridView"); // Could also be passed in OSC
                    setIsGridViewOpen(true);
                    return true; // Handled
                }
            } catch (e) {
                console.error("Failed to process WebGridView OSC sequence", e);
            }
            return false; // Not handled
        });

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;

        // Use relative path for WebSocket to leverage Nginx proxy
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws/terminal`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            term.write('\r\n\x1b[32mConnected to PowerShell Terminal\x1b[0m\r\n\r\n');

            // Send immediate resize to backend to sync with actual container size
            const { cols, rows } = term;
            ws.send(`resize:${cols}:${rows}`);

            if (executeOnMount) {
                // Delay slightly to ensure pwsh is ready, then execute
                setTimeout(() => {
                    sendTextToTerminal(executeOnMount);
                }, 500);
            }

            term.focus();
        };

        ws.onmessage = (event) => {
            term.write(event.data);
        };

        ws.onclose = () => {
            term.write('\r\n\x1b[31mConnection closed.\x1b[0m\r\n');
            if (onSessionEnd) onSessionEnd();
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            term.write('\r\n\x1b[31mWebSocket Error.\x1b[0m\r\n');
        };

        term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        // Resize handler
        const handleResize = () => {
            fitAddon.fit();
            if (ws.readyState === WebSocket.OPEN) {
                const { cols, rows } = term;
                ws.send(`resize:${cols}:${rows}`);
            }
        };

        window.addEventListener('resize', handleResize);

        // Initial fit and resize after a small delay to ensure container is rendered
        setTimeout(() => handleResize(), 100);

        return () => {
            window.removeEventListener('resize', handleResize);
            ws.close();
            term.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div ref={terminalRef} className="text-left relative" style={{ width: '100%', height: '100%', textAlign: 'left' }}>
            <GridViewModal
                isOpen={isGridViewOpen}
                onClose={() => setIsGridViewOpen(false)}
                title={gridViewTitle}
                data={gridViewData}
            />
        </div>
    );
});

export default TerminalComponent;
