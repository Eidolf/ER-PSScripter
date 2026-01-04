import axios from 'axios';

const API_URL = '/api/v1';

export interface GenerateRequest {
    prompt: string;
    snippet_ids: number[];
}

export interface GenerateResponse {
    content: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export const generateScript = async (request: GenerateRequest): Promise<GenerateResponse> => {
    // Increase timeout for AI generation as it might take longer than standard requests
    const response = await axios.post<GenerateResponse>(`${API_URL}/generator/generate`, request, {
        timeout: 60000 // 60 seconds
    });
    return response.data;
};
