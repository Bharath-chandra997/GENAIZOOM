import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const hasInitialized = useRef(false);
  const lastToken = useRef(null);

  // Use environment variable for server URL from .env
  const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

  const fetchUser = async (token, caller = 'unknown') => {
    if (lastToken.current === token) {
      console.log(`fetchUser skipped: token already processed, caller: ${caller}`);
      return;
    }
    lastToken.current = token;
    setIsLoading(true);
    try {
      console.log(`Fetching user with token (caller: ${caller}):`, token.slice(0, 10) + '...');
      const response = await fetch(`${SERVER_URL}/api/auth/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      console.log('Fetch user response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });
      if (!response.ok) {
        const text = await response.text();
        console.error('Fetch user error details:', {
          status: response.status,
          statusText: response.statusText,
          responseText: text.slice(0, 100),
        });
        if (text.includes('<!DOCTYPE')) {
          throw new Error('Received HTML response. Ensure server is running at https://zoom-clone.onrender.com and URL is correct.');
        }
        let errorData;
        try {
          errorData = JSON.parse(text);
        } catch (e) {
          throw new Error(`Failed to fetch user: ${response.status} ${response.statusText}`);
        }
        throw new Error(`Failed to fetch user: ${errorData.error || response.statusText}`);
      }
      const data = await response.json();
      console.log('Fetched user data:', data);
      if (!data.user || !data.user._id) {
        console.error('Invalid user data received:', data);
        throw new Error('Invalid user data: missing _id');
      }
      const formattedUser = {
        ...data.user,
        userId: data.user._id,
        token,
      };
      console.log('Setting user with userId:', formattedUser.userId);
      setUser(formattedUser);
      setIsAuthenticated(true);
      localStorage.setItem('userData', JSON.stringify({ ...data.user, userId: data.user._id }));
      localStorage.setItem('authToken', token);
    } catch (error) {
      console.error(`Fetch user error (caller: ${caller}):`, error.message, error);
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
      setIsAuthenticated(false);
      setUser(null);
      toast.error(error.message || 'Session invalid. Please log in again.');
      navigate('/login');
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = (flow = 'login') => {
    try {
      console.log('Initiating Google login with flow:', flow);
      // Redirect to backend's Google OAuth endpoint
      window.location.href = `${SERVER_URL}/api/auth/google?flow=${flow}`;
    } catch (error) {
      console.error('Google login error:', error);
      toast.error('Failed to initiate Google login');
      setIsLoading(false);
    }
  };

  const login = async (token) => {
    try {
      console.log('Logging in with token:', token.slice(0, 10) + '...');
      localStorage.setItem('authToken', token);
      await fetchUser(token, 'login');
    } catch (error) {
      console.error('Login error:', error);
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
      setIsAuthenticated(false);
      setUser(null);
      toast.error('Login failed. Please try again.');
      navigate('/login');
    }
  };

  const handleGoogleCallback = async (searchParams) => {
    try {
      console.log('Handling Google callback with search params:', searchParams.toString());
      const token = searchParams.get('token');
      const error = searchParams.get('error');
      if (error) {
        console.error('Google callback error:', error);
        toast.error(`Authentication failed: ${error}`);
        navigate('/login');
        return;
      }
      if (!token) {
        console.error('No token in Google callback');
        toast.error('Authentication failed: No token provided');
        navigate('/login');
        return;
      }
      console.log('Processing token:', token.slice(0, 10) + '...');
      await login(token);
    } catch (error) {
      console.error('Handle Google callback error:', error);
      toast.error('Authentication failed. Please try again.');
      navigate('/login');
    }
  };

  const logout = () => {
    console.log('Logging out user');
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    setIsAuthenticated(false);
    setUser(null);
    lastToken.current = null;
    hasInitialized.current = false;
    navigate('/login');
  };

  const updateProfile = async ({ username }) => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }
      const response = await fetch(`${SERVER_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update profile');
      }
      const data = await response.json();
      const formattedUser = {
        ...data.user,
        userId: data.user._id,
        token,
      };
      setUser(formattedUser);
      localStorage.setItem('userData', JSON.stringify({ ...data.user, userId: data.user._id }));
      toast.success('Profile updated successfully');
      return { success: true };
    } catch (error) {
      console.error('Update profile error:', error);
      toast.error(error.message || 'Failed to update profile');
      throw error;
    }
  };

  useEffect(() => {
    if (hasInitialized.current) {
      console.log('initializeAuth already ran, skipping');
      return;
    }
    hasInitialized.current = true;
    console.log('Running initializeAuth');
    const initializeAuth = async () => {
      const token = localStorage.getItem('authToken');
      const cachedUser = localStorage.getItem('userData');
      if (token && cachedUser) {
        try {
          const decoded = jwtDecode(token);
          console.log('Decoded token:', decoded);
          if (decoded.exp * 1000 > Date.now()) {
            const userData = JSON.parse(cachedUser);
            const formattedUser = {
              ...userData,
              userId: userData._id,
              token,
            };
            console.log('Setting user from cache with userId:', formattedUser.userId);
            setUser(formattedUser);
            setIsAuthenticated(true);
            await fetchUser(token, 'initializeAuth');
          } else {
            console.log('Token expired, removing from localStorage');
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
            setIsAuthenticated(false);
            setUser(null);
          }
        } catch (error) {
          console.error('Token decode error:', error);
          localStorage.removeItem('authToken');
          localStorage.removeItem('userData');
          setIsAuthenticated(false);
          setUser(null);
        }
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
      setIsLoading(false);
    };
    initializeAuth();
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, loginWithGoogle, handleGoogleCallback, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};