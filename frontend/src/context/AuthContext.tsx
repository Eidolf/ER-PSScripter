import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

interface AuthContextType {
    token: string | null;
    login: (token: string) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const navigate = useNavigate();

    const login = React.useCallback((newToken: string) => {
        setToken(newToken);
        navigate('/');
    }, [navigate]);

    const logout = React.useCallback(() => {
        setToken(null);
        navigate('/login');
    }, [navigate]);

    useEffect(() => {
        if (token) {
            localStorage.setItem('token', token);
            // Validate session
            client.get('/users/me').catch(() => {
                // If validation fails (e.g. token expired but client interceptor didn't catch specific error code yet), logout
                logout();
            });
        } else {
            localStorage.removeItem('token');
        }
    }, [token, logout]);

    return (
        <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
