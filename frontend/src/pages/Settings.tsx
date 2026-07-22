import { useState, useEffect } from 'react';
import { getSettings, updateSettings, testConnection } from '../api/settings';
import type { Setting } from '../api/settings';
import { getTags, deleteTag } from '../api/snippets';
import { exportBackup, importBackup } from '../api/backup';

function TagManagement() {
    const [tags, setTags] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadTags();
    }, []);

    const loadTags = async () => {
        setLoading(true);
        try {
            const data = await getTags();
            setTags(data);
        } catch (error) {
            console.error("Failed to load tags", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (tag: string) => {
        if (!confirm(`Are you sure you want to delete the tag "${tag}" from ALL snippets?`)) return;
        try {
            await deleteTag(tag);
            loadTags(); // Refresh list
        } catch (error) {
            console.error("Failed to delete tag", error);
            alert("Failed to delete tag");
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                Manage Tags
            </h2>
            <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                    View and delete tags used across your snippets.
                </p>
                {loading ? (
                    <div className="text-sm text-gray-500">Loading tags...</div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {tags.length === 0 ? (
                            <span className="text-gray-400 text-sm italic">No tags found.</span>
                        ) : (
                            tags.map(tag => (
                                <span key={tag} className="bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                                    #{tag}
                                    <button
                                        onClick={() => handleDelete(tag)}
                                        className="hover:text-red-500 ml-1 font-bold"
                                        title="Delete tag from all snippets"
                                    >
                                        &times;
                                    </button>
                                </span>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function MfaConfiguration() {
    const [mfaEnabled, setMfaEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [setupData, setSetupData] = useState<{ secret: string; qr_code_base64: string } | null>(null);
    const [verificationCode, setVerificationCode] = useState('');
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        loadUserMfaStatus();
    }, []);

    const loadUserMfaStatus = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/users/me', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (res.ok) {
                const user = await res.json();
                setMfaEnabled(user.mfa_enabled);
            }
        } catch (error) {
            console.error("Failed to load user info", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSetup = async () => {
        setActionLoading(true);
        setError('');
        try {
            const res = await fetch('/api/v1/users/mfa/setup', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (!res.ok) throw new Error("Failed to start MFA setup");
            const data = await res.json();
            setSetupData(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to initialize setup.";
            setError(message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleEnable = async (e: React.FormEvent) => {
        e.preventDefault();
        setActionLoading(true);
        setError('');
        try {
            const res = await fetch('/api/v1/users/mfa/enable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ code: verificationCode })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Verification failed");
            }
            alert("MFA enabled successfully!");
            setSetupData(null);
            setVerificationCode('');
            loadUserMfaStatus();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to enable MFA.";
            setError(message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDisable = async () => {
        if (!confirm("Are you sure you want to disable Multi-Factor Authentication? Your account security will be reduced.")) return;
        setActionLoading(true);
        setError('');
        try {
            const res = await fetch('/api/v1/users/mfa/disable', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Failed to disable MFA");
            }
            alert("MFA disabled successfully.");
            loadUserMfaStatus();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to disable MFA.";
            setError(message);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return <div className="text-sm text-gray-500 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">Checking security status...</div>;
    }

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2.166 4.9L10 1.554 17.834 4.9a1 1 0 01.616.92v5.337a8 8 0 01-4.09 6.963l-4.03 2.21a1 1 0 01-.93 0l-4.03-2.21a8 8 0 01-4.09-6.963V5.82a1 1 0 01.616-.92zM9 11a1 1 0 112 0v2a1 1 0 11-2 0v-2zm1-7a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
                </svg>
                Multi-Factor Authentication (MFA)
            </h2>
            <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Protect your local credentials by enforcing a 6-digit verification code from your authenticator app during login.
                </p>

                {mfaEnabled ? (
                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h3 className="text-sm font-bold text-green-800 dark:text-green-300">MFA is Active</h3>
                            <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">Your account is secured using TOTP authentication.</p>
                        </div>
                        <button
                            onClick={handleDisable}
                            disabled={actionLoading}
                            className="bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-4 py-2 rounded-lg font-medium text-xs transition"
                        >
                            Disable MFA
                        </button>
                    </div>
                ) : (
                    <div>
                        {!setupData ? (
                            <button
                                onClick={handleSetup}
                                disabled={actionLoading}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition"
                            >
                                Setup Authenticator App
                            </button>
                        ) : (
                            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-900/20 space-y-4 max-w-md">
                                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Verify MFA Connection</h3>
                                <p className="text-xs text-gray-500">Scan the QR code below using Google Authenticator, Microsoft Authenticator, or another compatible app.</p>
                                
                                <div className="flex justify-center bg-white p-3 rounded-lg border border-gray-200 w-fit mx-auto">
                                    <img src={setupData.qr_code_base64} alt="QR Code" className="h-44 w-44" />
                                </div>
                                
                                <div className="text-center">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Secret Key</span>
                                    <code className="bg-gray-100 dark:bg-gray-850 px-2 py-1 rounded text-xs select-all font-mono font-bold text-gray-700 dark:text-gray-300">{setupData.secret}</code>
                                </div>

                                <form onSubmit={handleEnable} className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">Enter Verification Code</label>
                                        <input
                                            type="text"
                                            maxLength={6}
                                            required
                                            placeholder="e.g. 123456"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-center font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:text-white"
                                            value={verificationCode}
                                            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                                        />
                                    </div>

                                    {error && <div className="text-red-500 text-xs text-center">{error}</div>}

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSetupData(null)}
                                            className="w-1/3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-850"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={actionLoading}
                                            className="w-2/3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition"
                                        >
                                            Confirm & Enable
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function EntraIdSsoHelp() {
    const [showHelp, setShowHelp] = useState(false);
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://er-psscripter.eidolf.de';
    const currentRedirectUri = `${currentOrigin}/login/callback`;
    
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
            <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-white flex items-center justify-between">
                <span className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-blue-500" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 0H11V11H0V0Z" fill="#F25022"/>
                        <path d="M12 0H23V11H12V0Z" fill="#7FBA00"/>
                        <path d="M0 12H11V23H0V12Z" fill="#00A4EF"/>
                        <path d="M12 12H23V23H12V12Z" fill="#FFB900"/>
                    </svg>
                    Microsoft EntraID SSO Integration Guide
                </span>
                <button
                    onClick={() => setShowHelp(!showHelp)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                    {showHelp ? 'Hide Instructions' : 'Show Instructions'}
                </button>
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                Follow these step-by-step instructions to register this application in the Microsoft Entra admin center and enable Single Sign-On (SSO).
            </p>

            {showHelp && (
                <div className="space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4 text-sm text-gray-600 dark:text-gray-300">
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 rounded-lg text-xs text-amber-800 dark:text-amber-300 space-y-1">
                        <span className="font-bold block">Important Note on Redirect URIs (AADSTS90102 Fix):</span>
                        <p>
                            Microsoft EntraID requires the Redirect URI to be a <strong>valid absolute URI with scheme</strong> (e.g. <code>{currentRedirectUri}</code>). 
                            If you omit <code>https://</code> or enter an incomplete domain, Microsoft will reject authentication with the error <code>AADSTS90102</code>.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <h3 className="font-bold text-gray-800 dark:text-gray-200">Step 1: Register Application in Azure/Entra Portal</h3>
                        <ol className="list-decimal pl-5 space-y-1">
                            <li>Sign in to the <a href="https://entra.microsoft.com" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline font-semibold">Microsoft Entra admin center</a> as an administrator.</li>
                            <li>Navigate to <strong>Identity &gt; Applications &gt; App registrations</strong> and click <strong>New registration</strong>.</li>
                            <li>Enter a name (e.g. <code>ER-PSScripter</code>).</li>
                            <li>Select <strong>Accounts in this organizational directory only</strong> (Single Tenant) or <strong>Accounts in any organizational directory</strong> (Multitenant) based on your requirements.</li>
                            <li>Select <strong>Single-page application (SPA)</strong> or <strong>Web</strong> as the redirect platform and set the Redirect URI to your exact external URL: <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs select-all">{currentRedirectUri}</code>.</li>
                            <li>Click <strong>Register</strong>.</li>
                        </ol>
                    </div>

                    <div className="space-y-2">
                        <h3 className="font-bold text-gray-800 dark:text-gray-200">Step 2: Create a Client Secret</h3>
                        <ol className="list-decimal pl-5 space-y-1">
                            <li>Under the newly registered application, go to <strong>Certificates & secrets &gt; Client secrets</strong>.</li>
                            <li>Click <strong>New client secret</strong>.</li>
                            <li>Enter a description, choose an expiration period, and click <strong>Add</strong>.</li>
                            <li><strong>CRITICAL:</strong> Copy the secret <strong>Value</strong> immediately (not the Secret ID). You will not be able to see it again.</li>
                        </ol>
                    </div>

                    <div className="space-y-2">
                        <h3 className="font-bold text-gray-800 dark:text-gray-200">Step 3: Configure API Permissions</h3>
                        <ol className="list-decimal pl-5 space-y-1">
                            <li>Go to <strong>API permissions</strong>.</li>
                            <li>Ensure the following permissions are present under Microsoft Graph: <code>User.Read</code>, <code>email</code>, <code>openid</code>, <code>profile</code>.</li>
                            <li>Click <strong>Grant admin consent for [Your Organization]</strong> to activate permissions automatically.</li>
                        </ol>
                    </div>

                    <div className="space-y-2">
                        <h3 className="font-bold text-gray-800 dark:text-gray-200">Step 4: Save Configuration in Settings</h3>
                        <p>Fill out the <strong>Microsoft EntraID SSO Configuration</strong> form above on this page and click <strong>Save Settings</strong> at the bottom:</p>
                        <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-lg text-xs font-mono select-all space-y-1 block border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200">
                            Application (Client) ID: [Your Application ID]<br />
                            Directory (Tenant) ID: common (or your Tenant UUID)<br />
                            Client Secret Value: [Your Secret Value]<br />
                            Redirect URI: {currentRedirectUri}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Settings() {
    const [settings, setSettings] = useState<Setting[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [showAzureHelp, setShowAzureHelp] = useState(false);

    // Local state for form values
    const [formValues, setFormValues] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await getSettings();
            setSettings(data);

            // Initialize form values
            const initialValues: { [key: string]: string } = {};
            data.forEach(s => {
                initialValues[s.key] = s.value || '';
            });
            setFormValues(initialValues);
        } catch (error) {
            console.error("Failed to load settings", error);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (key: string, value: string) => {
        setFormValues(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Only send changed values? No, send all relevant ones (or backend handles diff).
            // Backend updates based on keys present.
            await updateSettings(formValues);
            alert("Settings saved successfully!");
            loadSettings(); // Reload to get masks/updates
        } catch (error) {
            console.error("Failed to save settings", error);
            alert("Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        try {
            const config = {
                provider: formValues["LLM_PROVIDER"] || "openai",
                api_key: formValues["OPENAI_API_KEY"] || "",
                base_url: formValues["OPENAI_BASE_URL"],
                azure_endpoint: formValues["AZURE_OPENAI_ENDPOINT"],
                azure_deployment: formValues["AZURE_OPENAI_DEPLOYMENT_NAME"],
                azure_api_version: formValues["AZURE_OPENAI_API_VERSION"],
                model: formValues["OPENAI_MODEL"]
            };

            const result = await testConnection(config);
            if (result.success) {
                alert("Connection successful! ✅");
            } else {
                alert(`Connection failed: ${result.error} ❌`);
            }
        } catch (error) {
            console.error("Test failed", error);
            alert("Test failed due to client error.");
        } finally {
            setTesting(false);
        }
    };

    if (loading) return <div>Loading settings...</div>;

    // Filter settings by category for UI (hardcoded grouping)
    const provider = formValues["LLM_PROVIDER"] || "openai";
    const embeddingProvider = formValues["EMBEDDING_PROVIDER"] || ""; // Empty means same as LLM

    // Determine effective embedding provider for UI logic
    const effectiveEmbeddingProvider = embeddingProvider || provider;

    // Show API Key if EITHER provider needs it (not local/local_builtin)
    const needsApiKey = (provider !== "local" && provider !== "local_builtin") ||
        (effectiveEmbeddingProvider !== "local" && effectiveEmbeddingProvider !== "local_builtin");

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">System Settings</h1>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">AI Provider Configuration</h2>

                <div className="space-y-6">
                    {/* Provider Select */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            LLM Provider
                        </label>
                        <select
                            value={provider}
                            onChange={e => handleInputChange("LLM_PROVIDER", e.target.value)}
                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="openai">OpenAI (Official)</option>
                            <option value="azure">Azure OpenAI</option>
                            <option value="local">Local (Ollama / Custom)</option>
                            <option value="local_builtin">Local (Built-in / Offline)</option>
                        </select>
                    </div>

                    {/* Embedding Provider Select */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Embedding Provider (Learning)
                        </label>
                        <select
                            value={embeddingProvider}
                            onChange={e => handleInputChange("EMBEDDING_PROVIDER", e.target.value)}
                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="">Same as Generation (Default)</option>
                            <option value="local_builtin">Local (Built-in / Offline)</option>
                            <option value="openai">OpenAI (Official)</option>
                            <option value="azure">Azure OpenAI</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                            Select a different provider for the "Learn" feature. Recommended: <strong>Local (Built-in)</strong> for free, private indexing.
                        </p>
                    </div>

                    {/* Common API Key - Show if ANY provider needs it */}
                    {needsApiKey && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                API Key
                            </label>
                            <input
                                type="password"
                                value={formValues["OPENAI_API_KEY"] || ''}
                                onChange={e => handleInputChange("OPENAI_API_KEY", e.target.value)}
                                placeholder={settings.find(s => s.key === "OPENAI_API_KEY")?.value?.includes("*") ? "Saved (Enter new to overwrite)" : "sk-..."}
                                className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            />
                            <p className="text-xs text-gray-500 mt-1">Provider API Key. For Azure, use your Azure API Key.</p>
                        </div>
                    )}

                    {/* Local Built-in Guide */}
                    {effectiveEmbeddingProvider === "local_builtin" && (
                        <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg text-sm text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800">
                            <div className="flex items-center gap-2 font-semibold mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                Local Learning Active
                            </div>
                            <p>
                                <strong>Great choice!</strong> Your snippets will be indexed offline on your server using the local model.
                            </p>
                            <div className="mt-2 text-xs bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 p-2 rounded border border-yellow-200 dark:border-yellow-800">
                                <strong>Requirement:</strong> This requires the <code>llm</code> profile to be enabled in Docker.
                                <br />
                                If the connection fails, check your <code>.env</code> file: <code>COMPOSE_PROFILES=llm</code> and restart Docker.
                            </div>
                            {provider !== "local_builtin" && (
                                <p className="mt-1">
                                    Your <strong>Generation</strong> (Chat) will still use <strong>{provider === "azure" ? "Azure OpenAI" : "OpenAI"}</strong> for the best quality scripts.
                                </p>
                            )}
                        </div>
                    )}
                    {/* Azure Visibility Logic: Show if EITHER is Azure */}
                    {(provider === "azure" || effectiveEmbeddingProvider === "azure") && (
                        <div className="grid grid-cols-1 gap-4 border-t pt-4 dark:border-gray-700">
                            <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-200 mb-4 cursor-pointer" onClick={() => setShowAzureHelp(!showAzureHelp)}>
                                <div className="flex items-center gap-2 font-semibold">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    How to configure Azure & Create Deployment (Click to toggle)
                                </div>

                                {showAzureHelp && (
                                    <div className="mt-3 space-y-3 pl-7">
                                        <div>
                                            <strong>1. Find API Key & Endpoint:</strong>
                                            <ul className="list-disc pl-5 mt-1 space-y-1">
                                                <li>Go to Azure Portal &gt; Your Resource &gt; "Keys and Endpoint".</li>
                                            </ul>
                                        </div>

                                        <div>
                                            <strong>2. Create Deployment (Required):</strong>
                                            <ol className="list-decimal pl-5 mt-1 space-y-1">
                                                <li>Go to <a href="https://oai.azure.com/" target="_blank" rel="noreferrer" className="underline">Azure OpenAI Studio</a> &gt; Deployments.</li>
                                                <li>Click <strong>+ Create new deployment</strong>.</li>
                                                <li>Select:
                                                    <ul className="list-disc pl-5 mt-1 text-xs opacity-90">
                                                        <li><strong>Deployment type:</strong> Standard / Global Standard</li>
                                                        <li><strong>Model:</strong> gpt-4o (or gpt-4o-mini)</li>
                                                        <li><strong>Deployment name:</strong> Enter a custom name (e.g., <code>gpt4o-mini-dev</code>). <span className="text-red-500 font-bold">*Copy this name!*</span></li>
                                                        <li><strong>Version:</strong> Latest (e.g. 2024-X-X)</li>
                                                    </ul>
                                                </li>
                                                <li>Click <strong>Create</strong>.</li>
                                            </ol>
                                        </div>

                                        <div className="text-xs bg-white/50 dark:bg-black/20 p-2 rounded">
                                            <strong>Note:</strong> The "Deployment Name" in settings below must match exactly the custom name you entered in step 2.3 (e.g., <code>gpt4o-mini-dev</code>).
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* ... Inputs ... */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Azure Endpoint
                                    </label>
                                    <input
                                        type="text"
                                        value={formValues["AZURE_OPENAI_ENDPOINT"] || ''}
                                        onChange={e => handleInputChange("AZURE_OPENAI_ENDPOINT", e.target.value)}
                                        placeholder="https://my-resource.openai.azure.com/"
                                        className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    />
                                </div>
                                {provider === "azure" && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Deployment Name (Chat)
                                        </label>
                                        <input
                                            type="text"
                                            value={formValues["AZURE_OPENAI_DEPLOYMENT_NAME"] || ''}
                                            onChange={e => handleInputChange("AZURE_OPENAI_DEPLOYMENT_NAME", e.target.value)}
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        />
                                    </div>
                                )}
                                {effectiveEmbeddingProvider === "azure" && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Embedding Deployment
                                        </label>
                                        <input
                                            type="text"
                                            value={formValues["AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME"] || ''}
                                            onChange={e => handleInputChange("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME", e.target.value)}
                                            placeholder="text-embedding-3-small"
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Separate deployment for Embeddings needed.</p>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        API Version
                                    </label>
                                    <input
                                        type="text"
                                        value={formValues["AZURE_OPENAI_API_VERSION"] || '2024-02-15-preview'}
                                        onChange={e => handleInputChange("AZURE_OPENAI_API_VERSION", e.target.value)}
                                        className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {(provider === "openai" || provider === "local") && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4 dark:border-gray-700">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Base URL (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={formValues["OPENAI_BASE_URL"] || ''}
                                    onChange={e => handleInputChange("OPENAI_BASE_URL", e.target.value)}
                                    placeholder="https://api.openai.com/v1"
                                    className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                                {provider === "local" && (
                                    <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                                        <strong>Hint:</strong> For local Ollama on Linux/Docker, use:
                                        <code className="block mt-1 bg-white dark:bg-black/20 p-1 rounded select-all">http://host.docker.internal:11434/v1</code>
                                    </div>
                                )}
                                {provider !== "local" && (
                                    <p className="text-xs text-gray-500 mt-1">For Local LLMs (e.g. Ollama), use http://localhost:11434/v1</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Model Name
                                </label>
                                <input
                                    type="text"
                                    value={formValues["OPENAI_MODEL"] || 'gpt-4o'}
                                    onChange={e => handleInputChange("OPENAI_MODEL", e.target.value)}
                                    className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                                {provider === "local" && (
                                    <p className="text-xs text-gray-500 mt-1">e.g. <code>llama3</code>, <code>mistral</code>, <code>gemma</code></p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Microsoft EntraID SSO Configuration Card */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <svg className="h-5 w-5 text-blue-500" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M0 0H11V11H0V0Z" fill="#F25022"/>
                            <path d="M12 0H23V11H12V0Z" fill="#7FBA00"/>
                            <path d="M0 12H11V23H0V12Z" fill="#00A4EF"/>
                            <path d="M12 12H23V23H12V12Z" fill="#FFB900"/>
                        </svg>
                        Microsoft EntraID SSO Configuration
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        {formValues["ENTRA_CLIENT_ID"] ? "Configured" : "Not Configured"}
                    </span>
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                    Configure your Microsoft EntraID App registration keys directly here without needing to edit backend configuration files.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Application (Client) ID
                        </label>
                        <input
                            type="text"
                            value={formValues["ENTRA_CLIENT_ID"] || ''}
                            onChange={e => handleInputChange("ENTRA_CLIENT_ID", e.target.value)}
                            placeholder="e.g. 00000000-0000-0000-0000-000000000000"
                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Directory (Tenant) ID
                        </label>
                        <input
                            type="text"
                            value={formValues["ENTRA_TENANT_ID"] || 'common'}
                            onChange={e => handleInputChange("ENTRA_TENANT_ID", e.target.value)}
                            placeholder="common (or your specific tenant ID)"
                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1">Use <code>common</code> for multi-tenant or your Tenant UUID.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Client Secret Value
                        </label>
                        <input
                            type="password"
                            value={formValues["ENTRA_CLIENT_SECRET"] || ''}
                            onChange={e => handleInputChange("ENTRA_CLIENT_SECRET", e.target.value)}
                            placeholder={formValues["ENTRA_CLIENT_SECRET"] ? "••••••••" : "Paste Secret Value here"}
                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Redirect URI
                            </label>
                            <button
                                type="button"
                                onClick={() => {
                                    const autoUri = `${window.location.origin}/login/callback`;
                                    handleInputChange("ENTRA_REDIRECT_URI", autoUri);
                                }}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                            >
                                Use current domain
                            </button>
                        </div>
                        <input
                            type="text"
                            value={formValues["ENTRA_REDIRECT_URI"] || ''}
                            onChange={e => handleInputChange("ENTRA_REDIRECT_URI", e.target.value)}
                            placeholder={`e.g. ${typeof window !== 'undefined' ? window.location.origin : 'https://er-psscripter.eidolf.de'}/login/callback`}
                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1">Must be an absolute URL starting with <code>https://</code> (or <code>http://localhost</code>).</p>
                    </div>
                </div>
            </div>

            {/* Multi-Factor Authentication Section */}
            <MfaConfiguration />

            {/* Microsoft EntraID SSO Guide Section */}
            <EntraIdSsoHelp />

            {/* Manage Tags Section */}
            <TagManagement />

            {/* Custom Categories Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    Snippet Categories
                </h2>
                <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                        Manage custom categories for your snippets in addition to the standard ones.
                    </p>

                    <div className="flex gap-2">
                        <input
                            placeholder="Add new category..."
                            className="flex-grow p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const val = e.currentTarget.value.trim();
                                    if (val) {
                                        const current = formValues['CUSTOM_CATEGORIES'] ? JSON.parse(formValues['CUSTOM_CATEGORIES']) : [];
                                        if (!current.includes(val)) {
                                            const updated = [...current, val];
                                            setFormValues({ ...formValues, 'CUSTOM_CATEGORIES': JSON.stringify(updated) });
                                        }
                                        e.currentTarget.value = '';
                                    }
                                }
                            }}
                        />
                    </div>

                    <div className="flex flex-wrap gap-2 mt-2">
                        {(formValues['CUSTOM_CATEGORIES'] ? JSON.parse(formValues['CUSTOM_CATEGORIES']) : []).map((cat: string) => (
                            <span key={cat} className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                                {cat}
                                <button
                                    onClick={() => {
                                        const current = JSON.parse(formValues['CUSTOM_CATEGORIES'] || '[]');
                                        const updated = current.filter((c: string) => c !== cat);
                                        setFormValues({ ...formValues, 'CUSTOM_CATEGORIES': JSON.stringify(updated) });
                                    }}
                                    className="hover:text-red-500 ml-1"
                                >
                                    &times;
                                </button>
                            </span>
                        ))}
                        {(!formValues['CUSTOM_CATEGORIES'] || JSON.parse(formValues['CUSTOM_CATEGORIES']).length === 0) && (
                            <span className="text-gray-400 text-sm italic">No custom categories added.</span>
                        )}
                    </div>
                </div>

                {/* System Backup Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                    <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 16.5V19h12v-2.5a.5.5 0 00-.5-.5h-11a.5.5 0 00-.5.5zM3.5 14H5v1.5a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5V14h1.5a.5.5 0 00.5-.5V4.5A1.5 1.5 0 0015.5 3h-11A1.5 1.5 0 003 4.5v9a.5.5 0 00.5.5zM12 7a1 1 0 100-2 1 1 0 000 2zM8 7a1 1 0 100-2 1 1 0 000 2zM9 11a1 1 0 11-2 0 1 1 0 012 0zm4 0a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
                        </svg>
                        Full System Backup
                    </h2>
                    <div className="space-y-4">
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Export specific configuration, projects, and snippets to a JSON file. Use this to migrate or restore your environment.
                        </p>

                        <div className="flex gap-4">
                            <button
                                onClick={async () => {
                                    try {
                                        await exportBackup();
                                        alert("Backup downloaded!");
                                    } catch (error) {
                                        console.error("Export failed:", error);
                                        alert("Export failed.");
                                    }
                                }}
                                className="bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60 px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export System
                            </button>

                            <label className="bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60 px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 cursor-pointer">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m-4-4v12" />
                                </svg>
                                Import System
                                <input
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        if (!confirm("WARNING: Importing a system backup will merge/overwrite existing data. This cannot be undone. Are you sure?")) {
                                            e.target.value = '';
                                            return;
                                        }

                                        const reader = new FileReader();
                                        reader.onload = async (ev) => {
                                            try {
                                                const content = ev.target?.result as string;
                                                const jsonData = JSON.parse(content);
                                                await importBackup(jsonData);
                                                alert("System restored successfully!");
                                                window.location.reload();
                                            } catch (err) {
                                                console.error("Import failed", err);
                                                alert("Failed to import backup. Check file format.");
                                            }
                                        };
                                        reader.readAsText(file);
                                        e.target.value = '';
                                    }}
                                />
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-3">
                <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white px-6 py-2 rounded-lg font-medium transition disabled:opacity-50"
                >
                    {testing ? "Testing..." : "Test Connection"}
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition disabled:bg-blue-300"
                >
                    {saving ? "Saving..." : "Save Settings"}
                </button>
            </div>
        </div>
    );
}
