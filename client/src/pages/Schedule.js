import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import Navbar from '../components/Navbar'; // Adjust path if necessary

const SERVER_URL = "https://genaizoomserver-0yn4.onrender.com";

const Schedule = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    date: '',
    time: '',
    duration: '30',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoading) return; // Wait for auth to initialize
    console.log('Schedule page rendered, user:', user);
    if (!user) {
      console.log('Schedule: Redirecting to login, user:', user);
      toast.error('Please log in to schedule a meeting');
      navigate('/login');
    }
  }, [isLoading, user, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user?.token) {
      toast.error('Session invalid. Please log in again.');
      navigate('/login');
      return;
    }

    if (!formData.title || !formData.date || !formData.time) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const [year, month, day] = formData.date.split('-');
      const [hours, minutes] = formData.time.split(':');
      const startTime = new Date(year, month - 1, day, hours, minutes);
      
      const response = await axios.post(
        `${SERVER_URL}/api/meetings/schedule`,
        {
          title: formData.title,
          startTime,
          duration: parseInt(formData.duration),
          hostEmail: user.email,
        },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );

      toast.success('Meeting scheduled successfully!');
      navigate(`/meeting/${response.data.meeting.roomId}`);
    } catch (error) {
      console.error('Schedule meeting error:', error);
      const message = error.response?.data?.error || 'Failed to schedule meeting. Please try again.';
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

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-3xl font-bold text-gray-900">Schedule a Meeting</h1>
            <p className="text-gray-600 mt-2">
              Plan your meeting with up to 15 participants
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 animate-slide-up">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                  Meeting Title
                </label>
                <input
                  type="text"
                  name="title"
                  id="title"
                  value={formData.title}
                  onChange={handleChange}
                  className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary-200 focus:border-primary-500 transition-all duration-200 text-gray-900 placeholder-gray-500"
                  placeholder="Enter meeting title"
                  required
                />
              </div>
              <div>
                <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                  Date
                </label>
                <input
                  type="date"
                  name="date"
                  id="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary-200 focus:border-primary-500 transition-all duration-200 text-gray-900"
                  required
                />
              </div>
              <div>
                <label htmlFor="time" className="block text-sm font-medium text-gray-700">
                  Time
                </label>
                <input
                  type="time"
                  name="time"
                  id="time"
                  value={formData.time}
                  onChange={handleChange}
                  className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary-200 focus:border-primary-500 transition-all duration-200 text-gray-900"
                  required
                />
              </div>
              <div>
                <label htmlFor="duration" className="block text-sm font-medium text-gray-700">
                  Duration (minutes)
                </label>
                <select
                  name="duration"
                  id="duration"
                  value={formData.duration}
                  onChange={handleChange}
                  className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary-200 focus:border-primary-500 transition-all duration-200 text-gray-900"
                >
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-hover"
              >
                {loading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <LoadingSpinner size="small" color="white" />
                    <span>Scheduling...</span>
                  </div>
                ) : (
                  'Schedule Meeting'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default Schedule;