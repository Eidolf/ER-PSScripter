import client from './client';



export interface GenerateRequest {
    prompt: string;
    snippet_ids: number[];
}

export interface GenerateResponse {
    content: string;
    explanation?: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    rag_info?: {
        count: number;
        snippets: string[];
    };
}

export const generateScript = async (request: GenerateRequest): Promise<GenerateResponse> => {
    // Increase timeout for AI generation as it might take longer than standard requests
    // Increase timeout for AI generation as it might take longer than standard requests
    const response = await client.post<GenerateResponse>('/generator/generate', request, {
        timeout: 60000 // 60 seconds
    });
    return response.data;
};
