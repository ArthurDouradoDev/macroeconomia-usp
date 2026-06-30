// ============================================================
// LÓGICA DA INTERFACE DO JOGADOR
// ============================================================

let _roomCode  = null;
let _playerId  = null;
let _playerName = null;
let _sector    = null;
let _config    = null;
let _players   = {};
let _limits    = null;      // limites da rodada atual
let _prevResult = null;     // resultado da rodada anterior (para limite de I)
let _allResults = {};       // todos os resultados
let _lastSubmission = null; // última submissão enviada

let _offConfig   = null;
let _offPlayers  = null;
let _offResult   = null;
let _playerTimerInterval = null;  // cronômetro sincronizado da submissão

// ── Utilitários de UI ─────────────────────────────────────────

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById(id).classList.add('fade-in');
}

function showFatalError(msg) {
  showView('view-error');
  document.getElementById('error-message').textContent = msg;
}

function fmtNum(n, d = 0) {
  return Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });
}

function fmtBI(n) { return `R$${fmtNum(n, 0)}bi`; }

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

const SECTOR_LABELS = { familias: 'Famílias', empresas: 'Empresas', governo: 'Governo' };

function sectorColor(s) {
  return s === 'familias' ? 'green' : s === 'empresas' ? 'blue' : 'gold';
}

function sectorIcon(s) {
  return s === 'familias' ? 'ti-home' : s === 'empresas' ? 'ti-building-factory' : 'ti-building-bank';
}

function fmtClock(totalSeconds) {
  const sec = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
}

// Monta as linhas de um ranking (igual ao telão, em escala mobile)
function renderLeaderboardRows(ranking, mySector) {
  const maxTotal = Math.max(1, ...ranking.map(r => r.total));
  return ranking.map(row => {
    const pct = Math.round((row.total / maxTotal) * 100);
    const isLeader = row.rank === 1 && row.total > 0;
    const isMine = row.sector === mySector;
    return `
      <div class="lb-row ${isMine ? 'mine' : ''}">
        <div class="lb-rank ${isLeader ? 'leader' : ''}">${row.rank}</div>
        <div class="lb-info">
          <div class="lb-name">
            <i class="ti ${sectorIcon(row.sector)} text-${sectorColor(row.sector)}"></i>
            ${SECTOR_LABELS[row.sector]}
            ${isLeader ? '<i class="ti ti-trophy text-gold"></i>' : ''}
          </div>
          <div class="lb-track">
            <div class="lb-bar ${row.sector}" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="lb-total mono">${row.total}</div>
      </div>`;
  }).join('');
}

function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn._orig = btn.innerHTML;
    btn.innerHTML = '<div class="spinner"></div> Enviando...';
  } else {
    btn.disabled = false;
    if (btn._orig) btn.innerHTML = btn._orig;
  }
}

// ── Inicialização ─────────────────────────────────────────────

(function init() {
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get('room')?.toUpperCase();

  _playerId   = localStorage.getItem('playerId');
  _playerName = localStorage.getItem('playerName');
  const storedRoom = localStorage.getItem('roomCode');

  _roomCode = roomFromUrl || storedRoom;

  if (!_roomCode || !_playerId || !_playerName) {
    showFatalError('Sessão inválida. Por favor, entre na sala novamente.');
    return;
  }

  // Garantir que o código na URL bate com o do localStorage
  if (roomFromUrl && storedRoom && roomFromUrl !== storedRoom) {
    // Novo jogo: limpar dados antigos
    localStorage.setItem('roomCode', roomFromUrl);
    _roomCode = roomFromUrl;
  }

  startPlayerSession();
})();

// ── Sessão do jogador ─────────────────────────────────────────

async function startPlayerSession() {
  try {
    const exists = await roomExists(_roomCode);
    if (!exists) {
      showFatalError('Sala não encontrada. O jogo pode ter sido encerrado.');
      return;
    }

    // Verificar se o jogador ainda existe no Firebase
    const players = await getPlayers(_roomCode);
    _players = players;

    if (!players[_playerId]) {
      // Jogador não existe mais: tentar recriar
      await addPlayer(_roomCode, _playerId, _playerName);
    } else {
      _sector = players[_playerId].sector || null;
      _persona = players[_playerId].persona || null;
    }

    // Carregar resultados já existentes
    const rawResults = await getAllResults(_roomCode);
    if (rawResults) {
      for (const key of Object.keys(rawResults)) {
        const n = parseInt(key.replace('round_', ''));
        _allResults[n] = rawResults[key];
      }
    }

    // Listener de jogadores (para contadores de setor)
    _offPlayers = onPlayersChange(_roomCode, p => {
      _players = p;
      updateSectorCounts();
    });

    // Listener de configuração (estado do jogo)
    _offConfig = onConfigChange(_roomCode, config => {
      if (!config) return;
      _config = config;
      routeView(config);
    });

    // Indicador de conexão
    onConnectionChange(connected => {
      document.getElementById('conn-dot').className    = 'conn-dot' + (connected ? ' connected' : '');
      document.getElementById('conn-label').textContent = connected ? 'Conectado' : 'Sem conexão';
    });

  } catch (err) {
    console.error(err);
    showFatalError('Erro ao conectar. Verifique sua internet e recarregue a página.');
  }
}

// ── Roteamento de views ────────────────────────────────────────

function routeView(config) {
  const status = config.status;
  const round  = config.currentRound;

  if (status === 'closed') {
    showView('view-closed');
    return;
  }

  if (status === 'lobby') {
    if (!_sector) {
      showView('view-sector');
      setupSectorView();
    } else {
      showView('view-waiting');
      setupWaitingView('Aguardando o mestre iniciar a rodada...');
    }
    return;
  }

  if (status === `round_${round}`) {
    // Rodada ativa: carregar limites e mostrar formulário
    loadRoundLimits(round, () => {
      // Se já submeteu nesta rodada, mostrar confirmação
      getSubmissions(_roomCode, round).then(subs => {
        if (subs[_playerId]?.values) {
          _lastSubmission = subs[_playerId].values;
          showView('view-submitted');
          renderSubmittedSummary(_lastSubmission);
        } else {
          showView('view-submit');
          setupSubmitView(round);
        }
      });
    });
    return;
  }

  if (status === `results_${round}`) {
    stopPlayerTimer();
    // Mostrar resultado desta rodada
    getRoundResult(_roomCode, round).then(result => {
      if (result) {
        _allResults[round] = result;
        showView('view-result');
        renderRoundResult(result, round);
      } else {
        // Resultado ainda não disponível
        showView('view-waiting');
        setupWaitingView('Calculando o resultado...');
        // Tentar novamente em 2s
        setTimeout(() => routeView(config), 2000);
      }
    });
    return;
  }

  if (status === 'results') {
    getAllResults(_roomCode).then(raw => {
      const results = {};
      for (const k of Object.keys(raw || {})) {
        results[parseInt(k.replace('round_', ''))] = raw[k];
      }
      _allResults = results;
      showView('view-final');
      renderFinalResults(results);
    });
    return;
  }

  // Fallback: aguardando
  showView('view-waiting');
  setupWaitingView('Aguardando...');
}

