import React, { createContext, useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios'; // Import axios

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const SERVER_URL = 'https://genaizoomserver-0yn4.onrender.com';

  // This function now uses axios for consistency and better error handling
  const fetchUser = async (token, caller = 'unknown') => {
    try {
      console.log(`Fetching user with token (caller: ${caller})`);
      const response = await axios.get(`${SERVER_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const userData = response.data.user;
      console.log('Fetched user data:', userData);

      if (!userData || !userData._id) {
        throw new Error('Invalid user data received from server');
      }

      const formattedUser = { ...userData, token };
      setUser(formattedUser);
      setIsAuthenticated(true);
      localStorage.setItem('authToken', token);
      localStorage.setItem('userData', JSON.stringify(userData));
      return formattedUser; // Return the user on success

    } catch (error) {
      console.error(`Fetch user error (caller: ${caller}):`, error);
      const errorMessage = error.response?.data?.error || 'Session is invalid. Please log in again.';
      toast.error(errorMessage);

      // Clean up on failure
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
      setIsAuthenticated(false);
      setUser(null);
      navigate('/login', { replace: true });
      return null; // Return null on failure
    }
  };

  const loginWithGoogle = (flow = 'login') => {
    console.log('Initiating Google login with flow:', flow);
    window.location.href = `${SERVER_URL}/api/auth/google?flow=${flow}`;
  };

  const handleGoogleCallback = async (searchParams) => {
    setIsLoading(true);
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      toast.error(`Authentication failed: ${error}`);
      setIsLoading(false);
      navigate('/login', { replace: true });
      return;
    }

    if (token) {
      const loggedInUser = await fetchUser(token, 'handleGoogleCallback');
      if (loggedInUser) {
        navigate('/home', { replace: true });
      }
    } else {
      toast.error('Authentication failed: No token provided.');
      navigate('/login', { replace: true });
    }
    setIsLoading(false);
  };

  const logout = () => {
    console.log('Logging out user');
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    setIsAuthenticated(false);
    setUser(null);
    navigate('/login');
  };

  const updateProfile = async ({ username }) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.put(
        `${SERVER_URL}/api/auth/profile`,
        { username },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const updatedUser = response.data.user;
      const formattedUser = { ...updatedUser, token };
      setUser(formattedUser);
      localStorage.setItem('userData', JSON.stringify(updatedUser));
      toast.success('Profile updated successfully');
      return { success: true };
    } catch (error) {
      console.error('Update profile error:', error);
      toast.error(error.response?.data?.error || 'Failed to update profile');
      throw error;
    }
  };

  // This useEffect hook runs only once on app startup
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('authToken');
      if (token) {
        try {
          const decoded = jwtDecode(token);
          if (decoded.exp * 1000 > Date.now()) {
            await fetchUser(token, 'initializeAuth');
          } else {
            logout(); // Token is expired
          }
        } catch (error) {
          logout(); // Token is invalid
        }
      }
      setIsLoading(false);
    };
    initializeAuth();
  }, []); // Empty dependency array ensures it runs only once

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, loginWithGoogle, handleGoogleCallback, logout, updateProfile }}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};