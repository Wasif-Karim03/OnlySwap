import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, MessageCircle, User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';

const Chat = () => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getChat, sendMessage, activeChat, setActiveChat } = useChat();
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (chatId) {
      const chatData = getChat(chatId);
      if (chatData) {
        setChat(chatData);
        setActiveChat(chatData);
      } else {
        // Chat not found, redirect to marketplace
        navigate('/marketplace');
      }
    }
  }, [chatId, getChat, setActiveChat, navigate]);

  useEffect(() => {
    if (activeChat && activeChat.id === chatId) {
      setChat(activeChat);
    }
  }, [activeChat, chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [chat?.messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim() || !chat || !user) return;

    sendMessage(chat.id, message.trim(), user.id, user.name);
    setMessage('');
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!chat || !user) {
    return (
      <div className="chat-loading">
        <div className="loading-spinner"></div>
        <p>Loading chat...</p>
      </div>
    );
  }

  const isSeller = chat.sellerId === user.id;
  const otherParticipant = isSeller ? 
    chat.messages.find(msg => msg.senderId !== user.id)?.senderName || 'Buyer' :
    chat.sellerName;

  return (
    <div className="chat-page">
      <div className="chat-container">
        {/* Chat Header */}
        <div className="chat-header">
          <button 
            className="back-button"
            onClick={() => navigate('/marketplace')}
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="chat-header-info">
            <div className="product-info">
              <img 
                src={chat.productImage} 
                alt={chat.productTitle}
                className="product-thumbnail"
              />
              <div className="product-details">
                <h3>{chat.productTitle}</h3>
                <p>Chatting with {otherParticipant}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="messages-container">
          {chat.messages.length === 0 ? (
            <div className="no-messages">
              <MessageCircle size={48} />
              <p>Start a conversation about this item!</p>
            </div>
          ) : (
            <div className="messages-list">
              {chat.messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`message ${msg.senderId === user.id ? 'sent' : 'received'}`}
                >
                  <div className="message-content">
                    <div className="message-text">{msg.text}</div>
                    <div className="message-time">{formatTime(msg.timestamp)}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Input */}
        <form className="message-input-form" onSubmit={handleSendMessage}>
          <div className="message-input-container">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Message ${otherParticipant}...`}
              className="message-input"
              maxLength={500}
            />
            <button 
              type="submit" 
              className="send-button"
              disabled={!message.trim()}
            >
              <Send size={20} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Chat;
