import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import Navbar from '../components/Navbar'; // Adjust path if necessary

const SERVER_URL = "https://genaizoomserver-0yn4.onrender.com";

const History = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalMeetings: 0,
  });

  const fetchMeetings = async (page = 1) => {
    try {
      setLoading(true);
      const response = await axios.get(`${SERVER_URL}/api/meetings/user/history?page=${page}&limit=10`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setMeetings(response.data.meetings);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Fetch meetings error:', error);
      const message = error.response?.data?.error || 'Failed to load meeting history';
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

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      console.log('History: Redirecting to login, user:', user);
      toast.error('Please log in to view your meeting history');
      navigate('/login');
      return;
    }
    fetchMeetings();
  }, [isLoading, user, navigate]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchMeetings(newPage);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const calculateDuration = (startDate, endDate) => {
    if (!endDate) return 'Ongoing';
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationMs = end - start;
    const minutes = Math.floor(durationMs / (1000 * 60));
    if (minutes < 60) {
      return `${minutes} min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
  };

  const handleRejoinMeeting = (roomId) => {
    navigate(`/join/${roomId}`);
  };

  if (loading && meetings.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="large" />
          <p className="text-gray-600 mt-4">Loading meeting history...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Meeting History</h1>
            <p className="text-gray-600">View and rejoin your past meetings</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">{pagination.totalMeetings}</div>
              <div className="text-sm text-gray-600">Total Meetings</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">{meetings.filter((m) => m.isHost).length}</div>
              <div className="text-sm text-gray-600">Meetings Hosted</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">{meetings.filter((m) => !m.isHost).length}</div>
              <div className="text-sm text-gray-600">Meetings Joined</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Recent Meetings</h2>
            </div>
            {loading ? (
              <div className="p-8 text-center">
                <LoadingSpinner size="medium" />
                <p className="text-gray-600 mt-2">Loading meetings...</p>
              </div>
            ) : meetings.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-6xl mb-4">📋</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No meetings yet</h3>
                <p className="text-gray-600 mb-6">Start by creating or joining your first meeting</p>
                <button
                  onClick={() => navigate('/home')}
                  className="bg-primary-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-200 transition-colors duration-200 btn-hover"
                >
                  Create Meeting
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {meetings.map((meeting) => {
                  const { date, time } = formatDate(meeting.createdAt);
                  const duration = calculateDuration(meeting.createdAt, meeting.endedAt);
                  return (
                    <div key={meeting.roomId} className="p-6 hover:bg-gray-50 transition-colors duration-200">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900 truncate">{meeting.title}</h3>
                            <div className="flex items-center space-x-2">
                              {meeting.isHost && (
                                <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-1 rounded">
                                  Host
                                </span>
                              )}
                              <span
                                className={`text-xs font-medium px-2 py-1 rounded ${
                                  meeting.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {meeting.isActive ? 'Active' : 'Ended'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-6 text-sm text-gray-600">
                            <div className="flex items-center space-x-1">
                              <span>📅</span>
                              <span>{date}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <span>🕒</span>
                              <span>{time}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <span>👥</span>
                              <span>{meeting.participantCount} participants</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <span>⏱️</span>
                              <span>{duration}</span>
                            </div>
                          </div>
                          <div className="mt-2">
                            <span className="text-xs text-gray-500">Meeting ID:</span>
                            <code className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded ml-1">
                              {meeting.roomId}
                            </code>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3 ml-4">
                          {meeting.isActive && (
                            <button
                              onClick={() => handleRejoinMeeting(meeting.roomId)}
                              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-200 transition-colors duration-200 btn-hover"
                            >
                              Rejoin
                            </button>
                          )}
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(meeting.roomId);
                              toast.success('Meeting ID copied to clipboard');
                            }}
                            className="text-gray-400 hover:text-gray-600 p-2 transition-colors duration-200"
                            title="Copy meeting ID"
                          >
                            <span className="text-lg">📋</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {meetings.length > 0 && pagination.totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Page {pagination.currentPage} of {pagination.totalPages}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={!pagination.hasPrev}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={!pagination.hasNext}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="mt-8 text-center">
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => navigate('/home')}
                className="bg-primary-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-200 transition-colors duration-200 btn-hover"
              >
                Create New Meeting
              </button>
              <button
                onClick={() => navigate('/schedule')}
                className="bg-white text-gray-700 border border-gray-200 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-gray-200 transition-colors duration-200 btn-hover"
              >
                Schedule Meeting
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default History;