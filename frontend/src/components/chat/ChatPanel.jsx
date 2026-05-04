import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2 } from 'lucide-react';
import { useDomain } from '../../context/DomainContext';
import { useSettings } from '../../context/SettingsContext';
import api from '../../api';

const GREETING_REGEX = /^(hi|hello|hey|yo|hii+|heyy+)$/i;

const ChatPanel = () => {
  const { theme } = useDomain();
  const { settings } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'ai', text: "Hi! What would you like to ask about your data?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Auto-scroll to the latest message
  const messagesEndRef = useRef(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);

    if (GREETING_REGEX.test(userText)) {
      setMessages(prev => [...prev, { role: 'ai', text: 'Hi! What would you like to ask about your data?' }]);
      return;
    }

    setIsLoading(true);

    try {
      // Make sure this endpoint matches your FastAPI router prefix!
      // If your main.py uses prefix="/api/v1/chat", this should be '/chat/ask'
      const res = await api.post('/chat/ask', { question: userText, model: settings.groqModel });
      
      setMessages(prev => [...prev, { role: 'ai', text: res.data.answer }]);
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: "Sorry, I ran into an error connecting to the database. Check your backend console!" 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 p-4 rounded-full shadow-2xl transition-transform hover:scale-110 z-40 ${theme.primary} text-white`}
      >
        <MessageSquare size={24} />
      </button>

      {/* Sliding Glass Panel */}
      <div 
        className={`fixed top-0 right-0 h-screen w-full sm:w-[450px] backdrop-blur-3xl bg-black/60 border-l border-white/10 shadow-2xl z-50 transition-transform duration-500 ease-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${theme.activePill}`}>
              <Bot size={20} />
            </div>
            <div>
              <h3 className="font-medium text-white">Data Copilot</h3>
              <p className="text-xs text-gray-400 font-light">Powered by Groq & Llama 3</p>
            </div>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Message History */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`shrink-0 p-2 h-fit rounded-full ${msg.role === 'user' ? 'bg-purple-600' : 'bg-white/10'}`}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div 
                className={`px-4 py-3 rounded-2xl max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user' 
                    ? 'bg-purple-600 text-white rounded-tr-none' 
                    : 'bg-white/10 text-gray-200 rounded-tl-none border border-white/5'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 flex-row">
              <div className="shrink-0 p-2 h-fit rounded-full bg-white/10">
                <Bot size={16} />
              </div>
              <div className="px-5 py-4 rounded-2xl bg-white/10 rounded-tl-none flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-gray-400" />
                <span className="text-xs text-gray-400 tracking-widest uppercase">Querying Database...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-5 border-t border-white/10 bg-black/40">
          <div className="relative flex items-center">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your data..."
              className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm rounded-2xl pl-4 pr-12 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none overflow-hidden h-14"
              rows="1"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className={`absolute right-2 p-2 rounded-xl transition-colors ${!input.trim() || isLoading ? 'text-gray-600' : 'text-purple-400 hover:bg-purple-500/20'}`}
            >
              <Send size={18} />
            </button>
          </div>
          <div className="text-center mt-3">
            <span className="text-[10px] text-gray-500">Press Enter to send. Shift + Enter for new line.</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default ChatPanel;
