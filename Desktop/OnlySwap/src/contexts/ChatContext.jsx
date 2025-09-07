import React, { createContext, useContext, useState, useEffect } from 'react';

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);

  // Load chats from localStorage on mount
  useEffect(() => {
    const savedChats = localStorage.getItem('onlyswap_chats');
    if (savedChats) {
      try {
        setChats(JSON.parse(savedChats));
      } catch (error) {
        console.error('Error loading chats:', error);
      }
    }
  }, []);

  // Save chats to localStorage whenever chats change
  useEffect(() => {
    localStorage.setItem('onlyswap_chats', JSON.stringify(chats));
  }, [chats]);

  // Create or get existing chat with a seller
  const startChat = (productId, sellerName, sellerId, productTitle, productImage) => {
    const chatId = `${productId}_${sellerId}`;
    
    // Check if chat already exists
    const existingChat = chats.find(chat => chat.id === chatId);
    if (existingChat) {
      setActiveChat(existingChat);
      return existingChat;
    }

    // Create new chat
    const newChat = {
      id: chatId,
      productId,
      sellerName,
      sellerId,
      productTitle,
      productImage,
      messages: [],
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString()
    };

    setChats(prev => [newChat, ...prev]);
    setActiveChat(newChat);
    return newChat;
  };

  // Send a message
  const sendMessage = (chatId, message, senderId, senderName) => {
    const newMessage = {
      id: Date.now().toString(),
      text: message,
      senderId,
      senderName,
      timestamp: new Date().toISOString()
    };

    setChats(prev => prev.map(chat => 
      chat.id === chatId 
        ? {
            ...chat,
            messages: [...chat.messages, newMessage],
            lastMessageAt: new Date().toISOString()
          }
        : chat
    ));

    // Update active chat if it's the current one
    if (activeChat && activeChat.id === chatId) {
      setActiveChat(prev => ({
        ...prev,
        messages: [...prev.messages, newMessage],
        lastMessageAt: new Date().toISOString()
      }));
    }
  };

  // Get chat by ID
  const getChat = (chatId) => {
    return chats.find(chat => chat.id === chatId);
  };

  // Get all chats for current user
  const getUserChats = (userId) => {
    return chats.filter(chat => 
      chat.messages.some(msg => msg.senderId === userId) || 
      chat.sellerId === userId
    );
  };

  // Delete a chat
  const deleteChat = (chatId) => {
    setChats(prev => prev.filter(chat => chat.id !== chatId));
    if (activeChat && activeChat.id === chatId) {
      setActiveChat(null);
    }
  };

  const value = {
    chats,
    activeChat,
    setActiveChat,
    startChat,
    sendMessage,
    getChat,
    getUserChats,
    deleteChat
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};
