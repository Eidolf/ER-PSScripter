import axios from 'axios';

const API_URL = 'http://localhost:13021/api/v1';

export interface Snippet {
    id: number;
    name: string;
    description?: string;
    content: string;
    tags: string[];
    source?: string;
    created_at: string;
}

export interface SnippetCreate {
    name: string;
    description?: string;
    content: string;
    tags: string[];
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

export const deleteSnippet = async (id: number): Promise<void> => {
    await axios.delete(`${API_URL}/snippets/${id}`);
};
