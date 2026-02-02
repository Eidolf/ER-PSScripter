import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

interface TerminalProps {
    onSessionEnd?: () => void;
    initialInput?: string;
}

const TerminalComponent: React.FC<TerminalProps> = ({ onSessionEnd, initialInput }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const xtermRef = useRef<Terminal | null>(null);

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
            }
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;

        // Use relative path for WebSocket to leverage Nginx proxy
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws/terminal`;
        // Hardcoding 8000 for local dev if Nginx isn't handling WS proxying correctly yet
        // Ideally: use relative path if nginx is set up: `${protocol}//${window.location.host}/ws/terminal`

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            term.write('\r\n\x1b[32mConnected to PowerShell Terminal\x1b[0m\r\n');
            if (initialInput) {
                ws.send(initialInput + '\r');
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
    }, []);

    return <div ref={terminalRef} className="text-left" style={{ width: '100%', height: '100%', textAlign: 'left' }} />;
};

export default TerminalComponent;
