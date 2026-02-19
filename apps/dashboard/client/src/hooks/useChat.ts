import { useState, useEffect, useCallback } from 'react';
import { apiJson, apiFetch } from '../lib/api.js';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

type ChatHistoryResponse = ChatMessage[];
type ChatSendResponse = { reply: string; timestamp: string };

/**
 * Manages chat state: message history, sending messages, loading state.
 * Fetches history on mount from GET /api/chat/history.
 * sendMessage optimistically appends user message then appends assistant reply.
 */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Load chat history on mount
  useEffect(() => {
    apiJson<ChatHistoryResponse>('/api/chat/history')
      .then((history) => {
        setMessages(history);
        setHistoryLoaded(true);
      })
      .catch(() => {
        // Non-fatal — start with empty history
        setHistoryLoaded(true);
      });
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    // Optimistically append user message
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!response.ok) {
        throw new Error(`Chat error: ${response.status}`);
      }

      const data = (await response.json()) as ChatSendResponse;

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.reply,
        timestamp: data.timestamp,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      // Remove the optimistically added user message on error
      setMessages((prev) => prev.filter((m) => m !== userMessage));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  return { messages, sendMessage, isLoading, historyLoaded };
}
