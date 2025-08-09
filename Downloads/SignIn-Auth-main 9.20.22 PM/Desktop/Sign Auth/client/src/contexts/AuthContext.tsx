import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

interface User {
  id: string;
  _id?: string;
  name: string;
  email: string;
  university?: string;
  bio?: string;
  profilePicture?: string;
  role: string;
  isEmailVerified: boolean;
  userType?: 'buyer' | 'seller';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signUp: (name: string, email: string, password: string, university?: string, adminCode?: string, role?: string) => Promise<void>;
  signOut: () => void;
  updateProfile: (data: any) => Promise<void>;
  uploadProfilePicture: (file: File) => Promise<void>;
  saveItem: (productId: string) => Promise<{ isSaved: boolean; savedCount: number }>;
  getSavedItems: () => Promise<any[]>;
  getProducts: () => Promise<any[]>;
  createListing: (formData: FormData) => Promise<any>;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const response = await axios.get('/api/auth/profile');
      setUser(response.data.user);
    } catch (error) {
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string, rememberMe = false) => {
    const response = await axios.post('/api/auth/signin', { email, password, rememberMe });
    const { token, user } = response.data;
    
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);
  };

  const signUp = async (name: string, email: string, password: string, university?: string, adminCode?: string, role?: string) => {
    await axios.post('/api/auth/signup', { name, email, password, university, adminCode, role });
  };

  const signOut = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  const updateProfile = async (data: any) => {
    const response = await axios.put('/api/auth/profile', data);
    setUser(response.data.user);
  };

  const uploadProfilePicture = async (file: File) => {
    const formData = new FormData();
    formData.append('profilePicture', file);
    
    const response = await axios.post('/api/auth/upload-profile-picture', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    setUser(response.data.user);
  };

  const saveItem = async (productId: string) => {
    const response = await axios.post(`/api/auth/save-item/${productId}`);
    return response.data;
  };

  const getSavedItems = async () => {
    const response = await axios.get('/api/auth/saved-items');
    return response.data.savedItems;
  };

  const getProducts = async () => {
    const response = await axios.get('/api/auth/products');
    return response.data.products;
  };



  const createListing = async (formData: FormData) => {
    try {
      console.log('🔧 AuthContext: Starting createListing request...');
      
      // Log the FormData contents for debugging
      const entries = Array.from(formData.entries());
      for (const [key, value] of entries) {
        if (value instanceof File) {
          console.log(`📁 FormData entry - ${key}:`, {
            name: value.name,
            type: value.type,
            size: value.size
          });
        } else {
          console.log(`📝 FormData entry - ${key}:`, value);
        }
      }
      
      const response = await axios.post('/api/auth/create-listing', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      console.log('✅ AuthContext: createListing successful:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ AuthContext: createListing failed:', error);
      if (axios.isAxiosError(error)) {
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
        throw new Error(error.response?.data?.message || error.message);
      }
      throw error;
    }
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile,
    uploadProfilePicture,
    saveItem,
    getSavedItems,
    getProducts,
    createListing
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 