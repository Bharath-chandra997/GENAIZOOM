import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import Navbar from '../components/Navbar';
import './Feedback.css';

const SERVER_URL = 'https://genaizoomserver-0yn4.onrender.com';

const Feedback = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      toast.error('Please log in to submit feedback');
      navigate('/login');
    } else {
      setFormData(prev => ({ ...prev, email: user.email || '' }));
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user?.token) {
      toast.error('Session invalid. Please log in again.');
      navigate('/login');
      return;
    }

    if (!formData.email || !formData.message) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (formData.message.length < 10) {
      toast.error('Message must be at least 10 characters long');
      return;
    }

    if (formData.message.length > 1000) {
      toast.error('Message must be less than 1000 characters');
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${SERVER_URL}/api/feedback`,
        formData,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );

      toast.success('Feedback submitted successfully!');
      setFormData({ email: user.email || '', message: '' });
    } catch (error) {
      console.error('Submit feedback error:', error);
      const message = error.response?.data?.error || 'Failed to submit feedback. Please try again.';
      if (error.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
        navigate('/login');
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
        <LoadingSpinner size="large" color="primary" />
      </div>
    );
  }

  return (
    <div className="feedback min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <Navbar />
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Feedback</h1>
            <p className="text-xl text-gray-600">
              Help us improve your experience by sharing your thoughts
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 animate-slide-up">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary-200 focus:border-primary-500 transition-all duration-200 text-gray-900"
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                  Feedback Message
                </label>
                <textarea
                  name="message"
                  id="message"
                  rows={6}
                  value={formData.message}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary-200 focus:border-primary-500 transition-all duration-200 text-gray-900 resize-none"
                  placeholder="Tell us about your experience, suggestions, or any issues you encountered..."
                  required
                />
                <div className="mt-2 text-sm text-gray-500">
                  {formData.message.length}/1000 characters
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-primary-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-hover"
                >
                  {loading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <LoadingSpinner size="small" color="white" />
                      <span>Submitting...</span>
                    </div>
                  ) : (
                    'Submit Feedback'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/home')}
                  className="px-6 py-4 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-gray-200 transition-all duration-200 btn-hover"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>

          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 text-lg">💡</span>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Tips for better feedback</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Be specific about what you liked or didn't like</li>
                  <li>• Mention any bugs or issues you encountered</li>
                  <li>• Suggest improvements or new features</li>
                  <li>• Include your device/browser information if reporting technical issues</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Feedback;
