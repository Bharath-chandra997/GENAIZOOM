import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const AuthCallback = () => {
  const { handleGoogleCallback } = useAuth();
  const location = useLocation();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // This check ensures the callback logic runs only once
    if (!hasProcessed.current) {
      hasProcessed.current = true;
      const searchParams = new URLSearchParams(location.search);
      console.log('AuthCallback: Processing callback...');
      handleGoogleCallback(searchParams);
    }
  }, [location, handleGoogleCallback]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <LoadingSpinner size="large" color="primary" />
        <p className="mt-4 text-gray-600">Processing authentication, please wait...</p>
      </div>
    </div>
  );
};

export default AuthCallback;