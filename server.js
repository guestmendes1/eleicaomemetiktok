const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { WebcastPushConnection } = require('tiktok-live-connector');

const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use(express.json());

// Rota raiz com fallback inteligente
app.get('/', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(publicIndex)) {
    res.sendFile(publicIndex);
  } else if (fs.existsSync(rootIndex)) {
    res.sendFile(rootIndex);
  } else {
    res.status(404).send(`
      <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #0c101c; color: #fff; min-height: 100vh;">
        <h2 style="color: #ffcb05;">⚠️ A pasta "public" nao foi encontrada no GitHub!</h2>
        <p style="color: #94a3b8; margin: 20px 0;">No seu repositorio do GitHub, faltou arrastar a pasta <b>public</b> (que contem o <code>index.html</code>, <code>style.css</code> e <code>app.js</code>).</p>
        <p style="color: #38ef7d;">Basta arrastar a pasta <b>public</b> para o seu GitHub e o Render vai atualizar sozinho!</p>
      </div>
    `);
  }
});

// Game State
let gameState = {
  scoreLeft: 0,       // 13
  scoreRight: 0,      // 22
  targetScore: 1200,  // Meta para zerar
  totalGiftsLeft: 0,
  totalGiftsRight: 0,
  timerSeconds: 9 * 60 + 26, // 09:26 inicial
  isLiveConnected: false,
  tiktokUsername: '',
  recentEvents: [],
  winner: null
};

// TikTok Live Client
let tiktokConnection = null;

// Timer interval
setInterval(() => {
  if (gameState.timerSeconds > 0) {
    gameState.timerSeconds--;
  } else {
    gameState.timerSeconds = 15 * 60; // loop de 15 minutos se zerar
  }
  broadcast({ type: 'TIMER_UPDATE', timerSeconds: gameState.timerSeconds });
}, 1000);

function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function checkWinCondition() {
  const maxScore = Math.max(gameState.scoreLeft, gameState.scoreRight);
  // Zera se qualquer um ou o total chegar na meta configurada (1200)
  if (maxScore >= gameState.targetScore && !gameState.winner) {
    gameState.winner = gameState.scoreLeft > gameState.scoreRight ? '13' : '22';
    broadcast({
      type: 'WINNER',
      winner: gameState.winner,
      scoreLeft: gameState.scoreLeft,
      scoreRight: gameState.scoreRight
    });

    // Aguarda 6 segundos para mostrar a festa de vitória e reinicia
    setTimeout(() => {
      resetGame();
    }, 6000);
  }
}

function resetGame() {
  gameState.scoreLeft = 0;
  gameState.scoreRight = 0;
  gameState.totalGiftsLeft = 0;
  gameState.totalGiftsRight = 0;
  gameState.winner = null;
  gameState.recentEvents = [];
  broadcast({ type: 'GAME_RESET', state: gameState });
}

function addPoints(side, points, user, reason, count = 1) {
  if (gameState.winner) return;

  if (side === 'left') {
    gameState.scoreLeft += points;
    if (reason.toLowerCase().includes('rosa')) gameState.totalGiftsLeft += count;
  } else if (side === 'right') {
    gameState.scoreRight += points;
    if (reason.toLowerCase().includes('rosa')) gameState.totalGiftsRight += count;
  }

  const eventItem = {
    id: Date.now() + Math.random(),
    side,
    points,
    user: user || 'Anônimo',
    reason,
    count,
    timestamp: new Date().toLocaleTimeString('pt-BR')
  };

  gameState.recentEvents.unshift(eventItem);
  if (gameState.recentEvents.length > 20) gameState.recentEvents.pop();

  broadcast({
    type: 'POINTS_ADDED',
    side,
    points,
    user: eventItem.user,
    reason,
    count,
    state: gameState
  });

  checkWinCondition();
}