// ── Seleção de setor ──────────────────────────────────────────

function setupSectorView() {
  document.getElementById('sector-room-code').textContent = _roomCode;
  document.getElementById('sector-player-name').textContent = esc(_playerName);
  updateSectorCounts();
}

function updateSectorCounts() {
  const totalPlayers = Object.values(_players).length;
  // Nenhum setor pode ter mais da metade dos jogadores (min 1)
  const effectiveCap = Math.min(15, Math.max(1, Math.floor(totalPlayers / 2)));

  for (const sector of ['familias', 'empresas', 'governo']) {
    const count = Object.values(_players).filter(p => p.sector === sector).length;
    const el    = document.getElementById(`count-badge-${sector}`);
    if (el) el.textContent = count;

    const btn = document.getElementById(`card-${sector}`);
    if (btn) {
      const isMine = _sector === sector;
      const isFull = count >= effectiveCap && !isMine;
      btn.disabled = isFull;
      btn.classList.toggle(`selected-${sector}`, isMine);
      btn.title = isFull ? 'Setor muito popular. Escolha outro para equilibrar a economia.' : '';
    }

    // Badge de equilíbrio
    const balanceBadge = document.getElementById(`balance-badge-${sector}`);
    if (balanceBadge) {
      const ratio = effectiveCap > 0 ? count / effectiveCap : 0;
      if (count >= effectiveCap) {
        balanceBadge.textContent = 'Cheio';
        balanceBadge.className = 'badge badge-red';
        balanceBadge.style.display = '';
      } else if (ratio >= 0.6 && count > 0) {
        balanceBadge.textContent = 'Populoso';
        balanceBadge.className = 'badge badge-gold';
        balanceBadge.style.display = '';
      } else {
        balanceBadge.style.display = 'none';
      }
    }
  }
}

async function chooseSector(sector) {
  // Remover seleção anterior visualmente
  for (const s of ['familias', 'empresas', 'governo']) {
    document.getElementById(`card-${s}`)?.classList.remove(`selected-${s}`);
  }
  document.getElementById(`card-${sector}`)?.classList.add(`selected-${sector}`);

  _sector = sector;
  const sectorPersonas = PERSONAS[sector];
  const randomPersona = sectorPersonas[Math.floor(Math.random() * sectorPersonas.length)];
  _persona = randomPersona;

  try {
    await updatePlayerSector(_roomCode, _playerId, sector, randomPersona);
    localStorage.setItem('playerSector', sector);
    // Mostrar tela de espera
    showView('view-waiting');
    setupWaitingView('Aguardando o mestre iniciar a rodada...');
  } catch (err) {
    console.error(err);
    const errEl = document.getElementById('sector-error');
    if (errEl) {
      errEl.textContent = 'Erro ao registrar setor. Tente novamente.';
      errEl.classList.add('show');
    }
    // Reverter visualmente
    _sector = _players[_playerId]?.sector || null;
    _persona = _players[_playerId]?.persona || null;
  }
}

// ── Tela de espera ────────────────────────────────────────────

function setupWaitingView(msg) {
  document.querySelectorAll('.waiting-room-code').forEach(el => el.textContent = _roomCode);
  document.getElementById('waiting-message').textContent = msg;

  const sectorIcons = { familias: 'ti-home', empresas: 'ti-building-factory', governo: 'ti-building-bank' };
  const sectorNames = { familias: 'Famílias', empresas: 'Empresas', governo: 'Governo' };
  const sectorColors = { familias: 'green', empresas: 'blue', governo: 'gold' };

  if (_sector) {
    document.getElementById('waiting-title').textContent = 'Setor selecionado';
    document.getElementById('waiting-sector-name').textContent = sectorNames[_sector];
    document.getElementById('waiting-sector-name').className   = `fw-700 text-lg text-${sectorColors[_sector]}`;
    document.getElementById('waiting-sector-icon').innerHTML =
      `<i class="ti ${sectorIcons[_sector]} text-${sectorColors[_sector]}"></i>`;
  }
}

// ── Limites da rodada ─────────────────────────────────────────

function loadRoundLimits(round, callback) {
  _prevResult = _allResults[round - 1] || null;
  _limits = getRoundLimits(round, _prevResult);
  if (callback) callback();
}

// ── View de submissão ─────────────────────────────────────────

function setupSubmitView(round) {
  _currentStep = 1;
  _selectedStance = null;
  _selectedBet = null;
  _selectedBetStake = 'seguro';
  _lockedEarly = false;

  // Limpa qualquer estado "desabilitado" herdado da rodada anterior (trava de
  // decisao ou cronometro esgotado desabilitam os controles e isso precisa ser
  // revertido ao iniciar uma nova rodada, senao os botoes "Prosseguir"/"Enviar"
  // ficam travados a partir da rodada 2).
  enableSubmissionControls();

  // Renderiza persona
  renderPersona();

  // Reinicia stepper
  changeStep(1);

  // Renderiza dilemas
  renderDilemmas(round);

  // Zera botões de aposta
  setBet(null);

  // Título da aposta
  const targetPibEl = document.getElementById('bet-target-pib');
  if (targetPibEl) {
    targetPibEl.textContent = ROUND_EVENTS[round].scoring.targetY;
  }

  // Reseta trava
  const lockCard = document.getElementById('lock-card');
  if (lockCard) lockCard.style.display = '';

  const event = ROUND_EVENTS[round];

  // Banner
  document.getElementById('submit-round-label').textContent  = `Rodada ${round} de 3`;
  document.getElementById('submit-event-name').textContent   = event.name;
  document.getElementById('submit-event-desc').textContent   = event.description;

  // Cabecalho compacto do fluxo de decisao
  const flowLabel = document.getElementById('flow-round-label');
  if (flowLabel) flowLabel.textContent = `Rodada ${round} de 3 - ${event.name}`;

  // Card de missão do setor
  const mission = SECTOR_MISSIONS[_sector];
  const card = document.getElementById('mission-card');
  if (mission && card) {
    card.className = `mission-card ${_sector}`;
    document.getElementById('mission-title').textContent     = mission.title;
    document.getElementById('mission-objective').textContent = mission.objective;
    document.getElementById('mission-tip').textContent       = mission.tip;
  }

  // Mostrar os controles do setor
  ['familias', 'empresas', 'governo'].forEach(s => {
    const el = document.getElementById(`controls-${s}`);
    if (el) el.style.display = s === _sector ? '' : 'none';
    const elSimple = document.getElementById(`sliders-${s}-simple`);
    if (elSimple) elSimple.style.display = s === _sector ? '' : 'none';
  });

  // Inicializar o modo simples conforme checkbox
  const simpleCheck = document.getElementById('toggle-simple-mode');
  if (simpleCheck) {
    toggleSimpleMode(simpleCheck.checked);
  }

  // Iniciar listener do consenso (huddle)
  startHuddleListener(round);

  // Configurar limites dos sliders
  applyLimitsToSliders(round);

  // Atualizar preview de déficit (Governo)
  if (_sector === 'governo') {
    updateDeficitPreview();
  }

  // Cronômetro sincronizado (mesmo instante de fim do mestre)
  startPlayerTimer();

  // Mostra primeiro o briefing da rodada; o fluxo de decisao (3 passos) so
  // aparece apos o jogador tocar em "Comecar a decidir".
  showBriefing();
}

