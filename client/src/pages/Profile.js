import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import LoadingSpinner from '../components/LoadingSpinner';

const Profile = () => {
  const { user, updateProfile, isLoading } = useAuth();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isLoading) return; // Wait for auth to initialize
    if (!user) {
      console.log('Profile: Redirecting to login, user:', user);
      toast.error('Please log in to view your profile');
      navigate('/login');
    } else {
      setFormData({ username: user.username || '' });
    }
  }, [isLoading, user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (formData.username.trim().length < 3) {
      newErrors.username = 'Username must be at least 3 characters long';
    } else if (formData.username.trim().length > 30) {
      newErrors.username = 'Username cannot exceed 30 characters';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.username.trim())) {
      newErrors.username = 'Username can only contain letters, numbers, hyphens, and underscores';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const result = await updateProfile({ username: formData.username.trim() });
      
      if (result.success) {
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Profile update error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({ username: user?.username || '' });
    setErrors({});
    setIsEditing(false);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        
        <div className="text-center mb-8 animate-fade-in">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-bold text-white">
              {user.username?.charAt(0)?.toUpperCase()}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
          <p className="text-gray-600 mt-2">Manage your account information</p>
        </div>

        <div className="space-y-6">
          
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Account Information
              </h2>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-200 transition-colors duration-200 btn-hover"
                >
                  Edit Profile
                </button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                    Username
                  </label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    value={formData.username}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-4 focus:ring-primary-200 transition-all duration-200 ${
                      errors.username 
                        ? 'border-red-300 focus:border-red-500' 
                        : 'border-gray-300 focus:border-primary-500'
                    }`}
                    placeholder="Enter your username"
                  />
                  {errors.username && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <span className="mr-1">⚠️</span>
                      {errors.username}
                    </p>
                  )}
                </div>

                <div className="flex space-x-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-primary-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-hover"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center space-x-2">
                        <LoadingSpinner size="small" color="white" />
                        <span>Saving...</span>
                      </div>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={loading}
                    className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-xl font-semibold hover:bg-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-200 disabled:opacity-50 transition-all duration-200 btn-hover"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Username</span>
                  <span className="text-gray-900 font-medium">{user.username}</span>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Email</span>
                  <span className="text-gray-900">{user.email}</span>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Member Since</span>
                  <span className="text-gray-900">{formatDate(user.createdAt)}</span>
                </div>
                
                {user.lastLogin && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm font-medium text-gray-600">Last Login</span>
                    <span className="text-gray-900">{formatDate(user.lastLogin)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              Account Statistics
            </h2>
            
            <div className="grid sm:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-blue-50 rounded-xl">
                <div className="text-2xl font-bold text-blue-600 mb-1">
                  🎥
                </div>
                <div className="text-sm text-gray-600">HD Video</div>
                <div className="text-xs text-gray-500">Up to 720p</div>
              </div>
              
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <div className="text-2xl font-bold text-green-600 mb-1">
                  👥
                </div>
                <div className="text-sm text-gray-600">Max Participants</div>
                <div className="text-xs text-gray-500">10 people</div>
              </div>
              
              <div className="text-center p-4 bg-purple-50 rounded-xl">
                <div className="text-2xl font-bold text-purple-600 mb-1">
                  💬
                </div>
                <div className="text-sm text-gray-600">Features</div>
                <div className="text-xs text-gray-500">Chat & Screen Share</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              Security & Privacy
            </h2>
            
            <div className="space-y-4 text-sm text-gray-600">
              <div className="flex items-start space-x-3">
                <span className="text-green-500 mt-0.5">✓</span>
                <div>
                  <div className="font-medium text-gray-900">End-to-End Encryption</div>
                  <div>All video calls are encrypted using WebRTC DTLS-SRTP</div>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <span className="text-green-500 mt-0.5">✓</span>
                <div>
                  <div className="font-medium text-gray-900">Secure Authentication</div>
                  <div>Password hashed with bcrypt and secured with JWT tokens</div>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <span className="text-green-500 mt-0.5">✓</span>
                <div>
                  <div className="font-medium text-gray-900">No Data Collection</div>
                  <div>We don't store or analyze your meeting content</div>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <span className="text-green-500 mt-0.5">✓</span>
                <div>
                  <div className="font-medium text-gray-900">Local Storage Only</div>
                  <div>All data is stored locally on your device</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl border border-blue-200 p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Need Help?
            </h2>
            <p className="text-gray-600 mb-6">
              If you have any questions or need assistance with your account, 
              check out our resources or contact support.
            </p>
            
            <div className="grid sm:grid-cols-2 gap-4">
              <button className="flex items-center justify-center space-x-2 p-4 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors duration-200">
                <span className="text-xl">📚</span>
                <span className="font-medium text-gray-900">User Guide</span>
              </button>
              
              <button className="flex items-center justify-center space-x-2 p-4 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors duration-200">
                <span className="text-xl">💬</span>
                <span className="font-medium text-gray-900">Contact Support</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;