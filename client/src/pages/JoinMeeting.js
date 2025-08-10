import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';

const JoinMeeting = () => {
  const { roomId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      toast.error('Please log in to join a meeting');
      navigate('/login');
      return;
    }
    // Directly join (assuming no waiting room or handle in Meeting)
    navigate(`/meeting/${roomId}`);
  }, [user, navigate, roomId]);

  return <div>Joining meeting...</div>;
};

export default JoinMeeting;