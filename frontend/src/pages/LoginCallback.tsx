import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginCallback() {
    const location = useLocation();
    const navigate = useNavigate();
    const { login } = useAuth();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const code = searchParams.get('code');

        if (!code) {
            setError('No authorization code received from Microsoft.');
            return;
        }

        const exchangeCode = async () => {
            try {
                const response = await fetch('/api/v1/login/entra/callback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ code }),
                });

                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.detail || 'SSO Login failed');
                }

                const data = await response.json();
                if (data.access_token) {
                    login(data.access_token);
                    navigate('/');
                } else {
                    throw new Error('No access token returned from server.');
                }
            } catch (err) {
                console.error(err);
                const message = err instanceof Error ? err.message : 'An error occurred during EntraID login.';
                setError(message);
            }
        };

        exchangeCode();
    }, [location, login, navigate]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full text-center space-y-4">
                <img className="mx-auto h-16 w-auto opacity-75" src="/logo.png" alt="Logo" />
                
                {error ? (
                    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-left">
                        <h3 className="text-sm font-bold text-red-800 dark:text-red-300 mb-1">Authentication Failed</h3>
                        <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
                        <button
                            onClick={() => navigate('/login')}
                            className="mt-4 w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition"
                        >
                            Back to Login
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Authenticating...</h2>
                        <p className="text-xs text-gray-500">Exchanging credentials with Microsoft EntraID.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
