import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';

const UserGuide = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: '🎥',
      title: 'HD Video Meetings',
      description: 'Crystal clear video calls with up to 15 participants'
    },
    {
      icon: '🎤',
      title: 'High-Quality Audio',
      description: 'Clear voice communication with noise cancellation'
    },
    {
      icon: '🖥️',
      title: 'Screen Sharing',
      description: 'Share your screen with participants for presentations'
    },
    {
      icon: '💬',
      title: 'Live Chat',
      description: 'Send messages during meetings for better collaboration'
    },
    {
      icon: '🤖',
      title: 'AI Assistant',
      description: 'Get AI-powered insights and predictions during meetings'
    },
    {
      icon: '📅',
      title: 'Meeting Scheduling',
      description: 'Schedule meetings in advance with automatic reminders'
    }
  ];

  const faqs = [
    {
      question: 'How many participants can join a meeting?',
      answer: 'You can have up to 15 participants in a single meeting for optimal performance.'
    },
    {
      question: 'Do I need to install any software?',
      answer: 'No installation required! Our platform works directly in your web browser.'
    },
    {
      question: 'How do I share my screen?',
      answer: 'Click the screen share button in the meeting controls. You can share your entire screen or a specific application window.'
    },
    {
      question: 'Can I record meetings?',
      answer: 'Currently, we don\'t support meeting recording, but this feature is planned for future updates.'
    },
    {
      question: 'How do I use the AI Assistant?',
      answer: 'Click the AI Assistant button to upload an image and audio file. The AI will analyze them and provide insights.'
    },
    {
      question: 'What browsers are supported?',
      answer: 'We support Chrome, Firefox, Safari, and Edge. For the best experience, we recommend using the latest version of Chrome.'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <Navbar />
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">User Guide</h1>
            <p className="text-xl text-gray-600">
              Everything you need to know about using our AI-powered meeting platform
            </p>
          </div>

          {/* App Purpose */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 mb-8 animate-slide-up">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🚀</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">About Our Platform</h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                Our AI-powered meeting and collaboration platform brings together advanced video conferencing 
                with intelligent assistance. Whether you're hosting team meetings, client calls, or educational 
                sessions, our platform provides the tools you need for seamless communication and collaboration.
              </p>
            </div>
          </div>

          {/* Features */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 mb-8 animate-slide-up">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Key Features</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <div key={index} className="text-center p-6 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors duration-200">
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* How to Use */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 mb-8 animate-slide-up">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">How to Get Started</h2>
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-semibold">
                  1
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Create or Join a Meeting</h3>
                  <p className="text-gray-600">
                    Start a new meeting instantly or join an existing one using a meeting ID. 
                    You can also schedule meetings for later.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-semibold">
                  2
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Invite Participants</h3>
                  <p className="text-gray-600">
                    Share the meeting link or meeting ID with your participants. 
                    They can join directly from their browser without any downloads.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-semibold">
                  3
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Use AI Features</h3>
                  <p className="text-gray-600">
                    Upload images and audio files to get AI-powered insights and predictions. 
                    Perfect for analysis, brainstorming, and decision-making.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-semibold">
                  4
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Collaborate Effectively</h3>
                  <p className="text-gray-600">
                    Use screen sharing, live chat, and other collaboration tools to make 
                    your meetings more productive and engaging.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 mb-8 animate-slide-up">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Pro Tips</h2>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 text-sm">✓</span>
                  </div>
                  <p className="text-gray-700">Use a good internet connection for the best video quality</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 text-sm">✓</span>
                  </div>
                  <p className="text-gray-700">Test your camera and microphone before joining</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 text-sm">✓</span>
                  </div>
                  <p className="text-gray-700">Use headphones to avoid echo and feedback</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 text-sm">✓</span>
                  </div>
                  <p className="text-gray-700">Mute yourself when not speaking to reduce background noise</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 text-sm">✓</span>
                  </div>
                  <p className="text-gray-700">Use the chat feature for questions and links</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 text-sm">✓</span>
                  </div>
                  <p className="text-gray-700">Schedule meetings in advance for better attendance</p>
                </div>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 mb-8 animate-slide-up">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Frequently Asked Questions</h2>
            <div className="space-y-6">
              {faqs.map((faq, index) => (
                <div key={index} className="border-b border-gray-200 pb-4 last:border-b-0">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{faq.question}</h3>
                  <p className="text-gray-600">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="text-center animate-slide-up">
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => navigate('/home')}
                className="bg-primary-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-200 transition-all duration-200 btn-hover"
              >
                Start a Meeting
              </button>
              <button
                onClick={() => navigate('/schedule')}
                className="bg-white text-primary-600 border-2 border-primary-600 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-primary-50 focus:outline-none focus:ring-4 focus:ring-primary-200 transition-all duration-200 btn-hover"
              >
                Schedule Meeting
              </button>
              <button
                onClick={() => navigate('/feedback')}
                className="bg-gray-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 transition-all duration-200 btn-hover"
              >
                Send Feedback
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserGuide;
