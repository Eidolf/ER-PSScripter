import client from './client';

export interface User {
    id: number;
    email: string;
    is_active: boolean;
}

export interface UserCreate {
    email: string;
    password: string;
    is_active?: boolean;
}

export interface UserUpdate {
    password?: string;
    is_active?: boolean;
}

export const getUsers = async (): Promise<User[]> => {
    const response = await client.get('/users/');
    return response.data;
};

export const createUser = async (user: UserCreate): Promise<User> => {
    const response = await client.post('/users/', user);
    return response.data;
};

export const updateUser = async (id: number, user: UserUpdate): Promise<User> => {
    const response = await client.put(`/users/${id}`, user);
    return response.data;
};

export const deleteUser = async (id: number): Promise<void> => {
    await client.delete(`/users/${id}`);
};
