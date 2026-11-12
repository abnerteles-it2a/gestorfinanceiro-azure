import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setAuthToken } from '../services/api';
import { Alert } from 'react-native';

interface AuthContextType {
    user: { id: string; email: string; isAdmin: boolean } | null;
    token: string | null;
    loading: boolean;
    signIn: (email: string, password: string, force?: boolean) => Promise<void>;
    signOut: () => Promise<void>;
    isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<{ id: string; email: string; isAdmin: boolean } | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const checkLogin = useCallback(async () => {
        try {
            const storedToken = await SecureStore.getItemAsync('auth_token');
            const storedUser = await SecureStore.getItemAsync('auth_user');
            
            if (storedToken) {
                setToken(storedToken);
                setAuthToken(storedToken);
                if (storedUser) {
                    setUser(JSON.parse(storedUser));
                }
            }
        } catch (e) {
            console.error('Error checking login:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        checkLogin();
    }, [checkLogin]);

    const signIn = async (email: string, password: string, force = false) => {
        try {
            setLoading(true);
            const response = await api.post('/neon-auth/signin', { email, password, force });
            const { token: newToken, user: newUser } = response.data;
            
            // SECURITY/STABILITY: Limit object size for SecureStore (Android 2KB limit)
            const essentialUser = {
                id: newUser.id,
                email: newUser.email,
                isAdmin: !!newUser.isAdmin
            };

            try {
                await SecureStore.setItemAsync('auth_token', newToken);
                await SecureStore.setItemAsync('auth_user', JSON.stringify(essentialUser));
            } catch (storageError) {
                console.error('SecureStore Error:', storageError);
                // If SecureStore fails, we still set state so the session works in-memory
            }
            
            setToken(newToken);
            setAuthToken(newToken);
            setUser(newUser); // Keep full user in memory
        } catch (error: any) {
            const errCode = error.response?.data?.error;
            if (errCode === 'already_logged') {
                return new Promise<void>((resolve, reject) => {
                    Alert.alert(
                        'Sessão Ativa',
                        'Você já está logado em outro dispositivo. Deseja desconectar a outra sessão e entrar aqui?',
                        [
                            { text: 'Não', style: 'cancel', onPress: () => reject(new Error('canceled')) },
                            { text: 'Sim, entrar', onPress: () => signIn(email, password, true).then(resolve).catch(reject) }
                        ]
                    );
                });
            } else {
                throw new Error(errCode || 'Falha no login');
            }
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        try {
            await SecureStore.deleteItemAsync('auth_token');
            await SecureStore.deleteItemAsync('auth_user');
            setToken(null);
            setAuthToken(null);
            setUser(null);
        } catch (e) {
            console.error('Error signing out:', e);
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            loading,
            signIn,
            signOut,
            isAdmin: !!user?.isAdmin
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
