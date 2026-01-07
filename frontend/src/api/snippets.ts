import client from './client';

export interface Snippet {
    id: number;
    name: string;
    description?: string;
    content: string;
    tags: string[];
    category?: string;
    source?: string;
    created_at: string;
    has_embedding: boolean;
}

export interface SnippetCreate {
    name: string;
    description?: string;
    content: string;
    tags: string[];
    category?: string;
    source?: string;
    project_id?: number;
    relative_path?: string;
}

export const getSnippets = async (): Promise<Snippet[]> => {
    const response = await client.get('/snippets/');
    return response.data;
};

export const createSnippet = async (snippet: SnippetCreate): Promise<Snippet> => {
    const response = await client.post('/snippets/', snippet);
    return response.data;
};

export const updateSnippet = async (id: number, snippet: Partial<SnippetCreate>): Promise<Snippet> => {
    const response = await client.put(`/snippets/${id}`, snippet);
    return response.data;
};

export const deleteSnippet = async (id: number): Promise<void> => {
    await client.delete(`/snippets/${id}`);
};

export const indexSnippet = async (id: number): Promise<Snippet> => {
    const response = await client.post(`/snippets/${id}/index`);
    return response.data;
};

export const analyzeFolder = async (folderPath: string): Promise<SnippetCreate[]> => {
    // Note: The backend endpoint expects 'folder_path' query param
    const response = await client.post('/snippets/analyze', null, {
        params: { folder_path: folderPath }
    });
    return response.data;
};

export const getTags = async (): Promise<string[]> => {
    const response = await client.get('/snippets/tags');
    return response.data;
};

export const deleteTag = async (tagName: string): Promise<void> => {
    await client.delete(`/tags/${encodeURIComponent(tagName)}`);
};
