// ============================================================
// WEBSOCKET & ESTADO DO JOGO
// ============================================================
let socket;
let audioCtx = null;
let soundEnabled = true;

const state = {
  scoreLeft: 0,
  scoreRight: 0,
  targetScore: 1200,
  totalGiftsLeft: 0,
  totalGiftsRight: 0,
  timerSeconds: 9 * 60 + 26,
  isLiveConnected: false,
  tiktokUsername: 'mendeescriolo'
};

// ============================================================
// ELEMENTOS DO DOM
// ============================================================
const clockDisplay = document.getElementById('clockDisplay');
const statTotal = document.getElementById('statTotal');
const statDiff = document.getElementById('statDiff');
const leaderPill = document.getElementById('leaderPill');
const leaderText = document.getElementById('leaderText');
const targetDisplay = document.getElementById('targetDisplay');
const goalPercent = document.getElementById('goalPercent');
const goalBarFill = document.getElementById('goalBarFill');

// Cards
const scoreLeftEl = document.getElementById('scoreLeft');
const scoreRightEl = document.getElementById('scoreRight');
const percentLeftEl = document.getElementById('percentLeft');
const percentRightEl = document.getElementById('percentRight');
const progressLeftEl = document.getElementById('progressLeft');
const progressRightEl = document.getElementById('progressRight');
const giftsLeftEl = document.getElementById('giftsLeft');
const giftsRightEl = document.getElementById('giftsRight');
const frontBadgeLeft = document.getElementById('frontBadgeLeft');
const frontBadgeRight = document.getElementById('frontBadgeRight');
const tickerTextLeft = document.getElementById('tickerTextLeft');
const tickerTextRight = document.getElementById('tickerTextRight');
const floatContainerLeft = document.getElementById('floatContainerLeft');
const floatContainerRight = document.getElementById('floatContainerRight');

// Cenário da Mesa e Urnas
const tableStage = document.getElementById('tableStage');
const urnaWrapL = document.getElementById('urnaWrapL');
const urnaWrapR = document.getElementById('urnaWrapR');

// Tela da Urna Esquerda (13)
const urnaDigitL1 = document.getElementById('urnaDigitL1');
const urnaDigitL2 = document.getElementById('urnaDigitL2');
const keyL1 = document.getElementById('keyL1');
const keyL3 = document.getElementById('keyL3');
const btnConfirmaL = document.getElementById('btnConfirmaL');

// Tela da Urna Direita (22)
const urnaDigitR1 = document.getElementById('urnaDigitR1');
const urnaDigitR2 = document.getElementById('urnaDigitR2');
const keyR2 = document.getElementById('keyR2');
const btnConfirmaR = document.getElementById('btnConfirmaR');

// Mãos Realistas
const handLeft = document.getElementById('handLeft');
const handRight = document.getElementById('handRight');

// Áudio da Urna Oficial (5 segundos enviado pelo usuário)
const urnaAudioPlayer = document.getElementById('urnaAudioPlayer');

// Modal de Vitória
const victoryModal = document.getElementById('victoryModal');
const victoryTitle = document.getElementById('victoryTitle');
const resetCountdownEl = document.getElementById('resetCountdown');
const confettiCanvas = document.getElementById('confettiCanvas');

// Streamer Dock
const dockToggle = document.getElementById('dockToggle');
const streamerDock = document.getElementById('streamerDock');
const closeDock = document.getElementById('closeDock');
const dockTiktokUser = document.getElementById('dockTiktokUser');
const btnDockConnect = document.getElementById('btnDockConnect');
const dockStatus = document.getElementById('dockStatus');
const soundToggle = document.getElementById('soundToggle');

// ============================================================
// SISTEMA DE ÁUDIO
// ============================================================
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Som curto ao teclar o número na urna (bip mecânico / eletrônico suave)
function playKeyBeep() {
  if (!soundEnabled) return;
  try {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {}
}

// Som autêntico da Urna de 5s no CONFIRMA
function playUrnaSound() {
  if (!soundEnabled) return;
  try {
    if (urnaAudioPlayer) {
      urnaAudioPlayer.currentTime = 0;
      urnaAudioPlayer.play().catch(() => {});
    }
  } catch (e) {
    console.warn('Erro ao tocar áudio da urna:', e);
  }
}

// Som de Vitória / Fanfarra
function playVictorySound() {
  if (!soundEnabled) return;
  try {
    initAudio();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const startTime = audioCtx.currentTime + idx * 0.12;
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);

      osc.start(startTime);
      osc.stop(startTime + 0.45);
    });
  } catch (e) {}
}

