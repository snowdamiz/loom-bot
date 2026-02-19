import { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat.js';

/**
 * Persistent sidebar chat panel.
 * Fixed 320px width, displays chat history, allows sending messages.
 * Auto-scrolls to the latest message on new messages.
 */
export function SidebarChat() {
  const { messages, sendMessage, isLoading } = useChat();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;
    void sendMessage(trimmed);
    setInputValue('');
  }

  return (
    <div className="sidebar-chat">
      <div className="chat-header">
        <span className="chat-header-title">Agent Chat</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty">No messages yet. Say hello to your agent.</p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`chat-message chat-message--${msg.role}`}
          >
            <div className="chat-bubble">{msg.content}</div>
            <div className="chat-timestamp">{formatTimestamp(msg.timestamp)}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message the agent..."
          disabled={isLoading}
          className="chat-input"
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !inputValue.trim()}
          className="chat-send-btn"
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