// Lê os valores atuais dos sliders e os converte para os parâmetros do modelo
// (c0/c1/I/G/T). Reusado pela submissão e pela projeção ao vivo.
function readCurrentValues() {
  if (_sector === 'familias') {
    // c1: slider em % (10-95) → decimal; c0: slider em R$/mês (500-5000) → R$bi
    return {
      c1: parseFloat(document.getElementById('slider-c1').value) / 100,
      c0: parseFloat(document.getElementById('slider-c0').value) / 50
    };
  }
  if (_sector === 'empresas') {
    return { I: parseFloat(document.getElementById('slider-I').value) };
  }
  if (_sector === 'governo') {
    return {
      G: parseFloat(document.getElementById('slider-G').value),
      T: parseFloat(document.getElementById('slider-T').value)
    };
  }
  return {};
}

// ── Cronômetro sincronizado ───────────────────────────────────

function startPlayerTimer() {
  if (_playerTimerInterval) clearInterval(_playerTimerInterval);
  const endsAt = _config?.roundEndsAt;
  const el  = document.getElementById('player-timer');
  const val = document.getElementById('player-timer-value');
  if (!endsAt || !el || !val) { if (el) el.style.display = 'none'; return; }
  el.style.display = '';

  function tick() {
    const seconds = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    val.textContent = fmtClock(seconds);
    el.className = 'player-timer' + (seconds <= 10 ? ' urgent' : seconds <= 30 ? ' warning' : '');
    if (seconds <= 0) {
      clearInterval(_playerTimerInterval);
      val.textContent = 'Tempo esgotado';
      lockSubmitOnTimeout();
    }
  }
  tick();
  _playerTimerInterval = setInterval(tick, 1000);
}

function stopPlayerTimer() {
  if (_playerTimerInterval) { clearInterval(_playerTimerInterval); _playerTimerInterval = null; }
}

// Ao esgotar o tempo: trava o envio. O mestre calcula com o ultimo valor enviado
// (ou o padrao se nada foi enviado).
function lockSubmitOnTimeout() {
  const btn = document.getElementById('btn-submit');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-clock-stop"></i> Tempo esgotado, calculando...';
  }
}

function applyLimitsToSliders(round) {
  const limits = _limits;

  if (_sector === 'familias') {
    // c1: slider em % (10-95), converte /100 no submit
    // c0: slider em R$/mês (500-5000), converte /50 no submit
    setSlider('c1', limits.c1.min * 100, limits.c1.max * 100, 70, 1);
    setSlider('c0', limits.c0.min * 50, limits.c0.max * 50, 2500, 50);

    const c0Limited = round === 2 && limits.c0.max < 100;
    const badgeC0 = document.getElementById('badge-c0-limit');
    if (badgeC0) badgeC0.style.display = c0Limited ? '' : 'none';
  }

  if (_sector === 'empresas') {
    setSlider('I', limits.I.min, limits.I.max, Math.min(80, limits.I.max), 1);

    const iLimited = limits.I.max < 200;
    const badgeI = document.getElementById('badge-I-limit');
    if (badgeI) badgeI.style.display = iLimited ? '' : 'none';

    if (round >= 2 && _prevResult) {
      const infoEl = document.getElementById('invest-limit-info');
      const textEl = document.getElementById('invest-limit-text');
      infoEl.style.display = '';
      textEl.innerHTML = `Poupanca da rodada anterior: <strong class="mono">${fmtBI(_prevResult.totalSavings)}</strong><br>
        Investimento maximo: <strong class="mono">${fmtBI(limits.I.max)}</strong>`;
      document.getElementById('undercap-warning').style.display =
        limits.I.undercapitalized ? '' : 'none';
    }
  }

  if (_sector === 'governo') {
    setSlider('G', limits.G.min, limits.G.max, 100, 1);
    setSlider('T', limits.T.min, limits.T.max, 100, 1);
  }

  // Aviso de crise (rodada 2)
  if (round === 2) {
    const warnEl   = document.getElementById('crisis-warning');
    const warnText = document.getElementById('crisis-warning-text');
    let msg = '';
    if (_sector === 'familias') {
      const maxMensal = (limits.c0.max * 50).toLocaleString('pt-BR');
      msg = `Crise de confiança: gasto máximo caiu para R$${maxMensal}/mês (c₀ de R$${limits.c0.max}bi).`;
    } else if (_sector === 'empresas') {
      msg = `Crise de confiança: o limite máximo de I caiu de R$200bi para R$${limits.I.max}bi.`;
    }
    if (msg) {
      warnText.textContent = msg;
      warnEl.style.display = '';
    }
  } else {
    document.getElementById('crisis-warning').style.display = 'none';
  }
}

function fmtSliderVal(id, value) {
  if (id === 'c1') return Math.round(value) + '%';
  if (id === 'c0') return 'R$ ' + Number(value).toLocaleString('pt-BR');
  return Math.round(value);
}

function updateSliderHelper(id, value) {
  if (id === 'c1') {
    const pct = Math.round(value);
    const el = document.getElementById('helper-c1');
    if (el) el.textContent = `De cada R$100 que você ganha, você gasta R$${pct} e poupa R$${100 - pct}.`;
  }
  if (id === 'c0') {
    const macro = Math.round(value / 50);
    const el = document.getElementById('helper-c0');
    if (el) el.textContent = `Equivale a R$${macro}bi no modelo macroeconômico.`;
  }
}

