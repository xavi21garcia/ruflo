import React from 'react';

const STATUS_LABELS = {
  idle: 'En espera',
  running: 'Buscando...',
  completed: 'Completado',
  partial: 'Parcial',
  error: 'Error',
};

export default function Header({ connected, status }) {
  return (
    <header className="header">
      <div className="header-left">
        <h1>Normativas</h1>
      </div>
      <div className="header-right">
        {status !== 'idle' && (
          <span className={`status-badge status-${status}`}>
            {STATUS_LABELS[status]}
          </span>
        )}
        <span className={`connection-dot ${connected ? 'online' : 'offline'}`} />
      </div>
    </header>
  );
}
