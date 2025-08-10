import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import Navbar from '../components/Navbar';

const Home = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');

  useEffect(() => {
    if (isLoading) return; // Wait for auth to initialize
    if (!isAuthenticated || !user) {
      console.log('Home: Redirecting to login, isAuthenticated:', isAuthenticated, 'user:', user);
      toast.error('Please log in to access the home page');
      navigate('/login');
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
        <LoadingSpinner size="large" color="primary" />
      </div>
    );
  }

  const handleCreateMeeting = async () => {
    if (!meetingTitle.trim()) {
      toast.error('Please enter a meeting title');
      return;
    }
    if (!user?.token) {
      toast.error('Session invalid. Please log in again.');
      navigate('/login');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        '/api/meetings',
        { title: meetingTitle.trim() },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );

      const { roomId } = response.data.meeting;
      toast.success('Meeting created successfully!');
      setIsModalOpen(false);
      setMeetingTitle('');
      navigate(`/meeting/${roomId}`);
    } catch (error) {
      console.error('Create meeting error:', error);
      const message = error.response?.data?.error || 'Failed to create meeting. Please try again.';
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

  const handleJoinMeeting = (e) => {
    e.preventDefault();
    if (!joinRoomId.trim()) {
      toast.error('Please enter a meeting ID');
      return;
    }
    navigate(`/join/${joinRoomId.trim()}`);
  };

  const quickActions = [
    {
      title: 'Schedule Meeting',
      description: 'Plan a meeting for later',
      icon: '📅',
      action: () => navigate('/schedule'),
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
    },
    {
      title: 'Meeting History',
      description: 'View past meetings',
      icon: '📋',
      action: () => navigate('/history'),
      color: 'bg-green-50 hover:bg-green-100 border-green-200',
    },
    {
      title: 'Profile Settings',
      description: 'Update your profile',
      icon: '⚙️',
      action: () => navigate('/profile'),
      color: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <Navbar />
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              Welcome back, {user?.username || 'User'}! 👋
            </h1>
            <p className="text-xl text-gray-600 mb-4">Email: {user?.email || 'Not available'}</p>
            <p className="text-xl text-gray-600 mb-8">Start a meeting or join one to connect with your team</p>
            <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
              Online and ready to connect
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 hover:shadow-xl transition-all duration-300 animate-slide-up">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-3xl">🎥</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Start New Meeting</h2>
                <p className="text-gray-600 mb-8">Create a new meeting room and invite up to 15 participants</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  disabled={loading}
                  className="w-full bg-primary-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-hover"
                >
                  {loading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <LoadingSpinner size="small" color="white" />
                      <span>Creating Meeting...</span>
                    </div>
                  ) : (
                    'Create Meeting Room'
                  )}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 hover:shadow-xl transition-all duration-300 animate-slide-up">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-3xl">🚪</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Join Meeting</h2>
                <p className="text-gray-600 mb-8">Enter a meeting ID to join an existing room</p>
                <form onSubmit={handleJoinMeeting} className="space-y-4">
                  <input
                    type="text"
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value)}
                    placeholder="Enter Meeting ID"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary-200 focus:border-primary-500 transition-all duration-200"
                  />
                  <button
                    type="submit"
                    className="w-full bg-green-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-200 transition-all duration-200 btn-hover"
                  >
                    Join Meeting
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="mb-12">
            <h3 className="text-2xl font-bold text-gray-900 text-center mb-8">Quick Actions</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.action}
                  className={`p-6 rounded-xl border-2 ${action.color} transition-all duration-200 btn-hover text-left group`}
                >
                  <div className="flex items-start space-x-4">
                    <div className="text-2xl group-hover:animate-bounce-gentle">{action.icon}</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">{action.title}</h4>
                      <p className="text-sm text-gray-600">{action.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
            <h3 className="text-2xl font-bold text-gray-900 text-center mb-8">Meeting Features</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: '🎤', title: 'HD Audio', desc: 'Crystal clear voice' },
                { icon: '📹', title: 'HD Video', desc: 'Up to 720p quality' },
                { icon: '💬', title: 'Live Chat', desc: 'Real-time messaging' },
                { icon: '🖥️', title: 'Screen Share', desc: 'Share your screen' },
              ].map((feature, index) => (
                <div key={index} className="text-center p-4">
                  <div className="text-3xl mb-3">{feature.icon}</div>
                  <h4 className="font-semibold text-gray-900 mb-1">{feature.title}</h4>
                  <p className="text-sm text-gray-600">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 text-center">
            <div className="inline-flex items-center px-6 py-3 bg-blue-50 text-blue-800 rounded-full text-sm">
              <span className="mr-2">ℹ️</span>
              Maximum 15 participants per meeting for optimal performance
            </div>
          </div>

          {/* Meeting Title Modal */}
          {isModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Meeting</h2>
                <div className="mb-4">
                  <label htmlFor="meetingTitle" className="block text-sm font-medium text-gray-700 mb-2">
                    Meeting Title
                  </label>
                  <input
                    id="meetingTitle"
                    type="text"
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                    placeholder="Enter meeting title"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary-200 focus:border-primary-500 transition-all duration-200"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleCreateMeeting}
                    disabled={loading}
                    className="flex-1 bg-primary-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-hover"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center space-x-2">
                        <LoadingSpinner size="small" color="white" />
                        <span>Creating...</span>
                      </div>
                    ) : (
                      'Create Meeting'
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      setMeetingTitle('');
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-xl font-semibold hover:bg-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-200 transition-all duration-200 btn-hover"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;