// ============================================================
// FÍSICA E ANIMAÇÃO DA MÃO DIGITANDO NA URNA
// ============================================================

// Calcula coordenadas do dedo indicador exatamente sobre o centro da tecla
function getFingertipTarget(handEl, keyEl, isRight) {
  const stageRect = tableStage.getBoundingClientRect();
  const keyRect = keyEl.getBoundingClientRect();

  const keyCenterX = keyRect.left + keyRect.width / 2 - stageRect.left;
  const keyCenterY = keyRect.top + keyRect.height / 2 - stageRect.top;

  const handW = handEl.offsetWidth || 82;
  const handH = handEl.offsetHeight || 123;

  // No PNG da mão, a ponta do dedo indicador fica a ~53% da largura e ~4% do topo
  const fingerX = isRight ? handW * 0.47 : handW * 0.53;
  const fingerY = handH * 0.04;

  return {
    x: keyCenterX - fingerX,
    y: keyCenterY - fingerY
  };
}

// Posição de repouso das mãos (na parte de baixo da mesa)
function setHandToRest(handEl, isRight) {
  const stageRect = tableStage.getBoundingClientRect();
  const urna = isRight ? urnaWrapR : urnaWrapL;
  const urnaRect = urna.getBoundingClientRect();

  const urnaCenterX = urnaRect.left + urnaRect.width / 2 - stageRect.left;
  const handW = handEl.offsetWidth || 82;
  const posX = urnaCenterX - handW / 2 + (isRight ? 18 : -18);
  const posY = stageRect.height - 35; // Mostra o punho descansando na borda inferior

  handEl.style.transform = `translate3d(${posX}px, ${posY}px, 0)`;
}

// Inicializa posições de repouso
function initHandPositions() {
  setHandToRest(handLeft, false);
  setHandToRest(handRight, true);
}

// Fila e controle de animação para não sobrepor
let isAnimatingLeft = false;
let isAnimatingRight = false;

// Animação Física Lado Esquerdo: Digita 1 -> 3 -> CONFIRMA -> Som 5s
function animateVoteLeft() {
  if (isAnimatingLeft) return;
  isAnimatingLeft = true;

  // 1. Dedo vai até a tecla '1'
  const target1 = getFingertipTarget(handLeft, keyL1, false);
  handLeft.style.transform = `translate3d(${target1.x}px, ${target1.y}px, 0)`;

  setTimeout(() => {
    // Tecla '1' é pressionada
    playKeyBeep();
    keyL1.classList.add('pressed');
    urnaDigitL1.textContent = '1';
    urnaDigitL1.classList.add('typed');
    setTimeout(() => {
      keyL1.classList.remove('pressed');
      urnaDigitL1.classList.remove('typed');
    }, 120);

    // 2. Dedo vai até a tecla '3'
    setTimeout(() => {
      const target3 = getFingertipTarget(handLeft, keyL3, false);
      handLeft.style.transform = `translate3d(${target3.x}px, ${target3.y}px, 0)`;

      setTimeout(() => {
        // Tecla '3' é pressionada
        playKeyBeep();
        keyL3.classList.add('pressed');
        urnaDigitL2.textContent = '3';
        urnaDigitL2.classList.add('typed');
        setTimeout(() => {
          keyL3.classList.remove('pressed');
          urnaDigitL2.classList.remove('typed');
        }, 120);

        // 3. Dedo vai até a tecla 'CONFIRMA'
        setTimeout(() => {
          const targetConf = getFingertipTarget(handLeft, btnConfirmaL, false);
          handLeft.style.transform = `translate3d(${targetConf.x}px, ${targetConf.y}px, 0)`;

          setTimeout(() => {
            // CONFIRMA é pressionada e toca o som oficial de 5s da urna!
            playUrnaSound();
            btnConfirmaL.classList.add('pressed-green');

            setTimeout(() => {
              btnConfirmaL.classList.remove('pressed-green');
              // Mão retorna suavemente para o repouso
              setHandToRest(handLeft, false);

              // Limpa tela da urna após 1.2s para o próximo voto
              setTimeout(() => {
                urnaDigitL1.textContent = '_';
                urnaDigitL2.textContent = '_';
                isAnimatingLeft = false;
              }, 1200);

            }, 300);

          }, 240);

        }, 180);

      }, 240);

    }, 180);

  }, 220);
}

