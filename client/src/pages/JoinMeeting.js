import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';

const JoinMeeting = () => {
  const { roomId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('JoinMeeting effect running', { roomId, user: user ? 'present' : 'null' });
    
    if (!roomId) {
      console.error('JoinMeeting: No roomId in params');
      toast.error('Invalid meeting link. Please check the meeting ID.');
      navigate('/home');
      return;
    }
    
    if (!user) {
      console.error('JoinMeeting: User not authenticated');
      toast.error('Please log in to join a meeting');
      navigate('/login');
      return;
    }
    
    console.log('JoinMeeting: Redirecting to meeting room:', roomId);
    // Directly join (assuming no waiting room or handle in Meeting)
    navigate(`/meeting/${roomId}`);
  }, [user, navigate, roomId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">🔄</div>
        <p className="text-xl text-gray-700">Joining meeting...</p>
      </div>
    </div>
  );
};

export default JoinMeeting;