function setSlider(id, min, max, defaultVal, step) {
  const slider = document.getElementById(`slider-${id}`);
  const simpleSlider = document.getElementById(`slider-${id}-simple`);
  const valEl  = document.getElementById(`val-${id}`);
  const valElSimple = document.getElementById(`val-${id}-simple`);
  const minEl  = document.getElementById(`min-${id}`);
  const maxEl  = document.getElementById(`max-${id}`);
  if (!slider) return;

  slider.min  = min;
  slider.max  = max;
  slider.step = step;

  if (simpleSlider) {
    simpleSlider.min  = min;
    simpleSlider.max  = max;
    simpleSlider.step = step;
  }

  const safeDefault = Math.min(Math.max(defaultVal, min), max);
  slider.value = safeDefault;
  if (simpleSlider) simpleSlider.value = safeDefault;

  if (valEl) valEl.textContent = fmtSliderVal(id, safeDefault);
  if (valElSimple) valElSimple.textContent = fmtSliderVal(id, safeDefault);
  if (minEl) minEl.textContent = fmtSliderVal(id, min);
  if (maxEl) maxEl.textContent = fmtSliderVal(id, max);
  updateSliderHelper(id, safeDefault);
  
  // Atualizar visuais customizados
  syncCustomControlsVisuals();
}

function updateSlider(id, value) {
  const valEl = document.getElementById(`val-${id}`);
  const valElSimple = document.getElementById(`val-${id}-simple`);
  const simpleSlider = document.getElementById(`slider-${id}-simple`);
  const realSlider = document.getElementById(`slider-${id}`);

  // Sincronizar valores
  if (realSlider && realSlider.value !== value) realSlider.value = value;
  if (simpleSlider && simpleSlider.value !== value) simpleSlider.value = value;

  if (valEl) valEl.textContent = fmtSliderVal(id, value);
  if (valElSimple) valElSimple.textContent = fmtSliderVal(id, value);
  updateSliderHelper(id, value);
  
  // Atualizar visuais customizados
  syncCustomControlsVisuals();

  if (id === 'G' || id === 'T') updateDeficitPreview();
}

function updateDeficitPreview() {
  const G = parseFloat(document.getElementById('slider-G')?.value || 100);
  const T = parseFloat(document.getElementById('slider-T')?.value || 100);
  const deficit = G - T;
  const round   = _config?.currentRound || 1;
  const event   = ROUND_EVENTS[round];

  const valEl  = document.getElementById('deficit-value');
  const statEl = document.getElementById('deficit-status');
  if (!valEl) return;

  valEl.textContent = `R$${deficit.toFixed(0)}bi`;
  valEl.style.color = deficit > event.deficitThreshold ? 'var(--red)' : 'var(--green)';

  if (deficit > event.deficitThreshold) {
    statEl.innerHTML = `<span class="text-red"><i class="ti ti-alert-triangle"></i> Acima do limite (R$${event.deficitThreshold}bi): penalidade de ${(event.deficitPenalty * 100).toFixed(0)}% em c&#8320;.</span>`;
  } else if (deficit > 0) {
    statEl.innerHTML = `<span class="text-gold">Déficit de R$${deficit.toFixed(0)}bi (dentro do limite de R$${event.deficitThreshold}bi).</span>`;
  } else {
    statEl.innerHTML = `<span class="text-green">Orçamento equilibrado ou superavitário.</span>`;
  }
}

// ── Submissão de valores ──────────────────────────────────────

async function submitDecision() {
  const btn   = document.getElementById('btn-submit');
  const errEl = document.getElementById('submit-error');
  if (errEl) errEl.classList.remove('show');

  const values = readCurrentValues();

  setLoading(btn, true);

  try {
    const round = _config?.currentRound;
    await submitRoundValues(_roomCode, round, _playerId, values, _selectedStance, _selectedBet, false, _selectedBetStake);
    _lastSubmission = values;
    showView('view-submitted');
    renderSubmittedSummary(values);
  } catch (err) {
    console.error(err);
    if (errEl) {
      errEl.textContent = 'Erro ao enviar. Tente novamente.';
      errEl.classList.add('show');
    }
  } finally {
    setLoading(btn, false);
  }
}

function renderSubmittedSummary(values) {
  const el = document.getElementById('submitted-summary');
  const items = Object.entries(values).map(([k, v]) => {
    const labels = {
      c1: 'Propensão a consumir',
      c0: 'Gasto mínimo familiar',
      I:  'I Investimento',
      G:  'G Gastos do governo',
      T:  'T Impostos'
    };
    let fmt;
    if (k === 'c1') {
      fmt = `${Math.round(v * 100)}% <span class="text-muted text-sm">(c&#8321; = ${Number(v).toFixed(2)})</span>`;
    } else if (k === 'c0') {
      const mensal = Math.round(v * 50).toLocaleString('pt-BR');
      fmt = `R$${mensal}/mês <span class="text-muted text-sm">(c&#8320; = R$${Math.round(v)}bi)</span>`;
    } else {
      fmt = `R$${Math.round(v)}bi`;
    }
    return `<div class="sector-summary-row">
      <span class="sector-summary-label">${labels[k] || k}</span>
      <span class="sector-summary-value">${fmt}</span>
    </div>`;
  }).join('');

  el.innerHTML = `<h4 class="mb-3">Valores enviados</h4>${items}`;
}

function goBackToSubmit() {
  showView('view-submit');
  setupSubmitView(_config?.currentRound);
}

// ── Resultado da rodada ───────────────────────────────────────

// Renderiza os pontos do setor e a posição atual no ranking
function renderScoreBlock(result) {
  const pts = result.scores?.[_sector] ?? 0;
  document.getElementById('result-score-points').textContent = `+${pts}`;

  const lb = computeLeaderboard(_allResults);
  const myRow = lb.find(r => r.sector === _sector);
  const rankEl = document.getElementById('result-score-rank');
  rankEl.innerHTML = `
    <div class="rank-num mono">${myRow ? myRow.rank + 'o' : '-'}</div>
    <div class="text-sm text-muted">lugar</div>`;

  const bonusEl = document.getElementById('result-score-bonus');
  if (result.scoring?.collectiveBonus) {
    bonusEl.style.display = '';
    bonusEl.innerHTML = `<i class="ti ti-target-arrow"></i> Meta de PIB atingida: +${result.scoring.collectiveBonus} de bônus para todos os setores.`;
  } else {
    bonusEl.style.display = 'none';
  }

  document.getElementById('result-leaderboard').innerHTML = renderLeaderboardRows(lb, _sector);
}

