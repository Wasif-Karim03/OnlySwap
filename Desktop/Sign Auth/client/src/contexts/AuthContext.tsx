import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isEmailVerified: boolean;

  avatar?: string;
  phone?: string;
  lastLogin?: string;
  reviewerApprovalStatus?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signUp: (name: string, email: string, password: string, adminCode?: string, role?: string) => Promise<void>;
  signOut: () => void;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;

  updateProfile: (updates: Partial<User>) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // Set up axios defaults
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Check if user is authenticated on app load
  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          const response = await axios.get('/api/auth/profile');
          setUser(response.data.user);
        } catch (error) {
          localStorage.removeItem('token');
          setToken(null);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, [token]);

  const signIn = async (email: string, password: string, rememberMe: boolean = false) => {
    try {
      const response = await axios.post('/api/auth/signin', { email, password, rememberMe });
      const { token: newToken, user: userData } = response.data;
      
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(userData);
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Sign in failed');
    }
  };

  const signUp = async (name: string, email: string, password: string, adminCode?: string, role?: string) => {
    try {
      const response = await axios.post('/api/auth/signup', { name, email, password, adminCode, role });
      // Don't automatically sign in after signup - user needs to verify email first
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Sign up failed');
    }
  };

  const verifyEmail = async (email: string, code: string) => {
    try {
      const response = await axios.post('/api/auth/verify-email', { email, code });
      const { token: newToken, user: userData } = response.data;
      
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(userData);
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Email verification failed');
    }
  };

  const resendVerification = async (email: string) => {
    try {
      await axios.post('/api/auth/resend-verification', { email });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to resend verification');
    }
  };



  const updateProfile = async (updates: Partial<User>) => {
    try {
      const response = await axios.put('/api/auth/profile', updates);
      setUser(response.data.user);
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Profile update failed');
    }
  };

  const deleteAccount = async (password: string) => {
    try {
      await axios.delete('/api/auth/account', { data: { password } });
      signOut();
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Account deletion failed');
    }
  };

  const signOut = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    token,
    loading,
    signIn,
    signUp,
    signOut,
    verifyEmail,
    resendVerification,

    updateProfile,
    deleteAccount
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 