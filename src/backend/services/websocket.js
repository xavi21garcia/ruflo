import { v4 as uuidv4 } from 'uuid';
import { startSearch, cancelSession } from './orchestrator.js';

function safeSend(ws, data) {
  try {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  } catch {
    // connection already closed
  }
}

export function handleConnection(ws) {
  const connectionId = uuidv4();
  let activeSessionId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      safeSend(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'start_search': {
        if (!msg.pais || !msg.region || !msg.sector) {
          safeSend(ws, { type: 'error', message: 'Campos requeridos: pais, region, sector' });
          return;
        }
        activeSessionId = uuidv4();
        const sendMessage = (data) => safeSend(ws, data);
        startSearch(activeSessionId, {
          pais: msg.pais,
          region: msg.region,
          sector: msg.sector,
          ciudad: msg.ciudad || '',
          carpetaDescarga: msg.carpetaDescarga || '',
          mock: msg.mock || false,
        }, sendMessage);
        break;
      }

      case 'user_response': {
        safeSend(ws, { type: 'agent_message', message: `Respuesta recibida: ${msg.message}` });
        break;
      }

      default:
        safeSend(ws, { type: 'error', message: `Unknown type: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    if (activeSessionId) {
      cancelSession(activeSessionId);
    }
    activeSessionId = null;
  });

  ws.on('error', () => {
    if (activeSessionId) {
      cancelSession(activeSessionId);
    }
    activeSessionId = null;
  });

  safeSend(ws, { type: 'connected', connectionId });
}