function renderRoundResult(result, round) {
  // PIB
  document.getElementById('result-round-label').textContent = `Rodada ${round} de 3`;
  document.getElementById('result-Y').textContent = fmtNum(result.Y, 0);

  // Pontuação do setor + posição no ranking
  renderScoreBlock(result);

  // Comparação com rodada anterior
  const compEl  = document.getElementById('result-comparison');
  const prev    = _allResults[round - 1];
  if (prev) {
    const delta = result.Y - prev.Y;
    const pct   = ((delta / prev.Y) * 100).toFixed(1);
    const cls   = delta >= 0 ? 'delta-up' : 'delta-down';
    const arrow = delta >= 0 ? 'ti-arrow-up' : 'ti-arrow-down';
    compEl.innerHTML = `
      <span class="text-muted text-sm">Vs rodada anterior:</span>
      <span class="${cls}"><i class="ti ${arrow}"></i> ${delta >= 0 ? '+' : ''}${pct}%</span>`;
  } else {
    compEl.innerHTML = '';
  }

  // Contribuição do setor
  const sectorTitle = document.getElementById('result-sector-title');
  const sectorDetail = document.getElementById('result-sector-detail');
  const sectorNames = { familias: 'Famílias', empresas: 'Empresas', governo: 'Governo' };
  sectorTitle.textContent = `Contribuição do setor ${sectorNames[_sector] || ''}`;

  let detailRows = [];
  if (_sector === 'familias') {
    detailRows = [
      { label: 'c&#8321; médio do setor', value: result.c1Eff?.toFixed(2) },
      { label: 'c&#8320; médio do setor', value: fmtBI(result.c0Raw) },
      { label: 'Multiplicador gerado', value: `${result.multiplier?.toFixed(2)}x` },
    ];
  } else if (_sector === 'empresas') {
    detailRows = [
      { label: 'I médio do setor', value: fmtBI(result.IEff) },
    ];
    if (result.limits?.I?.limitedBySavings) {
      detailRows.push({ label: 'Limite pela poupança anterior', value: fmtBI(result.limits.I.max) });
    }
  } else if (_sector === 'governo') {
    detailRows = [
      { label: 'G médio do setor', value: fmtBI(result.GEff) },
      { label: 'T médio do setor', value: fmtBI(result.TEff) },
      { label: 'Déficit (G - T)',  value: fmtBI(result.deficit) },
    ];
    if (result.penaltyInfo?.penaltyApplied) {
      detailRows.push({ label: 'Penalidade de déficit', value: `-${(result.penaltyInfo.penaltyRate * 100).toFixed(0)}% em c&#8320;` });
    }
  }

  sectorDetail.innerHTML = detailRows.map(r =>
    `<div class="sector-summary-row">
      <span class="sector-summary-label">${r.label}</span>
      <span class="sector-summary-value">${r.value}</span>
    </div>`
  ).join('');

  // Métricas gerais
  document.getElementById('result-metrics').innerHTML = [
    { label: 'Multiplicador', value: `${result.multiplier?.toFixed(2)}x` },
    { label: 'Renda disponível', value: fmtBI(result.disposableIncome) },
    { label: 'Poupança privada', value: fmtBI(result.privateSavings) },
    { label: 'Poupança pública', value: fmtBI(result.publicSavings) },
  ].map(m => `
    <div class="metric-card">
      <div class="metric-label">${m.label}</div>
      <div class="metric-value">${m.value}</div>
    </div>`).join('');

  // Insights
  const insights = generateRoundInsights(result, prev, round);
  document.getElementById('result-insights').innerHTML = insights.map(i =>
    `<li class="insight-item"><i class="ti ti-info-circle"></i> ${i}</li>`
  ).join('') || `<li class="insight-item text-muted">Sem destaques adicionais.</li>`;
}

// ── Resultado final ───────────────────────────────────────────

function renderFinalResults(results) {
  // Posição final do setor do jogador + ranking completo
  const lb = computeLeaderboard(results);
  const myRow = lb.find(r => r.sector === _sector);
  const posEl = document.getElementById('final-position');
  if (posEl && myRow) {
    const won = myRow.rank === 1 && myRow.total > 0;
    posEl.innerHTML = `
      <div class="final-position-icon">
        <i class="ti ${won ? 'ti-trophy text-gold' : 'ti-medal text-blue'}"></i>
      </div>
      <div>
        <div class="text-sm text-muted">Seu setor (${SECTOR_LABELS[_sector]})</div>
        <div class="fw-700 text-lg">${won ? 'Venceu em 1o lugar!' : `${myRow.rank}o lugar`} com ${myRow.total} pontos</div>
      </div>`;
  }
  document.getElementById('final-leaderboard').innerHTML = renderLeaderboardRows(lb, _sector);

  const rounds  = [1, 2, 3].filter(r => results[r]);
  const yValues = rounds.map(r => results[r].Y);
  const maxY    = Math.max(...yValues);
  const minY    = Math.min(...yValues);

  // Gráfico de barras
  const chartEl = document.getElementById('final-bar-chart');
  chartEl.innerHTML = rounds.map(r => {
    const y   = results[r].Y;
    const pct = maxY > 0 ? (y / maxY) * 100 : 0;
    const cls = y === maxY ? 'best' : y === minY ? 'worst' : '';
    return `
      <div class="bar-group">
        <div class="bar-value">${fmtNum(y, 0)}</div>
        <div class="bar-fill ${cls}" style="height:${pct}%"></div>
        <div class="bar-label">Rod. ${r}</div>
      </div>`;
  }).join('');

  // Destaques
  const maxRound = rounds.reduce((a, b) => results[a].Y > results[b].Y ? a : b);
  const minRound = rounds.reduce((a, b) => results[a].Y < results[b].Y ? a : b);
  document.getElementById('final-highlights').innerHTML = `
    <div class="sector-summary-row">
      <span class="sector-summary-label text-green"><i class="ti ti-trophy"></i> Maior PIB</span>
      <span class="sector-summary-value">Rod. ${maxRound}: ${fmtBI(results[maxRound].Y)}</span>
    </div>
    <div class="sector-summary-row mt-2">
      <span class="sector-summary-label text-red"><i class="ti ti-trending-down"></i> Menor PIB</span>
      <span class="sector-summary-value">Rod. ${minRound}: ${fmtBI(results[minRound].Y)}</span>
    </div>`;

  // Renderizar Insígnias (Badges)
  const badgesObj = computeBadges(results);
  const myBadges = badgesObj[_sector] || [];
  const collectiveBadges = badgesObj.coletivo || [];
  const allMyBadges = [...myBadges, ...collectiveBadges];
  const badgesCard = document.getElementById('final-badges-card');
  const badgesContainer = document.getElementById('final-badges-container');
  
  if (badgesCard && badgesContainer) {
    if (allMyBadges.length > 0) {
      badgesCard.style.display = '';
      badgesContainer.innerHTML = allMyBadges.map(badge => `
        <div class="badge-item card" style="display:flex; align-items:center; gap:0.75rem; padding:0.75rem; background:var(--bg-600); margin:0">
          <div style="font-size:1.75rem"><i class="ti ti-award text-gold"></i></div>
          <div>
            <div class="fw-700 text-green">${badge.name}</div>
            <div class="text-xs text-300" style="margin:0">${badge.desc}</div>
          </div>
        </div>
      `).join('');
    } else {
      badgesCard.style.display = 'none';
    }
  }

  // Resumo do setor do jogador
  const sectorNames = { familias: 'Famílias', empresas: 'Empresas', governo: 'Governo' };
  document.getElementById('final-sector-title').textContent =
    `Resumo: setor ${sectorNames[_sector] || ''}`;

  document.getElementById('final-sector-summary').innerHTML = rounds.map(r => {
    const res = results[r];
    let rows = [];
    if (_sector === 'familias') {
      rows = [
        `c&#8321; = ${res.c1Eff?.toFixed(2)} | multiplicador = ${res.multiplier?.toFixed(2)}x`
      ];
    } else if (_sector === 'empresas') {
      rows = [`I = ${fmtBI(res.IEff)}`];
    } else if (_sector === 'governo') {
      rows = [`G = ${fmtBI(res.GEff)} | T = ${fmtBI(res.TEff)} | déficit = ${fmtBI(res.deficit)}`];
    }
    return `<div class="insight-item"><span class="fw-700">Rod. ${r}:</span> ${rows.join(' | ')}</div>`;
  }).join('');

  // Conclusão
  const insights = generateFinalInsights(results);
  document.getElementById('final-conclusion').innerHTML = insights.map(i =>
    `<li class="insight-item"><i class="ti ti-info-circle"></i> ${i}</li>`
  ).join('') || `<li class="insight-item text-muted">Jogo concluido.</li>`;
}

