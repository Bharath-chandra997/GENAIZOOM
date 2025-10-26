import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css'
/**
 * Navigation bar component with responsive design and authentication handling
 */
const Navbar = () => {
  const { user, isAuthenticated, logout, isDarkMode, toggleDarkMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setIsMobileMenuOpen(false);
  };

  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Don't show navbar on login/register pages or in meeting rooms
  const hiddenPaths = ['/login', '/register'];
  const isInMeeting = location.pathname.startsWith('/meeting/');
  
  if (hiddenPaths.includes(location.pathname) || isInMeeting) {
    return null;
  }

  const navLinks = [
    { path: '/home', label: 'Home', icon: '🏠' },
    { path: '/schedule', label: 'Schedule', icon: '📅' },
    { path: '/profile', label: 'Profile', icon: '👤' },
    { path: '/feedback', label: 'Feedback', icon: '💬' },
    { path: '/guide', label: 'User Guide', icon: '📖' }
  ];

  return (
    <nav className="bg-white shadow-lg border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-2">
            <Link 
              to="/" 
              className="flex items-center space-x-2 text-primary-600 hover:text-primary-700 transition-colors duration-200"
              onClick={closeMobileMenu}
            >
              <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center text-white font-bold">
                C
              </div>
              <span className="text-xl font-bold hidden sm:block">
                Convoco
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          {isAuthenticated && (
            <div className="hidden md:flex items-center space-x-6">
              {navLinks.map(({ path, label, icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={`
                    flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200
                    ${location.pathname === path
                      ? 'bg-primary-50 text-gray-900 border border-primary-200 font-semibold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }
                  `}
                >
                  <span className="text-base">{icon}</span>
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          )}

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <div className="flex items-center space-x-3">
                {/* User Info - Desktop */}
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-sm font-medium text-gray-900">
                    {user?.username}
                  </span>
                  <span className="text-xs text-gray-500">
                    {user?.email}
                  </span>
                </div>

                {/* User Avatar */}
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>

                {/* Logout Button - Desktop */}
                <button
                  onClick={handleLogout}
                  className="hidden md:flex items-center space-x-1 px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors duration-200"
                >
                  <span>Logout</span>
                  <span className="text-lg">🚪</span>
                </button>

                {/* Dark Mode Toggle - Last Element */}
                <button
                  onClick={toggleDarkMode}
                  className={`p-2 rounded-full transition-all duration-300 ${
                    isDarkMode 
                      ? 'bg-yellow-500 hover:bg-yellow-600' 
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                  title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  <span className={`text-lg ${isDarkMode ? '' : 'text-gray-700'}`}>
                    {isDarkMode ? '☀️' : '🌙'}
                  </span>
                </button>

                {/* Mobile Menu Button */}
                <button
                  onClick={handleMobileMenuToggle}
                  className="md:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isMobileMenuOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors duration-200"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors duration-200 btn-hover"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {isAuthenticated && isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="py-2 space-y-1">
              {/* User Info */}
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-semibold">
                      {user?.username?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {user?.username}
                      </div>
                      <div className="text-xs text-gray-500">
                        {user?.email}
                      </div>
                    </div>
                  </div>
                  {/* Dark Mode Toggle in Mobile Menu */}
                  <button
                    onClick={toggleDarkMode}
                    className={`p-2 rounded-full transition-all duration-300 ${
                      isDarkMode 
                        ? 'bg-yellow-500 hover:bg-yellow-600' 
                        : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                    title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  >
                    <span className={`text-lg ${isDarkMode ? '' : 'text-gray-700'}`}>
                      {isDarkMode ? '☀️' : '🌙'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Navigation Links */}
              {navLinks.map(({ path, label, icon }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={closeMobileMenu}
                  className={`
                    flex items-center space-x-3 px-4 py-3 text-sm font-medium transition-colors duration-200
                    ${location.pathname === path
                      ? 'bg-primary-50 text-gray-900 border-r-2 border-primary-500 font-semibold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }
                  `}
                >
                  <span className="text-lg">{icon}</span>
                  <span>{label}</span>
                </Link>
              ))}

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors duration-200"
              >
                <span className="text-lg">🚪</span>
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;