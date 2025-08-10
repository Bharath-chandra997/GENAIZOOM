import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import LoadingSpinner from '../components/LoadingSpinner';

const Login = () => {
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    console.log('Login button clicked, initiating Google OAuth');
    if (loading) return;
    setLoading(true);
    try {
      localStorage.removeItem('authToken');
      console.log('Clearing authToken from localStorage');
      await loginWithGoogle('login');
    } catch (error) {
      console.error('Google login error:', error);
      toast.error(error.message || 'Failed to initiate Google authentication. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center animate-fade-in">
          <div className="mx-auto w-16 h-16 bg-primary-600 rounded-xl flex items-center justify-center mb-6">
            <span className="text-2xl font-bold text-white">V</span>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome Back
          </h2>
          <p className="text-gray-600">
            Sign in to your account to start or join meetings
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 animate-slide-up">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white border border-gray-300 text-gray-700 py-3 px-4 rounded-xl font-semibold hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-primary-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <div className="flex items-center justify-center space-x-2">
                <LoadingSpinner size="small" color="gray" />
                <span>Authenticating...</span>
              </div>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1.02.68-2.29 1.09-3.71 1.09-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </>
            )}
          </button>
          <div className="mt-6 text-center space-y-3">
            <p className="text-gray-600">
              Don't have an account?{' '}
              <Link 
                to="/register" 
                className="text-primary-600 hover:text-primary-700 font-medium transition-colors duration-200"
              >
                Create one here
              </Link>
            </p>
          </div>
        </div>
        <div className="text-center space-y-4">
          <div className="flex justify-center space-x-6 text-sm text-gray-600">
            <div className="flex items-center space-x-1">
              <span>🔒</span>
              <span>Secure</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>🎥</span>
              <span>HD Quality</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>⚡</span>
              <span>Fast Connect</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;