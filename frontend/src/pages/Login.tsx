import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
// import { getSettings } from '../api/settings'; // Unused
// We'll invoke the login endpoint directly here using fetch for now, 
// or create an api/auth.ts helper. I'll use fetch for simplicity in this file.

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const [loading, setLoading] = useState(false);
    const [needsSetup, setNeedsSetup] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);

    // Check system status on mount
    useEffect(() => {
        fetch('/api/v1/login/status')
            .then(res => res.json())
            .then(data => {
                if (data.needs_setup) {
                    setNeedsSetup(true);
                }
            })
            .catch(err => console.error("Failed to check status", err))
            .finally(() => setCheckingStatus(false));
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
                const data = await response.json();
                throw new Error(data.detail || (needsSetup ? 'Setup failed' : 'Login failed'));
            }

            const data = await response.json();
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

    if (checkingStatus) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <img className="mx-auto h-12 w-auto" src="/logo.png" alt="Logo" />
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
                        {needsSetup ? 'Create Admin Account' : 'Sign in to your account'}
                    </h2>
                    {needsSetup && (
                        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
                            Welcome! Please set up your admin credentials to get started.
                        </p>
                    )}
                </div>
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
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
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
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                placeholder={needsSetup ? "Choose Password" : "Password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center">{error}</div>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400"
                        >
                            {loading ? 'Processing...' : (needsSetup ? 'Create Account & Start' : 'Sign in')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
