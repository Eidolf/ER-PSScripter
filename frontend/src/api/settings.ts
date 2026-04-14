import client from './client';


export interface Setting {
    key: string;
    value?: string;
    description?: string;
    is_secret: boolean;
    updated_at: string;
}

export const getSettings = async (): Promise<Setting[]> => {
    const response = await client.get('/settings/');
    return response.data;
};

export const updateSettings = async (settings: { [key: string]: string }): Promise<Setting[]> => {
    const response = await client.post('/settings/', { settings });
    return response.data;
};

export const testConnection = async (config: {
    provider: string;
    api_key: string;
    base_url?: string;
    azure_endpoint?: string;
    azure_deployment?: string;
    azure_api_version?: string;
    model?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
        const response = await client.post('/settings/test-connection', config);
        return response.data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        return { success: false, error: error.response?.data?.detail || error.message || "Unknown error" };
    }
};
