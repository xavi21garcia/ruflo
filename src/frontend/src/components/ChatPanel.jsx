import React, { useRef, useEffect } from 'react';

export default function ChatPanel({ messages, status }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-msg chat-msg-${msg.role}`}>
            <div className="msg-header">
              {msg.role === 'agent' && <span className="msg-badge agent">Agente</span>}
              {msg.role === 'system' && <span className="msg-badge system">Sistema</span>}
              {msg.role === 'user' && <span className="msg-badge user">Tu</span>}
              {msg.role === 'question' && <span className="msg-badge question">Pregunta</span>}
              {msg.role === 'error' && <span className="msg-badge error">Error</span>}
              <span className="msg-time">
                {msg.timestamp.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="msg-text">{msg.text}</div>
          </div>
        ))}

        {status === 'running' && messages.length > 0 && (
          <div className="chat-msg chat-msg-typing">
            <div className="typing-dots">
              <span /><span /><span />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

    </div>
  );
}
