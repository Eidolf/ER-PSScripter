import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const [loading, setLoading] = useState(false);
    const [needsSetup, setNeedsSetup] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [connectionError, setConnectionError] = useState(false);

    // MFA Flow State
    const [mfaRequired, setMfaRequired] = useState(false);
    const [mfaToken, setMfaToken] = useState('');

    // SSO Config State
    const [ssoEnabled, setSsoEnabled] = useState(false);
    const [ssoUrl, setSsoUrl] = useState('');

    const checkStatus = () => {
        setCheckingStatus(true);
        setConnectionError(false);
        
        // Check system setup status
        fetch('/api/v1/login/status')
            .then(res => {
                if (!res.ok) throw new Error("Status check failed");
                return res.json();
            })
            .then(data => {
                if (data.needs_setup) {
                    setNeedsSetup(true);
                }
            })
            .catch(err => {
                console.error("Failed to check status", err);
                setConnectionError(true);
            })
            .finally(() => setCheckingStatus(false));

        // Fetch EntraID SSO configuration URL
        fetch('/api/v1/login/entra/url')
            .then(res => res.json())
            .then(data => {
                if (data.enabled && data.url) {
                    setSsoEnabled(true);
                    setSsoUrl(data.url);
                }
            })
            .catch(err => console.error("Failed to fetch EntraID config", err));
    };

    useEffect(() => {
        checkStatus();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const formData = new URLSearchParams();
            formData.append('username', email);
            formData.append('password', password);

            const endpoint = needsSetup ? '/api/v1/login/setup' : '/api/v1/login/access-token';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData,
            });

            if (!response.ok) {
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") === -1) {
                    throw new Error("Server returned an invalid response.");
                }
                const data = await response.json();
                throw new Error(data.detail || 'Login failed');
            }

            const data = await response.json();

            if (data.mfa_required) {
                setMfaRequired(true);
                setMfaToken(data.mfa_token);
                setLoading(false);
                return;
            }

            login(data.access_token);
        } catch (err: unknown) {
            console.error(err);
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Failed to process request');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleMfaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/v1/login/verify-mfa', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    mfa_token: mfaToken,
                    code: mfaCode
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'MFA Code verification failed');
            }

            const data = await response.json();
            login(data.access_token);
        } catch (err: unknown) {
            console.error(err);
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Failed to verify code');
            }
        } finally {
            setLoading(false);
        }
    };

    if (checkingStatus) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-gray-500">Loading system status...</div>
            </div>
        );
    }

    if (connectionError) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full text-center space-y-4">
                    <img className="mx-auto h-16 w-auto opacity-50" src="/logo.png" alt="Logo" />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Service Unavailable</h2>
                    <p className="text-gray-500 dark:text-gray-400">
                        Could not connect to the backend server. It might be starting up or undergoing maintenance.
                    </p>
                    <button
                        onClick={checkStatus}
                        className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
                    >
                        Retry Connection
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
                <div>
                    <img className="mx-auto h-12 w-auto" src="/logo.png" alt="Logo" />
                    <h2 className="mt-6 text-center text-2xl font-extrabold text-gray-900 dark:text-white">
                        {mfaRequired 
                            ? 'Verification Code' 
                            : (needsSetup ? 'Create Admin Account' : 'Sign in to your account')}
                    </h2>
                    <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
                        {mfaRequired 
                            ? 'Please enter the 6-digit code from your authentication app' 
                            : (needsSetup ? 'Welcome! Set up your admin credentials to initialize the system.' : 'Provide your admin credentials')}
                    </p>
                </div>

                {mfaRequired ? (
                    <form className="mt-8 space-y-6" onSubmit={handleMfaSubmit}>
                        <div>
                            <label htmlFor="mfa-code" className="sr-only">Code</label>
                            <input
                                id="mfa-code"
                                type="text"
                                maxLength={6}
                                required
                                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-center font-mono text-xl tracking-widest sm:text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
                                placeholder="000 000"
                                value={mfaCode}
                                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                            />
                        </div>

                        {error && (
                            <div className="text-red-500 text-sm text-center">{error}</div>
                        )}

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setMfaRequired(false);
                                    setMfaToken('');
                                    setMfaCode('');
                                    setError('');
                                }}
                                className="w-1/3 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Back
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-2/3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium disabled:bg-blue-400"
                            >
                                {loading ? 'Verifying...' : 'Verify'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                        <div className="rounded-md shadow-sm -space-y-px">
                            <div>
                                <label htmlFor="email-address" className="sr-only">Email address</label>
                                <input
                                    id="email-address"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
                                    placeholder={needsSetup ? "Admin Email" : "Email address"}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <div>
                                <label htmlFor="password" className="sr-only">Password</label>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete={needsSetup ? "new-password" : "current-password"}
                                    required
                                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
                                    placeholder={needsSetup ? "Choose Password" : "Password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="text-red-500 text-sm text-center">{error}</div>
                        )}

                        <div className="space-y-3">
                            <button
                                type="submit"
                                disabled={loading}
                                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400"
                            >
                                {loading ? 'Processing...' : (needsSetup ? 'Create Account & Start' : 'Sign in')}
                            </button>

                            {ssoEnabled && !needsSetup && (
                                <a
                                    href={ssoUrl}
                                    className="w-full flex justify-center items-center py-2 px-4 border border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                                >
                                    <svg className="h-5 w-5 mr-2" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M0 0H11V11H0V0Z" fill="#F25022"/>
                                        <path d="M12 0H23V11H12V0Z" fill="#7FBA00"/>
                                        <path d="M0 12H11V23H0V12Z" fill="#00A4EF"/>
                                        <path d="M12 12H23V23H12V12Z" fill="#FFB900"/>
                                    </svg>
                                    Sign in with Microsoft
                                </a>
                            )}
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