// Animação Física Lado Direito: Digita 2 -> 2 -> CONFIRMA -> Som 5s
function animateVoteRight() {
  if (isAnimatingRight) return;
  isAnimatingRight = true;

  // 1. Dedo vai até a tecla '2'
  const target2 = getFingertipTarget(handRight, keyR2, true);
  handRight.style.transform = `translate3d(${target2.x}px, ${target2.y}px, 0)`;

  setTimeout(() => {
    // Tecla '2' é pressionada (primeiro dígito)
    playKeyBeep();
    keyR2.classList.add('pressed');
    urnaDigitR1.textContent = '2';
    urnaDigitR1.classList.add('typed');
    setTimeout(() => {
      keyR2.classList.remove('pressed');
      urnaDigitR1.classList.remove('typed');
    }, 120);

    // 2. Dedo recua ligeiramente e aperta a tecla '2' novamente (segundo dígito)
    setTimeout(() => {
      // Pequeno recuo de clique
      handRight.style.transform = `translate3d(${target2.x}px, ${target2.y - 8}px, 0)`;

      setTimeout(() => {
        // Toca no 2 novamente
        handRight.style.transform = `translate3d(${target2.x}px, ${target2.y}px, 0)`;
        playKeyBeep();
        keyR2.classList.add('pressed');
        urnaDigitR2.textContent = '2';
        urnaDigitR2.classList.add('typed');

        setTimeout(() => {
          keyR2.classList.remove('pressed');
          urnaDigitR2.classList.remove('typed');
        }, 120);

        // 3. Dedo vai até a tecla 'CONFIRMA'
        setTimeout(() => {
          const targetConf = getFingertipTarget(handRight, btnConfirmaR, true);
          handRight.style.transform = `translate3d(${targetConf.x}px, ${targetConf.y}px, 0)`;

          setTimeout(() => {
            // CONFIRMA é pressionada e toca o som oficial de 5s da urna!
            playUrnaSound();
            btnConfirmaR.classList.add('pressed-green');

            setTimeout(() => {
              btnConfirmaR.classList.remove('pressed-green');
              // Mão retorna suavemente para o repouso
              setHandToRest(handRight, true);

              // Limpa tela da urna após 1.2s para o próximo voto
              setTimeout(() => {
                urnaDigitR1.textContent = '_';
                urnaDigitR2.textContent = '_';
                isAnimatingRight = false;
              }, 1200);

            }, 300);

          }, 240);

        }, 180);

      }, 120);

    }, 180);

  }, 220);
}

// Dispara a animação física de acordo com o lado
function triggerPhysicalVoting(side) {
  if (side === 'left') {
    animateVoteLeft();
  } else if (side === 'right') {
    animateVoteRight();
  }
}