// ── Funções de Gamificação (Passo a Passo, Personas, Huddle, etc.) ──────────────────

let _currentStep = 1;
let _selectedStance = null;
let _selectedBet = null;
let _selectedBetStake = 'seguro';
let _lockedEarly = false;
let _simpleMode = false;
let _persona = null;
let _offSubmissions = null;
let _briefingShown = false;

// Exibe o briefing da rodada e oculta o fluxo de decisao (estado inicial).
function showBriefing() {
  _briefingShown = false;
  const briefing = document.getElementById('submit-briefing');
  const flow     = document.getElementById('submit-flow');
  if (briefing) briefing.style.display = '';
  if (flow) flow.style.display = 'none';
}

// Inicia o fluxo de decisao de 3 passos a partir do briefing (onclick do CTA).
function startDecisionFlow() {
  _briefingShown = true;
  const briefing = document.getElementById('submit-briefing');
  const flow     = document.getElementById('submit-flow');
  if (briefing) briefing.style.display = 'none';
  if (flow) flow.style.display = '';
  changeStep(1);
  syncCustomControlsVisuals();
}

function changeStep(step) {
  if (step < 1 || step > 3) return;

  // Auto-selecionar dilema se o jogador tentar pular o Passo 1 sem escolha
  if (step > 1 && !_selectedStance) {
    const dilemmas = DILEMMAS[_config?.currentRound || 1]?.[_sector];
    if (dilemmas && dilemmas.length > 0) {
      selectDilemma(dilemmas[0].id);
    }
  }

  _currentStep = step;

  // Atualizar indicadores visuais
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step-${i}-indicator`);
    if (el) {
      el.classList.toggle('active', i === step);
      el.classList.toggle('completed', i < step);
    }
  }

  // Exibir apenas o painel ativo
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step-${i}-panel`);
    if (el) el.style.display = i === step ? '' : 'none';
  }

  // Atualizar visuais no Passo 2
  if (step === 2) {
    syncCustomControlsVisuals();
  }
}

function renderPersona() {
  const displayEl = document.getElementById('player-persona-display');
  if (displayEl) {
    displayEl.textContent = _persona || 'Sorteando persona...';
  }
  const flowEl = document.getElementById('flow-persona-display');
  if (flowEl) {
    flowEl.textContent = _persona || '';
  }
  const inputEl = document.getElementById('persona-name-input');
  if (inputEl) {
    inputEl.value = _persona || '';
  }
}

async function drawNewPersona() {
  if (!_sector) return;
  const sectorPersonas = PERSONAS[_sector];
  const currentIdx = sectorPersonas.indexOf(_persona);
  let newIdx = Math.floor(Math.random() * sectorPersonas.length);
  if (newIdx === currentIdx && sectorPersonas.length > 1) {
    newIdx = (newIdx + 1) % sectorPersonas.length;
  }
  const newPersona = sectorPersonas[newIdx];
  _persona = newPersona;
  renderPersona();
  try {
    await updatePlayerSector(_roomCode, _playerId, _sector, newPersona);
  } catch (err) {
    console.error('Erro ao atualizar persona:', err);
  }
}

function togglePersonaEdit(edit) {
  const displayMode = document.getElementById('persona-display-mode');
  const editMode = document.getElementById('persona-edit-mode');
  if (edit) {
    displayMode.style.display = 'none';
    editMode.style.display = 'flex';
    document.getElementById('persona-name-input').focus();
  } else {
    displayMode.style.display = 'flex';
    editMode.style.display = 'none';
  }
}

async function savePersonaName() {
  const newName = document.getElementById('persona-name-input').value.trim();
  if (!newName) return;
  _persona = newName;
  renderPersona();
  togglePersonaEdit(false);
  try {
    await updatePlayerSector(_roomCode, _playerId, _sector, newName);
  } catch (err) {
    console.error('Erro ao salvar nome da persona:', err);
  }
}

function renderDilemmas(round) {
  const container = document.getElementById('dilemmas-container');
  if (!container || !_sector) return;

  const dilemmas = DILEMMAS[round]?.[_sector] || [];
  container.innerHTML = dilemmas.map(d => {
    const isSelected = _selectedStance === d.id;
    return `
      <div class="card dilemma-card ${isSelected ? 'selected' : ''}" id="dilemma-${d.id}" onclick="selectDilemma('${d.id}')" style="cursor:pointer; padding:1rem; border:1px solid ${isSelected ? 'var(--green)' : 'var(--border)'}">
        <div style="display:flex; justify-content:space-between; align-items:center" class="mb-2">
          <div class="fw-700 text-green text-sm">${d.title}</div>
          <span class="badge badge-muted text-xs">${d.badge}</span>
        </div>
        <p class="text-sm text-300" style="margin:0">${d.flavor}</p>
      </div>
    `;
  }).join('');
}

