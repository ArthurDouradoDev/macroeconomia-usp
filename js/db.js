// ============================================================
// ABSTRAÇÃO DO FIREBASE REALTIME DATABASE
// Todas as leituras e escritas passam por aqui.
// Nunca acesse firebase.database() diretamente na UI.
// ============================================================

const _db = firebase.database();

// ── Utilitários internos ──────────────────────────────────────

function _roomRef(roomCode) {
  return _db.ref(`rooms/${roomCode}`);
}

function _configRef(roomCode) {
  return _db.ref(`rooms/${roomCode}/config`);
}

function _playersRef(roomCode) {
  return _db.ref(`rooms/${roomCode}/players`);
}

function _playerRef(roomCode, playerId) {
  return _db.ref(`rooms/${roomCode}/players/${playerId}`);
}

function _submissionsRef(roomCode, round) {
  return _db.ref(`rooms/${roomCode}/submissions/round_${round}`);
}

function _playerSubmissionRef(roomCode, round, playerId) {
  return _db.ref(`rooms/${roomCode}/submissions/round_${round}/${playerId}`);
}

function _resultRef(roomCode, round) {
  return _db.ref(`rooms/${roomCode}/results/round_${round}`);
}

// ── Sala ──────────────────────────────────────────────────────

// Verifica se um código de sala já existe
async function roomExists(roomCode) {
  const snap = await _roomRef(roomCode).once('value');
  return snap.exists();
}

// Cria uma nova sala
async function createRoom(roomCode, masterKey) {
  await _roomRef(roomCode).set({
    config: {
      status: 'lobby',
      currentRound: 0,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      masterKey,
      event: null,
      totalMinutes: 15,   // duração total padrão (ajustavel no lobby)
      roundEndsAt: null    // timestamp absoluto (ms) do fim da submissao da rodada
    }
  });
}

// Lê a configuração atual da sala
async function getRoom(roomCode) {
  const snap = await _configRef(roomCode).once('value');
  return snap.val();
}

// Atualiza o status e a rodada atual da sala
async function updateRoomStatus(roomCode, status, currentRound) {
  const update = { status };
  if (currentRound !== undefined) update.currentRound = currentRound;
  await _configRef(roomCode).update(update);
}

// Atualiza a duração total escolhida pelo mestre (em minutos)
async function updateRoomDuration(roomCode, totalMinutes) {
  await _configRef(roomCode).update({ totalMinutes });
}

// Inicia uma rodada: grava status, rodada atual e o instante de fim da submissao
async function startRoundAt(roomCode, round, endsAt) {
  await _configRef(roomCode).update({
    status: `round_${round}`,
    currentRound: round,
    roundEndsAt: endsAt
  });
}

// Encerra a sala
async function closeRoom(roomCode) {
  await _configRef(roomCode).update({ status: 'closed' });
}

// ── Jogadores ─────────────────────────────────────────────────

// Adiciona um jogador à sala
async function addPlayer(roomCode, playerId, name) {
  await _playerRef(roomCode, playerId).set({
    name,
    sector: null,
    joinedAt: firebase.database.ServerValue.TIMESTAMP
  });
}

// Atualiza o setor escolhido pelo jogador
async function updatePlayerSector(roomCode, playerId, sector) {
  await _playerRef(roomCode, playerId).update({ sector });
}

// Lê todos os jogadores da sala
async function getPlayers(roomCode) {
  const snap = await _playersRef(roomCode).once('value');
  return snap.val() || {};
}

// ── Submissões ────────────────────────────────────────────────

// Salva os valores submetidos por um jogador em uma rodada
async function submitRoundValues(roomCode, round, playerId, values) {
  await _playerSubmissionRef(roomCode, round, playerId).set({
    values,
    submittedAt: firebase.database.ServerValue.TIMESTAMP
  });
}

// Lê todas as submissões de uma rodada
async function getSubmissions(roomCode, round) {
  const snap = await _submissionsRef(roomCode, round).once('value');
  return snap.val() || {};
}

// ── Resultados ────────────────────────────────────────────────

// Salva o resultado calculado de uma rodada
async function saveRoundResult(roomCode, round, result) {
  await _resultRef(roomCode, round).set({
    ...result,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

// Lê o resultado de uma rodada específica
async function getRoundResult(roomCode, round) {
  const snap = await _resultRef(roomCode, round).once('value');
  return snap.val();
}

// Lê os resultados de todas as rodadas
async function getAllResults(roomCode) {
  const snap = await _db.ref(`rooms/${roomCode}/results`).once('value');
  return snap.val() || {};
}

// ── Listeners em tempo real ───────────────────────────────────

// Escuta mudanças na configuração da sala
function onConfigChange(roomCode, callback) {
  const ref = _configRef(roomCode);
  ref.on('value', snap => callback(snap.val()));
  return () => ref.off('value');
}

// Escuta mudanças nos jogadores da sala
function onPlayersChange(roomCode, callback) {
  const ref = _playersRef(roomCode);
  ref.on('value', snap => callback(snap.val() || {}));
  return () => ref.off('value');
}

// Escuta mudanças nas submissões de uma rodada
function onSubmissionsChange(roomCode, round, callback) {
  const ref = _submissionsRef(roomCode, round);
  ref.on('value', snap => callback(snap.val() || {}));
  return () => ref.off('value');
}

// Escuta quando o resultado de uma rodada é publicado
function onResultChange(roomCode, round, callback) {
  const ref = _resultRef(roomCode, round);
  ref.on('value', snap => {
    if (snap.exists()) callback(snap.val());
  });
  return () => ref.off('value');
}

// ── Status de conexão ─────────────────────────────────────────

// Registra callback para mudanças no status de conexão Firebase
function onConnectionChange(callback) {
  const ref = _db.ref('.info/connected');
  ref.on('value', snap => callback(snap.val() === true));
  return () => ref.off('value');
}
