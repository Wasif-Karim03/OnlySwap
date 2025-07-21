import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import ChatNotification from './ChatNotification';
import { useNavigate, useLocation } from 'react-router-dom';

interface Conversation {
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  unreadCount: number;
}

interface Message {
  _id: string;
  sender: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  receiver: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  content: string;
  messageType: string;
  isRead: boolean;
  createdAt: string;
}

const ReviewerChatInterface: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get the previous page from location state, or default to reviewer dashboard
  const previousPage = location.state?.from || '/reviewer';
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [lastMessageCount, setLastMessageCount] = useState(0);
  const [lastConversationUpdate, setLastConversationUpdate] = useState(0);
  const [notification, setNotification] = useState({ message: '', isVisible: false });
  const [isTyping, setIsTyping] = useState(false);
  const [activeStatus, setActiveStatus] = useState('');
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [searchingMessages, setSearchingMessages] = useState(false);

  // Filter conversations based on search
  const filteredConversations = conversations.filter(conversation =>
    conversation.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conversation.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    fetchConversations();
    
    // Set up polling for conversations (every 5 seconds)
    const conversationInterval = setInterval(() => {
      fetchConversations();
    }, 5000);

    return () => {
      clearInterval(conversationInterval);
    };
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.userId);
      
      // Set up polling for messages (every 3 seconds)
      const messageInterval = setInterval(() => {
        fetchMessages(selectedConversation.userId);
      }, 3000);

      return () => {
        clearInterval(messageInterval);
      };
    }
  }, [selectedConversation]);

  // Poll typing and active status
  useEffect(() => {
    let typingInterval: NodeJS.Timeout;
    let activeInterval: NodeJS.Timeout;
    if (selectedConversation) {
      const fetchTyping = async () => {
        try {
          const res = await axios.get(`/api/chat/typing/${selectedConversation.userId}`);
          setIsTyping(res.data.isTyping);
        } catch {}
      };
      const fetchActive = async () => {
        try {
          const res = await axios.get(`/api/auth/user/${selectedConversation.userId}/active`);
          setActiveStatus(res.data.activeStatus);
        } catch {}
      };
      
      typingInterval = setInterval(fetchTyping, 2000);
      activeInterval = setInterval(fetchActive, 5000);
      
      return () => {
        clearInterval(typingInterval);
        clearInterval(activeInterval);
      };
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    // Send typing status
    if (selectedConversation) {
      clearTimeout(typingTimeout.current!);
      axios.post(`/api/chat/typing/${selectedConversation.userId}`, { isTyping: true });
      
      typingTimeout.current = setTimeout(() => {
        axios.post(`/api/chat/typing/${selectedConversation.userId}`, { isTyping: false });
      }, 2000);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async () => {
    try {
      const response = await axios.get('/api/chat/conversations');
      const newConversations = response.data.conversations;
      
      // Only update if there are actual changes
      if (JSON.stringify(newConversations) !== JSON.stringify(conversations)) {
        setConversations(newConversations);
        setLastConversationUpdate(Date.now());
      }
      
      // Set loading to false after first successful fetch
      if (loading) {
        setLoading(false);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      setLoading(false);
    }
  };

  const fetchMessages = async (userId: string) => {
    try {
      const response = await axios.get(`/api/chat/messages/${userId}`);
      const newMessages = response.data.messages;
      
      // Always update messages to ensure we have the latest data
      // This prevents messages from disappearing when new ones arrive
      setMessages(newMessages);
      
      // Check if we have new messages for notifications
      if (newMessages.length > lastMessageCount) {
        // If this is a new message from someone else, scroll to bottom and show notification
        setTimeout(() => scrollToBottom(), 100);
        
        // Show notification for new message
        const newMessage = newMessages[newMessages.length - 1];
        if (newMessage.sender._id !== user?.id) {
          setNotification({
            message: `New message from ${newMessage.sender.name}`,
            isVisible: true
          });
        }
      }
      
      // Update the last message count
      setLastMessageCount(newMessages.length);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation || sending) return;

    setSending(true);
    try {
      await axios.post('/api/chat/messages', {
        receiverId: selectedConversation.userId,
        content: newMessage.trim()
      });
      
      setNewMessage('');
      // Refresh messages immediately
      await fetchMessages(selectedConversation.userId);
      
      setNotification({
        message: 'Message sent successfully!',
        isVisible: true
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setNotification({
        message: 'Failed to send message. Please try again.',
        isVisible: true
      });
    } finally {
      setSending(false);
    }
  };

  // Search messages function
  const searchMessages = async () => {
    if (!messageSearchQuery.trim() || !selectedConversation) return;
    
    setSearchingMessages(true);
    try {
      const response = await axios.get(`/api/chat/messages/${selectedConversation.userId}/search?query=${encodeURIComponent(messageSearchQuery)}`);
      // For now, just show a notification with results count
      setNotification({
        message: `Found ${response.data.messages.length} messages matching "${messageSearchQuery}"`,
        isVisible: true
      });
    } catch (error) {
      console.error('Failed to search messages:', error);
    } finally {
      setSearchingMessages(false);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Smart back navigation function
  const handleBackNavigation = () => {
    navigate(previousPage);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <ChatNotification
        message={notification.message}
        isVisible={notification.isVisible}
        onClose={() => setNotification({ message: '', isVisible: false })}
      />
      <div className="max-w-6xl mx-auto">
        <div className="card">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center space-x-4">
              {/* Back Button */}
              <button
                onClick={handleBackNavigation}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                title={`Back to ${previousPage === '/reviewer' ? 'Reviewer Dashboard' : 'Previous Page'}`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Admin Chat
                </h1>
                <p className="text-gray-600">
                  Contact administrators for support
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Live updates enabled</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
            {/* Conversations List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Administrators</h3>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search administrators..."
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              <div className="overflow-y-auto h-full">
                {filteredConversations.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    {searchQuery ? 'No administrators found matching your search' : 'No administrators found'}
                  </div>
                ) : (
                  filteredConversations.map((conversation) => (
                    <div
                      key={conversation.userId}
                      onClick={() => setSelectedConversation(conversation)}
                      className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedConversation?.userId === conversation.userId ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        {conversation.avatar ? (
                          <img
                            src={conversation.avatar}
                            alt={conversation.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                            {getInitials(conversation.name)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-gray-900 truncate">
                              {conversation.name}
                            </h4>
                            {conversation.unreadCount > 0 && (
                              <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center animate-pulse">
                                {conversation.unreadCount}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {conversation.email}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Chat Area */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[600px]">
              {selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b border-gray-200 shrink-0">
                    <div className="flex items-center space-x-3 mb-3">
                      {/* Back Button */}
                      <button
                        onClick={() => setSelectedConversation(null)}
                        className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Back to conversations"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      
                      {/* Existing avatar and user info */}
                      {selectedConversation.avatar ? (
                        <img
                          src={selectedConversation.avatar}
                          alt={selectedConversation.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                          {selectedConversation.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{selectedConversation.name}</h3>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500">{selectedConversation.email}</span>
                          <div className={`w-2 h-2 rounded-full ${activeStatus === 'online' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                          <span className="text-xs text-gray-400">
                            {activeStatus === 'online' ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={messageSearchQuery}
                        onChange={(e) => setMessageSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && searchMessages()}
                        placeholder="Search messages in this conversation..."
                        className="w-full px-3 py-2 pl-10 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                      <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      {messageSearchQuery && (
                        <button
                          onClick={searchMessages}
                          disabled={searchingMessages}
                          className="absolute right-2 top-1.5 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 disabled:opacity-50"
                        >
                          {searchingMessages ? '...' : 'Search'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((message) => {
                      const isOwnMessage = message.sender._id === user?.id;
                      return (
                        <div
                          key={message._id}
                          className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl shadow-sm animate-pop-in ${
                              isOwnMessage
                                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                                : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800'
                            }`}
                          >
                            <div className="text-sm">{message.content}</div>
                            <div className={`text-xs mt-1 ${isOwnMessage ? 'text-pink-100' : 'text-blue-400'} text-right opacity-70`}>{formatTime(message.createdAt)}</div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message Input */}
                  <div className="p-4 border-t border-gray-200 shrink-0">
                    <form onSubmit={sendMessage} className="flex space-x-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={handleInputChange}
                        placeholder="Type your message..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={sending}
                      />
                      <button
                        type="submit"
                        disabled={!newMessage.trim() || sending}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {sending ? 'Sending...' : 'Send'}
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <h3 className="text-lg font-medium mb-2">Select an administrator to start chatting</h3>
                    <p className="text-sm">Choose an admin from the list to begin a conversation</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewerChatInterface; 