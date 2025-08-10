import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import LoadingSpinner from '../components/LoadingSpinner';

const AuthCallback = () => {
  const { handleGoogleCallback, isLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const processedToken = useRef(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get('token');
    if (token && token !== processedToken.current) {
      console.log('AuthCallback: Processing callback with search params:', location.search);
      processedToken.current = token;
      handleGoogleCallback(searchParams);
    } else {
      console.log('AuthCallback: Skipping duplicate or invalid token processing');
    }
  }, [location.search, handleGoogleCallback]);

  useEffect(() => {
    console.log('AuthCallback: Checking auth, isLoading:', isLoading, 'isAuthenticated:', isAuthenticated, 'user:', user);
    const checkAuth = async () => {
      if (!isLoading) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log('AuthCallback: After delay, isLoading:', isLoading, 'isAuthenticated:', isAuthenticated, 'user:', user);
        if (isAuthenticated && user) {
          console.log('AuthCallback: User authenticated, navigating to /home');
          navigate('/home', { replace: true });
        } else {
          console.log('AuthCallback: Authentication failed, navigating to /login');
          navigate('/login', { replace: true });
        }
      }
    };
    checkAuth();
  }, [isLoading, isAuthenticated, user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <LoadingSpinner size="large" color="primary" />
        <p className="mt-4 text-gray-600">Processing authentication...</p>
      </div>
    </div>
  );
};

export default AuthCallback;