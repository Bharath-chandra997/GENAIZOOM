import React, { useState, useRef, useEffect } from 'react';
import './Chat.css';

const Chat = ({ messages, onSendMessage, currentUser, onClose }) => {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    console.log('Chat messages updated:', messages); // Debug log
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      console.log('Submitting message:', newMessage); // Debug log
      onSendMessage(newMessage);
      setNewMessage('');
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  console.log('Current user in chat:', currentUser); // Debug log
  console.log('Messages length:', messages.length); // Debug log

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h3 className="chat-title">Meeting Chat</h3>
        <button
          onClick={onClose}
          className="chat-close"
          title="Close chat"
        >
          ✕
        </button>
      </div>
      
      <div className="chat-messages">
        {messages && messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <div className="chat-empty-title">No messages yet</div>
            <div className="chat-empty-text">Start the conversation!</div>
          </div>
        ) : (
          messages.map((message, index) => {
            console.log('Rendering message:', message); // Debug log
            return (
              <div
                key={message.id || `message-${index}-${message.timestamp}`}
                className={`chat-message ${
                  message.isSystemMessage 
                    ? 'system' 
                    : message.userId === currentUser?.userId 
                      ? 'own' 
                      : 'other'
                }`}
              >
                {message.isSystemMessage ? (
                  <>
                    <div className="message-content">{message.message}</div>
                    <div className="message-time">{formatTime(message.timestamp)}</div>
                  </>
                ) : (
                  <>
                    <div className="message-header">
                      <span className="message-author">
                        {message.userId === currentUser?.userId ? 'You' : message.username}
                      </span>
                      <span className="message-time">{formatTime(message.timestamp)}</span>
                    </div>
                    <div className="message-content">{message.message}</div>
                  </>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="chat-form">
        <div className="chat-input-container">
          <div className="chat-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              maxLength={500}
              className="chat-input"
            />
            <div className="input-footer">
              <div className={`char-counter ${newMessage.length >= 450 ? 'warning' : ''} ${newMessage.length >= 500 ? 'error' : ''}`}>
                {newMessage.length}/500
              </div>
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="chat-send"
                title="Send message"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default Chat;