// Fatores de conversao entre unidades do modelo e unidades do slider de cada
// parametro (c1 em %, c0 em R$/mes) e o passo de cada slider.
const SLIDER_UNIT = { c1: 100, c0: 50, I: 1, G: 1, T: 1 };
const SLIDER_STEP = { c1: 1, c0: 50, I: 1, G: 1, T: 1 };

// Restringe a faixa de um slider a uma banda em torno do valor central da
// postura escolhida, intersectada com os limites da rodada. O slider passa a
// so permitir valores coerentes com a postura (em vez do range completo).
function applyStanceRange(param, centerModel) {
  const band = STANCE_BANDS[param];
  const lim = _limits?.[param] || {};
  const limMin = lim.min != null ? lim.min : centerModel - band;
  const limMax = lim.max != null ? lim.max : centerModel + band;

  let loModel = Math.max(limMin, centerModel - band);
  let hiModel = Math.min(limMax, centerModel + band);
  // Guarda contra faixa invertida (postura fora dos limites da rodada).
  if (loModel > hiModel) { loModel = limMin; hiModel = limMax; }

  const center = clamp(centerModel, loModel, hiModel);
  const u = SLIDER_UNIT[param];
  setSlider(param, loModel * u, hiModel * u, center * u, SLIDER_STEP[param]);
}

function selectDilemma(id) {
  _selectedStance = id;
  const dilemmas = DILEMMAS[_config?.currentRound || 1]?.[_sector] || [];
  dilemmas.forEach(d => {
    const card = document.getElementById(`dilemma-${d.id}`);
    if (card) {
      const isSel = d.id === id;
      card.classList.toggle('selected', isSel);
      card.style.borderColor = isSel ? 'var(--green)' : 'var(--border)';
    }
  });

  const currentDilemma = dilemmas.find(d => d.id === id);
  if (currentDilemma && currentDilemma.presets) {
    const presets = currentDilemma.presets;
    if (_sector === 'familias') {
      if (presets.c1 !== undefined) applyStanceRange('c1', presets.c1);
      if (presets.c0 !== undefined) applyStanceRange('c0', presets.c0);
    } else if (_sector === 'empresas') {
      let val = presets.I;
      if (val === 'max') val = _limits.I.max;
      applyStanceRange('I', val);
    } else if (_sector === 'governo') {
      if (presets.G !== undefined) applyStanceRange('G', presets.G);
      if (presets.T !== undefined) applyStanceRange('T', presets.T);
    }
  }
}

function adjustC0(delta) {
  if (_lockedEarly) return;
  const slider = document.getElementById('slider-c0');
  if (!slider) return;
  const min = parseInt(slider.min);
  const max = parseInt(slider.max);
  const currentVal = parseInt(slider.value);
  const newVal = clamp(currentVal + delta, min, max);
  slider.value = newVal;
  
  const simpleSlider = document.getElementById('slider-c0-simple');
  if (simpleSlider) simpleSlider.value = newVal;

  updateSlider('c0', newVal);
}

function toggleSimpleMode(enabled) {
  _simpleMode = enabled;
  const custom = document.getElementById('custom-controls-container');
  const simple = document.getElementById('simple-sliders-container');
  if (custom) custom.style.display = enabled ? 'none' : '';
  if (simple) simple.style.display = enabled ? '' : 'none';
  if (!enabled) {
    syncCustomControlsVisuals();
  }
}

function syncSimpleSlider(param, value) {
  updateSlider(param, value);
}

function syncCustomControlsVisuals() {
  if (!_sector) return;
  const round = _config?.currentRound || 1;

  if (_sector === 'familias') {
    const c1El = document.getElementById('slider-c1');
    const c0El = document.getElementById('slider-c0');
    if (!c1El || !c0El) return;
    const c1 = parseFloat(c1El.value);
    const c0 = parseFloat(c0El.value);

    // c1 split bar
    const customValC1 = document.getElementById('custom-val-c1');
    if (customValC1) customValC1.textContent = c1.toFixed(0) + '%';
    const splitGastar = document.getElementById('split-val-gastar');
    if (splitGastar) splitGastar.textContent = c1.toFixed(0);
    const splitPoupar = document.getElementById('split-val-poupar');
    if (splitPoupar) splitPoupar.textContent = (100 - c1).toFixed(0);
    
    const fillG = document.getElementById('split-fill-gastar');
    const fillP = document.getElementById('split-fill-poupar');
    if (fillG) fillG.style.width = c1 + '%';
    if (fillP) fillP.style.width = (100 - c1) + '%';

    // c0 stepper
    const customValC0 = document.getElementById('custom-val-c0');
    if (customValC0) customValC0.textContent = fmtSliderVal('c0', c0);
    const stepperDisplay = document.getElementById('stepper-c0-display');
    if (stepperDisplay) stepperDisplay.textContent = 'R$ ' + c0.toLocaleString('pt-BR');
    const stepperBi = document.getElementById('stepper-c0-bi');
    if (stepperBi) stepperBi.textContent = Math.round(c0 / 50);
  }

  if (_sector === 'empresas') {
    const iEl = document.getElementById('slider-I');
    if (!iEl) return;
    const I = parseFloat(iEl.value);

    const customValI = document.getElementById('custom-val-I');
    if (customValI) customValI.textContent = I.toFixed(0);
  }

  if (_sector === 'governo') {
    const gEl = document.getElementById('slider-G');
    const tEl = document.getElementById('slider-T');
    if (!gEl || !tEl) return;
    const G = parseFloat(gEl.value);
    const T = parseFloat(tEl.value);
    const min = parseFloat(gEl.min);
    const max = parseFloat(gEl.max);

    const fillValG = document.getElementById('budget-fill-val-G');
    const fillValT = document.getElementById('budget-fill-val-T');
    if (fillValG) fillValG.textContent = G.toFixed(0);
    if (fillValT) fillValT.textContent = T.toFixed(0);

    const pctG = (G - min) / (Math.max(1, max - min)) * 100;
    const pctT = (T - min) / (Math.max(1, max - min)) * 100;
    const fillG = document.getElementById('budget-fill-G');
    const fillT = document.getElementById('budget-fill-T');
    if (fillG) fillG.style.height = pctG + '%';
    if (fillT) fillT.style.height = pctT + '%';

    const gap = G - T;
    const gapInd = document.getElementById('budget-gap-indicator');
    if (gapInd) {
      if (gap > 0) {
        gapInd.textContent = `Déficit: R$ ${gap.toFixed(0)}bi`;
        const threshold = ROUND_EVENTS[round].deficitThreshold;
        gapInd.className = 'badge ' + (gap > threshold ? 'badge-red' : 'badge-gold');
      } else if (gap < 0) {
        gapInd.textContent = `Superávit: R$ ${Math.abs(gap).toFixed(0)}bi`;
        gapInd.className = 'badge badge-green';
      } else {
        gapInd.textContent = 'Equilibrado';
        gapInd.className = 'badge badge-muted';
      }
    }
  }
}