// ============================================================
// PONTOS FLUTUANTES (+1, +5)
// ============================================================
function spawnFloatingPoint(container, points) {
  const el = document.createElement('div');
  el.className = 'floating-point-el';
  el.textContent = `+${points}`;
  el.style.right = `${Math.random() * 20 - 10}px`;
  el.style.top = `${Math.random() * 10 - 5}px`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// ============================================================
// ATUALIZAÇÃO DA UI & PLACAR
// ============================================================
function updateUI() {
  scoreLeftEl.textContent = state.scoreLeft;
  scoreRightEl.textContent = state.scoreRight;
  targetDisplay.textContent = state.targetScore;
  giftsLeftEl.textContent = `🎁 ${state.totalGiftsLeft} presentes`;
  giftsRightEl.textContent = `🎁 ${state.totalGiftsRight} presentes`;

  const total = state.scoreLeft + state.scoreRight;
  statTotal.textContent = total;
  statDiff.textContent = Math.abs(state.scoreLeft - state.scoreRight);

  // Porcentagens
  let pLeft = 50;
  let pRight = 50;
  if (total > 0) {
    pLeft = (state.scoreLeft / total) * 100;
    pRight = (state.scoreRight / total) * 100;
  }
  percentLeftEl.textContent = `${pLeft.toFixed(1)}%`;
  percentRightEl.textContent = `${pRight.toFixed(1)}%`;
  progressLeftEl.style.width = `${pLeft}%`;
  progressRightEl.style.width = `${pRight}%`;

  // Barra de Meta até 1200 Pontos
  const maxScore = Math.max(state.scoreLeft, state.scoreRight);
  const goalPerc = Math.min(100, (maxScore / state.targetScore) * 100);
  goalBarFill.style.width = `${goalPerc}%`;
  goalPercent.textContent = `${Math.floor(goalPerc)}%`;

  // Indicador de Liderança
  if (state.scoreLeft > state.scoreRight) {
    leaderPill.className = 'leader-pill lead-red';
    leaderText.textContent = '13 NA FRENTE';
    frontBadgeLeft.classList.remove('hidden');
    frontBadgeRight.classList.add('hidden');
  } else if (state.scoreRight > state.scoreLeft) {
    leaderPill.className = 'leader-pill lead-blue';
    leaderText.textContent = '22 NA FRENTE';
    frontBadgeLeft.classList.add('hidden');
    frontBadgeRight.classList.remove('hidden');
  } else {
    leaderPill.className = 'leader-pill';
    leaderText.textContent = 'EMPATE';
    frontBadgeLeft.classList.add('hidden');
    frontBadgeRight.classList.add('hidden');
  }
}

// Formatar Tempo MM:SS
function formatTimer() {
  const mins = Math.floor(state.timerSeconds / 60);
  const secs = state.timerSeconds % 60;
  clockDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Trata evento de adição de pontos
function handlePointsAdded(side, points, user, reason) {
  const isLeft = side === 'left';
  const scoreEl = isLeft ? scoreLeftEl : scoreRightEl;
  const floatCont = isLeft ? floatContainerLeft : floatContainerRight;
  const tickerText = isLeft ? tickerTextLeft : tickerTextRight;

  // 1. Pop no placar
  scoreEl.classList.add('pop');
  setTimeout(() => scoreEl.classList.remove('pop'), 200);

  // 2. Spawn do número flutuante (+1, +5)
  spawnFloatingPoint(floatCont, points);

  // 3. Ticker recente
  tickerText.textContent = `${user} • ${reason} • +${points} pts`;

  // 4. Executa a digitação física na urna com a mão
  triggerPhysicalVoting(side);
}

// ============================================================
// CONEXÃO WEBSOCKET
// ============================================================
function connectWebSocket() {
  const urlParams = new URLSearchParams(window.location.search);
  const customServer = urlParams.get('server') || localStorage.getItem('game_server_url');

  let wsUrl;
  if (customServer) {
    wsUrl = customServer.startsWith('ws') ? customServer : `wss://${customServer.replace(/^https?:\/\//, '')}`;
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl = `${protocol}//${window.location.host}`;
  }

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('Conectado ao servidor de controle!');
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case 'INIT_STATE':
        Object.assign(state, data.state);
        updateUI();
        formatTimer();
        break;

      case 'POINTS_ADDED':
        Object.assign(state, data.state);
        updateUI();
        handlePointsAdded(data.side, data.points, data.user, data.reason);
        break;

      case 'TIMER_UPDATE':
        state.timerSeconds = data.timerSeconds;
        formatTimer();
        break;

      case 'TIKTOK_STATUS':
        state.isLiveConnected = data.connected;
        if (data.username) state.tiktokUsername = data.username;
        updateConnectionStatus(data.connected, data.error);
        break;

      case 'WINNER':
        showVictory(data.winner);
        break;

      case 'GAME_RESET':
        Object.assign(state, data.state);
        hideVictory();
        updateUI();
        formatTimer();
        break;

      case 'TARGET_UPDATED':
        state.targetScore = data.target;
        targetDisplay.textContent = state.targetScore;
        updateUI();
        break;
    }
  };

  socket.onclose = () => {
    setTimeout(connectWebSocket, 2000);
  };
}

function updateConnectionStatus(connected, error) {
  if (connected) {
    dockStatus.textContent = `🟢 Conectado em @${state.tiktokUsername}!`;
    dockStatus.style.color = '#38ef7d';
    document.getElementById('liveStatusText').textContent = 'AO VIVO';
  } else {
    dockStatus.textContent = error ? `🔴 Erro: ${error}` : '⚪ Desconectado';
    dockStatus.style.color = error ? '#ef4444' : '#f59e0b';
    document.getElementById('liveStatusText').textContent = 'OFFLINE';
  }
}

// ============================================================
// TELA DE VITÓRIA (1200 PONTOS)
// ============================================================
let confettiAnimationId = null;

