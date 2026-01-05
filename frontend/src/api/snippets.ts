import axios from 'axios';

const API_URL = '/api/v1';

export interface Snippet {
    id: number;
    name: string;
    description?: string;
    content: string;
    tags: string[];
    category?: string;
    source?: string;
    created_at: string;
}

export interface SnippetCreate {
    name: string;
    description?: string;
    content: string;
    tags: string[];
    category?: string;
    source?: string;
}

export const getSnippets = async (): Promise<Snippet[]> => {
    const response = await axios.get(`${API_URL}/snippets/`);
    return response.data;
};

export const createSnippet = async (snippet: SnippetCreate): Promise<Snippet> => {
    const response = await axios.post(`${API_URL}/snippets/`, snippet);
    return response.data;
};

export const updateSnippet = async (id: number, snippet: Partial<SnippetCreate>): Promise<Snippet> => {
    const response = await axios.put(`${API_URL}/snippets/${id}`, snippet);
    return response.data;
};

export const deleteSnippet = async (id: number): Promise<void> => {
    await axios.delete(`${API_URL}/snippets/${id}`);
};

export const analyzeFolder = async (folderPath: string): Promise<SnippetCreate[]> => {
    // Note: The backend endpoint expects 'folder_path' query param
    const response = await axios.post(`${API_URL}/snippets/analyze`, null, {
        params: { folder_path: folderPath }
    });
    return response.data;
};

export const getTags = async (): Promise<string[]> => {
    const response = await axios.get(`${API_URL}/snippets/tags`);
    return response.data;
};

export const deleteTag = async (tagName: string): Promise<void> => {
    await axios.delete(`${API_URL}/tags/${encodeURIComponent(tagName)}`);
};
