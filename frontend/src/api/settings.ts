import axios from 'axios';

const API_URL = '/api/v1';

export interface Setting {
    key: string;
    value?: string;
    description?: string;
    is_secret: boolean;
    updated_at: string;
}

export const getSettings = async (): Promise<Setting[]> => {
    const response = await axios.get(`${API_URL}/settings/`);
    return response.data;
};

export const updateSettings = async (settings: { [key: string]: string }): Promise<Setting[]> => {
    const response = await axios.post(`${API_URL}/settings/`, { settings });
    return response.data;
};