function showVictory(winner) {
  playVictorySound();
  victoryTitle.textContent = `${winner} VENCEU!`;
  victoryModal.classList.remove('hidden');

  let countdown = 5;
  resetCountdownEl.textContent = countdown;
  const timer = setInterval(() => {
    countdown--;
    if (countdown >= 0) resetCountdownEl.textContent = countdown;
    if (countdown <= 0) clearInterval(timer);
  }, 1000);

  startConfetti();
}

function hideVictory() {
  victoryModal.classList.add('hidden');
  if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);
}

function startConfetti() {
  const ctx = confettiCanvas.getContext('2d');
  confettiCanvas.width = victoryModal.clientWidth;
  confettiCanvas.height = victoryModal.clientHeight;

  const particles = [];
  const colors = ['#ff0055', '#0099ff', '#ffeb3b', '#00ff66', '#ffffff', '#ff9900'];

  for (let i = 0; i < 140; i++) {
    particles.push({
      x: Math.random() * confettiCanvas.width,
      y: Math.random() * confettiCanvas.height - confettiCanvas.height,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: Math.random() * 4 + 3,
      speedX: (Math.random() - 0.5) * 3,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 8
    });
  }

  function render() {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    particles.forEach(p => {
      p.y += p.speedY;
      p.x += p.speedX;
      p.rotation += p.rotSpeed;

      if (p.y > confettiCanvas.height) {
        p.y = -10;
        p.x = Math.random() * confettiCanvas.width;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });

    confettiAnimationId = requestAnimationFrame(render);
  }
  render();
}

// ============================================================
// CONTROLES DO STREAMER DOCK
// ============================================================
dockToggle.addEventListener('click', () => {
  initAudio();
  streamerDock.classList.remove('hidden');
});

closeDock.addEventListener('click', () => streamerDock.classList.add('hidden'));

soundToggle.addEventListener('change', (e) => {
  soundEnabled = e.target.checked;
});

btnDockConnect.addEventListener('click', () => {
  initAudio();
  const user = dockTiktokUser.value.trim();
  if (!user) return alert('Digite seu nome de usuário do TikTok!');
  dockStatus.textContent = 'Conectando à live...';
  socket.send(JSON.stringify({ action: 'CONNECT_TIKTOK', username: user }));
});

function sendTest(action, payload = {}) {
  initAudio();
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ action, ...payload }));
  }
}

document.getElementById('testChat13').addEventListener('click', () => {
  sendTest('ADD_POINTS', { side: 'left', points: 1, user: '@viewer_teste', reason: 'Comentou 13' });
});

document.getElementById('testRosa13').addEventListener('click', () => {
  sendTest('ADD_POINTS', { side: 'left', points: 5, user: '@apoiador_lula', reason: 'Rosa x1', count: 1 });
});

document.getElementById('testChat22').addEventListener('click', () => {
  sendTest('ADD_POINTS', { side: 'right', points: 1, user: '@viewer_teste', reason: 'Comentou 22' });
});

document.getElementById('testRosa22').addEventListener('click', () => {
  sendTest('ADD_POINTS', { side: 'right', points: 5, user: '@apoiador_bolso', reason: 'Rosa Branca x1', count: 1 });
});

document.getElementById('testAdd100L').addEventListener('click', () => {
  sendTest('ADD_POINTS', { side: 'left', points: 100, user: '@super_combo', reason: 'Combo x20' });
});

document.getElementById('testAdd100R').addEventListener('click', () => {
  sendTest('ADD_POINTS', { side: 'right', points: 100, user: '@super_combo', reason: 'Combo x20' });
});

document.getElementById('testWin').addEventListener('click', () => {
  sendTest('ADD_POINTS', { side: 'left', points: 1200, user: '@finalizador', reason: 'Mega Presente' });
});

document.getElementById('testReset').addEventListener('click', () => {
  sendTest('RESET_GAME');
});

// Desbloquear áudio no primeiro clique
window.addEventListener('click', () => initAudio(), { once: true });
window.addEventListener('touchstart', () => initAudio(), { once: true });
window.addEventListener('resize', () => initHandPositions());

// Iniciação
window.addEventListener('DOMContentLoaded', () => {
  if (dockTiktokUser) dockTiktokUser.value = state.tiktokUsername || 'mendeescriolo';
  setTimeout(initHandPositions, 200);
});
setTimeout(initHandPositions, 500);

connectWebSocket();
updateUI();
formatTimer();
