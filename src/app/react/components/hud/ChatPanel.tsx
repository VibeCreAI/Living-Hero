import { useEffect, useState, useRef } from 'react';
import { EventBus } from '../../../../game/EventBus';

interface ChatMessage {
  sender: 'player' | 'hero';
  name: string;
  text: string;
}

interface HeroChatEvent {
  heroId: string;
  heroName: string;
  message: string;
}

interface PlayerEchoEvent {
  text: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const heroHandler = (event: HeroChatEvent) => {
      setMessages((prev) => [
        ...prev,
        { sender: 'hero', name: event.heroName, text: event.message },
      ]);
    };
    const playerEchoHandler = (event: PlayerEchoEvent) => {
      setMessages((prev) => [...prev, { sender: 'player', name: 'You', text: event.text }]);
    };

    EventBus.on('hero-chat-response', heroHandler);
    EventBus.on('player-chat-message-echo', playerEchoHandler);
    return () => {
      EventBus.removeListener('hero-chat-response', heroHandler);
      EventBus.removeListener('player-chat-message-echo', playerEchoHandler);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { sender: 'player', name: 'You', text }]);
    EventBus.emit('player-chat-message', text);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Stop all key events from reaching Phaser while typing
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '200px',
        border: '1px solid #444',
        borderRadius: '4px',
        backgroundColor: '#1a1a2e',
        fontFamily: '"NeoDunggeunmoPro", monospace',
        fontSize: '11px',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '4px 8px',
          borderBottom: '1px solid #444',
          color: '#ffd700',
          fontSize: '12px',
        }}
      >
        Commander Chat
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 8px',
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#666', fontStyle: 'italic' }}>
            Type a message to talk to your hero...
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '3px' }}>
            <span
              style={{
                color: msg.sender === 'player' ? '#4488ff' : '#ffd700',
                fontWeight: 'bold',
              }}
            >
              [{msg.name}]
            </span>{' '}
            <span style={{ color: msg.sender === 'player' ? '#aaccff' : '#eee' }}>
              {msg.text}
            </span>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', borderTop: '1px solid #444' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onKeyUp={(e) => e.stopPropagation()}
          onKeyPress={(e) => e.stopPropagation()}
          placeholder="Type message..."
          style={{
            flex: 1,
            padding: '4px 8px',
            backgroundColor: '#0d0d1a',
            color: '#ccc',
            border: 'none',
            outline: 'none',
            fontFamily: '"NeoDunggeunmoPro", monospace',
            fontSize: '11px',
          }}
        />
        <button
          onClick={sendMessage}
          style={{
            padding: '4px 10px',
            backgroundColor: '#333',
            color: '#ffd700',
            border: 'none',
            borderLeft: '1px solid #444',
            cursor: 'pointer',
            fontFamily: '"NeoDunggeunmoPro", monospace',
            fontSize: '11px',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
