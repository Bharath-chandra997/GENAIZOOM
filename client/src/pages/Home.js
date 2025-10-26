import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import Navbar from '../components/Navbar';
import { motion, AnimatePresence } from 'framer-motion';

const SERVER_URL = 'https://genaizoomserver-0yn4.onrender.com';

const Home = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [scheduledMeetings, setScheduledMeetings] = useState([]);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage for saved preference or default to system preference
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return JSON.parse(saved);
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (isLoading) return; // Wait for auth to initialize
    if (!isAuthenticated || !user) {
      console.log('Home: Redirecting to login, isAuthenticated:', isAuthenticated, 'user:', user);
      toast.error('Please log in to access the home page');
      navigate('/login');
    } else {
      fetchScheduledMeetings();
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  // Dark mode effect
  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  const fetchScheduledMeetings = async () => {
    if (!user?.token) return;
    try {
      const response = await axios.get(`${SERVER_URL}/api/meetings/scheduled`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      setScheduledMeetings(response.data.meetings);
    } catch (error) {
      console.error('Error fetching scheduled meetings:', error);
    }
  };

  const formatTimeRemaining = (scheduledStart) => {
    const now = new Date();
    const startTime = new Date(scheduledStart);
    const diff = startTime - now;
    
    if (diff <= 0) return 'Ready to start';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const handleStartMeeting = (meeting) => {
    setSelectedMeeting(meeting);
    setIsStartModalOpen(true);
  };

  const confirmStartMeeting = () => {
    if (selectedMeeting) {
      navigate(`/meeting/${selectedMeeting.roomId}`);
    }
  };

  const cancelMeeting = async (meeting) => {
    try {
      await axios.delete(`${SERVER_URL}/api/meetings/scheduled/${meeting.roomId}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      toast.success('Meeting canceled successfully');
      fetchScheduledMeetings();
    } catch (error) {
      console.error('Error canceling meeting:', error);
      toast.error('Failed to cancel meeting');
    }
  };

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
        `${SERVER_URL}/api/meetings`,
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
      color: 'bg-blue-500 hover:bg-blue-600 border-blue-500 text-white hover:text-white',
    },
    {
      title: 'Meeting History',
      description: 'View past meetings',
      icon: '📋',
      action: () => navigate('/history'),
      color: 'bg-green-500 hover:bg-green-600 border-green-500 text-white hover:text-white',
    },
    {
      title: 'Profile Settings',
      description: 'Update your profile',
      icon: '⚙️',
      action: () => navigate('/profile'),
      color: 'bg-purple-500 hover:bg-purple-600 border-purple-500 text-white hover:text-white',
    },
  ];

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900 to-gray-800' 
        : 'bg-gradient-to-br from-gray-50 to-blue-50'
    }`}>
      <Navbar />
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Dark Mode Toggle */}
          <div className="flex justify-end mb-6">
            <button
              onClick={toggleDarkMode}
              className={`p-3 rounded-full transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white' 
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>
          </div>

          <div className="text-center mb-12 animate-fade-in">
            <h1 className={`text-4xl sm:text-5xl font-bold mb-4 transition-colors duration-300 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Welcome back, {user?.username || 'User'}! 👋
            </h1>
            <p className={`text-xl mb-4 transition-colors duration-300 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              Email: {user?.email || 'Not available'}
            </p>
            <p className={`text-xl mb-8 transition-colors duration-300 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              Start a meeting or join one to connect with your team
            </p>
            <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors duration-300 ${
              isDarkMode 
                ? 'bg-green-900 text-green-200' 
                : 'bg-green-100 text-green-800'
            }`}>
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
              Online and ready to connect
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className={`rounded-2xl shadow-lg border p-8 hover:shadow-xl transition-all duration-300 animate-slide-up ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}>
              <div className="text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
                  isDarkMode ? 'bg-blue-900' : 'bg-blue-100'
                }`}>
                  <span className="text-3xl">🎥</span>
                </div>
                <h2 className={`text-2xl font-bold mb-4 transition-colors duration-300 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Start New Meeting
                </h2>
                <p className={`mb-8 transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Create a new meeting room and invite up to 15 participants
                </p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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

            <div className={`rounded-2xl shadow-lg border p-8 hover:shadow-xl transition-all duration-300 animate-slide-up ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}>
              <div className="text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
                  isDarkMode ? 'bg-green-900' : 'bg-green-100'
                }`}>
                  <span className="text-3xl">🚪</span>
                </div>
                <h2 className={`text-2xl font-bold mb-4 transition-colors duration-300 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Join Meeting
                </h2>
                <p className={`mb-8 transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Enter a meeting ID to join an existing room
                </p>
                <form onSubmit={handleJoinMeeting} className="space-y-4">
                  <input
                    type="text"
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value)}
                    placeholder="Enter Meeting ID"
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all duration-200 ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                  <button
                    type="submit"
                    className="w-full bg-green-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-200 transition-all duration-200"
                  >
                    Join Meeting
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Scheduled Meetings */}
          <AnimatePresence>
            {scheduledMeetings.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-12"
              >
                <h3 className={`text-2xl font-bold text-center mb-8 transition-colors duration-300 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Scheduled Meetings
                </h3>
                <div className="grid gap-4">
                  {scheduledMeetings.map((meeting, index) => {
                    const timeRemaining = formatTimeRemaining(meeting.scheduledStart);
                    const isReady = timeRemaining === 'Ready to start';
                    
                    return (
                      <motion.div 
                        key={meeting.roomId}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        whileHover={{ scale: 1.02 }}
                        className={`rounded-xl shadow-lg border p-6 hover:shadow-xl transition-all duration-200 ${
                          isDarkMode 
                            ? 'bg-gray-800 border-gray-700' 
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className={`text-lg font-semibold mb-2 transition-colors duration-300 ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`}>
                              {meeting.title}
                            </h4>
                            <div className={`flex items-center space-x-4 text-sm transition-colors duration-300 ${
                              isDarkMode ? 'text-gray-300' : 'text-gray-600'
                            }`}>
                              <span>📅 {new Date(meeting.scheduledStart).toLocaleDateString()}</span>
                              <span>🕒 {new Date(meeting.scheduledStart).toLocaleTimeString()}</span>
                              <span>⏱️ {meeting.duration} minutes</span>
                            </div>
                            <div className="mt-2">
                              <motion.span 
                                animate={isReady ? { scale: [1, 1.1, 1] } : {}}
                                transition={{ duration: 2, repeat: Infinity }}
                                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                  isReady 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {isReady ? '🚀 Ready to start' : `⏰ ${timeRemaining} remaining`}
                              </motion.span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3 ml-4">
                            {isReady && (
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleStartMeeting(meeting)}
                                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-200 transition-all duration-200 btn-hover"
                              >
                                Start Meeting
                              </motion.button>
                            )}
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => cancelMeeting(meeting)}
                              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-200 transition-all duration-200 btn-hover"
                            >
                              Cancel
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mb-12">
            <h3 className="text-2xl font-bold text-gray-900 text-center mb-8">Quick Actions</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.action}
                  className={`p-6 rounded-xl border-2 ${action.color} transition-all duration-200 btn-hover text-left group shadow-lg hover:shadow-xl`}
                >
                  <div className="flex items-start space-x-4">
                    <div className="text-2xl group-hover:animate-bounce-gentle">{action.icon}</div>
                    <div>
                      <h4 className="font-semibold mb-1">{action.title}</h4>
                      <p className="text-sm opacity-90">{action.description}</p>
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
            <div className={`inline-flex items-center px-6 py-3 rounded-full text-sm transition-colors duration-300 ${
              isDarkMode 
                ? 'bg-blue-900 text-blue-200' 
                : 'bg-blue-50 text-blue-800'
            }`}>
              <span className="mr-2">ℹ️</span>
              Maximum 15 participants per meeting for optimal performance
            </div>
          </div>

          {/* Meeting Title Modal */}
          {isModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className={`rounded-2xl p-6 w-full max-w-md transition-colors duration-300 ${
                isDarkMode ? 'bg-gray-800' : 'bg-white'
              }`}>
                <h2 className={`text-2xl font-bold mb-4 transition-colors duration-300 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Create New Meeting
                </h2>
                <div className="mb-4">
                  <label htmlFor="meetingTitle" className={`block text-sm font-medium mb-2 transition-colors duration-300 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Meeting Title
                  </label>
                  <input
                    id="meetingTitle"
                    type="text"
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                    placeholder="Enter meeting title"
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all duration-200 ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleCreateMeeting}
                    disabled={loading}
                    className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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

          {/* Start Meeting Modal */}
          {isStartModalOpen && selectedMeeting && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Start Meeting</h2>
                <div className="mb-6">
                  <p className="text-gray-600 mb-2">Ready to start your scheduled meeting:</p>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900">{selectedMeeting.title}</h3>
                    <p className="text-sm text-gray-600">
                      Scheduled for {new Date(selectedMeeting.scheduledStart).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={confirmStartMeeting}
                    className="flex-1 bg-green-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-200 transition-all duration-200 btn-hover"
                  >
                    Start Meeting
                  </button>
                  <button
                    onClick={() => {
                      setIsStartModalOpen(false);
                      setSelectedMeeting(null);
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