import React, { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket.js';
import SearchForm from './components/SearchForm.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import AgentTimeline from './components/AgentTimeline.jsx';
import Header from './components/Header.jsx';

export default function App() {
  const { connected, messages, agents, status, question, startSearch, sendUserResponse } = useWebSocket();
  const [started, setStarted] = useState(false);

  const handleSubmit = (params) => {
    setStarted(true);
    startSearch(params);
  };

  return (
    <div className="app">
      <Header connected={connected} status={status} />
      <div className="app-body">
        {!started ? (
          <div className="welcome-container">
            <div className="welcome-card">
              <h2>Buscador de Normativas de Edificacion</h2>
              <p>
                Sistema de busqueda que identifica, busca, valida y documenta
                las normativas aplicables a tu proyecto de construccion.
              </p>
              <SearchForm onSubmit={handleSubmit} disabled={!connected} />
            </div>
          </div>
        ) : (
          <div className="workspace">
            <aside className="sidebar">
              <AgentTimeline agents={agents} />
              {(status === 'completed' || status === 'partial' || status === 'error') && (
                <button className="btn btn-new" onClick={() => { setStarted(false); }}>
                  Nueva busqueda
                </button>
              )}
            </aside>
            <main className="main-chat">
              <ChatPanel messages={messages} status={status} />
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