function setBet(bet) {
  if (_lockedEarly) return;
  // Toque novamente na mesma opcao para cancelar a aposta (sem risco)
  _selectedBet = (bet && bet === _selectedBet) ? null : bet;

  const btnSim = document.getElementById('btn-bet-sim');
  const btnNao = document.getElementById('btn-bet-nao');
  if (btnSim && btnNao) {
    btnSim.classList.toggle('btn-primary', _selectedBet === 'sim');
    btnSim.classList.toggle('btn-secondary', _selectedBet !== 'sim');
    btnNao.classList.toggle('btn-danger', _selectedBet === 'nao');
    btnNao.classList.toggle('btn-secondary', _selectedBet !== 'nao');
  }

  // O nivel de confianca so aparece quando ha uma direcao escolhida
  const stakeRow = document.getElementById('bet-stake-row');
  if (stakeRow) stakeRow.style.display = _selectedBet ? '' : 'none';
  setBetStake(_selectedBet ? _selectedBetStake : null);
}

function setBetStake(stake) {
  if (_lockedEarly) return;
  if (stake) _selectedBetStake = stake;

  const active = (s) => _selectedBet && _selectedBetStake === s;
  const btnSeguro = document.getElementById('btn-stake-seguro');
  const btnOusado = document.getElementById('btn-stake-ousado');
  if (btnSeguro && btnOusado) {
    btnSeguro.classList.toggle('btn-primary', active('seguro'));
    btnSeguro.classList.toggle('btn-secondary', !active('seguro'));
    btnOusado.classList.toggle('btn-primary', active('ousado'));
    btnOusado.classList.toggle('btn-secondary', !active('ousado'));
  }
}

async function lockDecisionEarly() {
  const endsAt = _config?.roundEndsAt;
  if (!endsAt) return;

  const secondsLeft = Math.round((endsAt - Date.now()) / 1000);
  const early = secondsLeft >= 15;

  _lockedEarly = true;
  disableSubmissionControls();

  const values = readCurrentValues();
  const round = _config?.currentRound;
  const btn = document.getElementById('btn-lock-decision');
  setLoading(btn, true);

  try {
    await submitRoundValues(_roomCode, round, _playerId, values, _selectedStance, _selectedBet, early, _selectedBetStake);
    _lastSubmission = values;
    showView('view-submitted');
    renderSubmittedSummary(values);
  } catch (err) {
    console.error(err);
    _lockedEarly = false;
    enableSubmissionControls();
    const errEl = document.getElementById('submit-error');
    if (errEl) {
      errEl.textContent = 'Erro ao travar. Tente novamente.';
      errEl.classList.add('show');
    }
  } finally {
    setLoading(btn, false);
  }
}

function disableSubmissionControls() {
  document.querySelectorAll('#view-submit input[type="range"]').forEach(input => input.disabled = true);
  document.querySelectorAll('#view-submit button').forEach(btn => {
    if (btn.id !== 'btn-lock-decision' && btn.id !== 'btn-submit') {
      btn.disabled = true;
    }
  });
  const check = document.getElementById('toggle-simple-mode');
  if (check) check.disabled = true;
}

function enableSubmissionControls() {
  document.querySelectorAll('#view-submit input[type="range"]').forEach(input => input.disabled = false);
  document.querySelectorAll('#view-submit button').forEach(btn => btn.disabled = false);
  const check = document.getElementById('toggle-simple-mode');
  if (check) check.disabled = false;
}

function startHuddleListener(round) {
  if (_offSubmissions) _offSubmissions();

  const huddleVal   = document.getElementById('huddle-val');
  const huddleFill  = document.getElementById('huddle-fill');
  const huddleNeedle = document.getElementById('huddle-needle');
  const huddleHint  = document.getElementById('huddle-hint');

  if (!huddleVal || !_sector) return;

  _offSubmissions = onSubmissionsChange(_roomCode, round, subs => {
    const sectorPlayerIds = Object.entries(_players || {})
      .filter(([, p]) => p.sector === _sector)
      .map(([id]) => id);

    const sectorSubs = sectorPlayerIds
      .map(id => subs[id]?.values)
      .filter(Boolean);

    if (sectorSubs.length === 0) {
      huddleVal.textContent = '-';
      if (huddleFill) huddleFill.style.width = '0%';
      if (huddleNeedle) huddleNeedle.style.display = 'none';
      if (huddleHint) huddleHint.textContent = 'Ninguém enviou ainda no seu setor. Seja o primeiro!';
      return;
    }

    let avg = 0;
    let label = '';
    let pct = 0;

    if (_sector === 'familias') {
      const sumC1 = sectorSubs.reduce((acc, v) => acc + v.c1 * 100, 0);
      avg = sumC1 / sectorSubs.length;
      label = `c1 médio: ${avg.toFixed(0)}%`;
      pct = (avg - 10) / (95 - 10);
    } else if (_sector === 'empresas') {
      const sumI = sectorSubs.reduce((acc, v) => acc + v.I, 0);
      avg = sumI / sectorSubs.length;
      label = `I médio: R$ ${avg.toFixed(0)}bi`;
      const iMax = _limits?.I?.max || 200;
      pct = (avg - 10) / (iMax - 10);
    } else if (_sector === 'governo') {
      const sumG = sectorSubs.reduce((acc, v) => acc + v.G, 0);
      avg = sumG / sectorSubs.length;
      label = `G médio: R$ ${avg.toFixed(0)}bi`;
      pct = (avg - 20) / (200 - 20);
    }

    huddleVal.textContent = label;
    if (huddleFill) huddleFill.style.width = (pct * 100) + '%';
    if (huddleNeedle) {
      huddleNeedle.style.left = (pct * 100) + '%';
      huddleNeedle.style.display = '';
    }
    if (huddleHint) {
      huddleHint.textContent = `${sectorSubs.length} de ${sectorPlayerIds.length} colegas enviaram no seu setor.`;
    }
  });
}