// Conectar ao TikTok Live
function connectToTikTok(username) {
  if (!username) return;

  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
    } catch (e) {
      console.error('Erro ao desconectar conexão anterior:', e);
    }
  }

  gameState.tiktokUsername = username.replace('@', '').trim();
  tiktokConnection = new WebcastPushConnection(gameState.tiktokUsername, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    requestPollingIntervalMs: 1000,
    clientParams: {
      app_language: 'pt-BR',
      device_platform: 'web'
    }
  });

  tiktokConnection.connect().then(state => {
    gameState.isLiveConnected = true;
    console.log(`Conectado à live do TikTok de: @${gameState.tiktokUsername}`);
    broadcast({ type: 'TIKTOK_STATUS', connected: true, username: gameState.tiktokUsername });
  }).catch(err => {
    gameState.isLiveConnected = false;
    console.error('Falha ao conectar no TikTok:', err.message);
    broadcast({ type: 'TIKTOK_STATUS', connected: false, error: err.message });
  });

  // Mensagens do Chat
  tiktokConnection.on('chat', data => {
    const comment = (data.comment || '').trim();
    const user = data.nickname || data.uniqueId || 'Espectador';

    // Regra: Comentar 13 = 1 ponto pra esquerda
    if (comment === '13' || comment.startsWith('13 ')) {
      addPoints('left', 1, user, 'Comentou 13');
    }
    // Regra: Comentar 22 = 1 ponto pra direita
    else if (comment === '22' || comment.startsWith('22 ')) {
      addPoints('right', 1, user, 'Comentou 22');
    }
  });

  // Rastreador de combos/streaks de presentes
  const giftStreaks = new Map();

  // Presentes / Gifts
  tiktokConnection.on('gift', data => {
    const user = data.nickname || data.uniqueId || 'Apoiador';
    const rawGiftName = data.giftName || '';
    const giftName = rawGiftName.toLowerCase();
    const repeatCount = data.repeatCount || 1;
    const streakKey = `${data.userId || user}_${data.giftId || rawGiftName}`;

    let addedCount = repeatCount;
    // Trata combos/streaks progressivos do TikTok sem duplicar pontos
    if (data.giftType === 1 && !data.repeatEnd) {
      const prev = giftStreaks.get(streakKey) || 0;
      addedCount = repeatCount - prev;
      giftStreaks.set(streakKey, repeatCount);
    } else if (data.repeatEnd) {
      const prev = giftStreaks.get(streakKey) || 0;
      addedCount = repeatCount - prev;
      giftStreaks.delete(streakKey);
    }

    if (addedCount <= 0) addedCount = 1;

    console.log(`🎁 [TIKTOK GIFT] "${rawGiftName}" (x${addedCount}) enviado por @${user}`);

    // Regras de Presentes Oficiais:
    // 1. Rosa Branca (White Rose / Rosa Branca) -> DIREITA (22) = 5 pontos por presente
    // 2. Rosa tradicional (Rose / Rosa) -> ESQUERDA (13) = 5 pontos por presente
    if (giftName.includes('branca') || giftName.includes('white')) {
      const pts = 5 * addedCount;
      addPoints('right', pts, user, `Rosa Branca x${addedCount}`, addedCount);
    } else if (giftName.includes('rose') || giftName.includes('rosa')) {
      const pts = 5 * addedCount;
      addPoints('left', pts, user, `Rosa x${addedCount}`, addedCount);
    } else if (giftName.includes('coracao') || giftName.includes('coração') || giftName.includes('heart')) {
      // Suporte extra caso usem Coração pro lado direito se White Rose não estiver na lista regional
      const pts = 5 * addedCount;
      addPoints('right', pts, user, `Coração x${addedCount}`, addedCount);
    }
  });

  tiktokConnection.on('disconnected', () => {
    gameState.isLiveConnected = false;
    broadcast({ type: 'TIKTOK_STATUS', connected: false });
  });

  tiktokConnection.on('error', err => {
    console.error('Erro na conexão TikTok:', err);
  });
}

// WebSocket connection handler
wss.on('connection', ws => {
  // Envia estado atual ao conectar novo cliente (overlay ou admin)
  ws.send(JSON.stringify({ type: 'INIT_STATE', state: gameState }));

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      if (data.action === 'CONNECT_TIKTOK') {
        connectToTikTok(data.username);
      } else if (data.action === 'DISCONNECT_TIKTOK') {
        if (tiktokConnection) {
          tiktokConnection.disconnect();
          gameState.isLiveConnected = false;
          broadcast({ type: 'TIKTOK_STATUS', connected: false });
        }
      } else if (data.action === 'ADD_POINTS') {
        addPoints(data.side, data.points, data.user, data.reason, data.count || 1);
      } else if (data.action === 'RESET_GAME') {
        resetGame();
      } else if (data.action === 'SET_TARGET') {
        gameState.targetScore = parseInt(data.target) || 1200;
        broadcast({ type: 'TARGET_UPDATED', target: gameState.targetScore });
      }
    } catch (e) {
      console.error('Erro ao processar mensagem ws:', e);
    }
  });
});

server.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(` JOGO TIKTOK LIVE STUDIO PRONTO!`);
  console.log(` Opcao 1 (IP Local):       http://127.0.0.1:${PORT}`);
  console.log(` Opcao 2 (IP da Rede):     http://192.168.18.152:${PORT}`);
  console.log(` Opcao 3 (Localhost):      http://localhost:${PORT}`);
  console.log(` Painel de Controle:       http://127.0.0.1:${PORT}/admin.html`);
  console.log(`====================================================`);

  // Tenta gerar URL HTTPS publica caso o TikTok Live Studio exija link com dominio
  try {
    const localtunnel = require('localtunnel');
    const tunnel = await localtunnel({ port: PORT });
    console.log(` URL Publica HTTPS (Para o TikTok Studio): ${tunnel.url}`);
    console.log(`====================================================`);
  } catch (err) {
    // localtunnel opcional
  }
});
