import { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../api/settings';
import type { Setting } from '../api/settings';

export default function Settings() {
    const [settings, setSettings] = useState<Setting[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
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

    if (loading) return <div>Loading settings...</div>;

    // Filter settings by category for UI (hardcoded grouping)
    const provider = formValues["LLM_PROVIDER"] || "openai";

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">System Settings</h1>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
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
                        </select>
                    </div>

                    {/* Common API Key */}
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

                    {/* Conditional Fields based on Provider */}
                    {provider === "azure" && (
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
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Deployment Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formValues["AZURE_OPENAI_DEPLOYMENT_NAME"] || ''}
                                        onChange={e => handleInputChange("AZURE_OPENAI_DEPLOYMENT_NAME", e.target.value)}
                                        className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    />
                                </div>
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
                                <p className="text-xs text-gray-500 mt-1">For Local LLMs (e.g. Ollama), use http://localhost:11434/v1</p>
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
                            </div>
                        </div>
                    )}
                </div>
            </div>

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
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
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
