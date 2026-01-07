
import client from './client';

export interface Project {
    id: number;
    name: string;
    description?: string;
    created_at: string;
}

export interface ProjectCreate {
    name: string;
    description?: string;
}

export interface ProjectFile {
    name: string;
    snippet_id: number;
}

export interface ProjectFolder {
    name: string;
    files: ProjectFile[];
    folders: ProjectFolder[];
}

export const getProjects = async (): Promise<Project[]> => {
    const response = await client.get('/projects/');
    return response.data;
};

export const createProject = async (project: ProjectCreate): Promise<Project> => {
    const response = await client.post('/projects/', project);
    return response.data;
};

export const getProject = async (id: number): Promise<Project> => {
    const response = await client.get(`/projects/${id}`);
    return response.data;
};

export const deleteProject = async (id: number): Promise<void> => {
    await client.delete(`/projects/${id}`);
};

export const getProjectStructure = async (id: number): Promise<ProjectFolder> => {
    const response = await client.get(`/projects/${id}/structure`);
    return response.data;
};

export const deleteProjectFolder = async (id: number, folderPath: string): Promise<void> => {
    await client.delete(`/projects/${id}/folder`, { params: { folder_path: folderPath } });
};
