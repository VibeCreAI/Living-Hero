import { useEffect, useRef } from 'react';

export interface CommunicationMessage {
  id: string;
  sender: 'player' | 'hero' | 'system';
  speakerName: string;
  text: string;
  recipientNames?: string[];
}

interface CommunicationLogProps {
  messages: CommunicationMessage[];
}

export function CommunicationLog({ messages }: CommunicationLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
        border: '1px solid #3b2c18',
        borderRadius: '6px',
        backgroundColor: '#14100dcc',
        fontFamily: '"NeoDunggeunmoPro", monospace',
        fontSize: '14px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          borderBottom: '1px solid #3b2c18',
          color: '#ffd700',
          fontSize: '15px',
        }}
      >
        Communication Log
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px',
          minHeight: '180px',
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#726a5c' }}>Send an order to start the conversation.</div>
        )}
        {messages.filter((m) => m.sender !== 'system').map((message) => (
          <div key={message.id} style={{ marginBottom: '8px' }}>
            <div style={{
              color: message.sender === 'system' ? '#a89060' : message.sender === 'player' ? '#8fc7ff' : '#ffd700',
              marginBottom: '2px',
              fontStyle: message.sender === 'system' ? 'italic' : 'normal',
            }}>
              [{formatSpeaker(message)}]
            </div>
            <div style={{
              color: message.sender === 'system' ? '#a89060' : message.sender === 'player' ? '#d7e7ff' : '#f2efe5',
              fontStyle: message.sender === 'system' ? 'italic' : 'normal',
            }}>
              {message.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSpeaker(message: CommunicationMessage): string {
  if (message.sender === 'player' && message.recipientNames && message.recipientNames.length > 0) {
    return `${message.speakerName} -> ${message.recipientNames.join(', ')}`;
  }

  return message.speakerName;
}
