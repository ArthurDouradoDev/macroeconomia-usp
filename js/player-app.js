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
    showFatalError('Sessao invalida. Por favor, entre na sala novamente.');
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
      showFatalError('Sala nao encontrada. O jogo pode ter sido encerrado.');
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
      document.getElementById('conn-label').textContent = connected ? 'Conectado' : 'Sem conexao';
    });

  } catch (err) {
    console.error(err);
    showFatalError('Erro ao conectar. Verifique sua internet e recarregue a pagina.');
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
  for (const sector of ['familias', 'empresas', 'governo']) {
    const count = Object.values(_players).filter(p => p.sector === sector).length;
    const el    = document.getElementById(`count-badge-${sector}`);
    if (el) el.textContent = count;

    // Desabilitar se lotado (15 jogadores)
    const btn = document.getElementById(`card-${sector}`);
    if (btn) {
      const isMine   = _sector === sector;
      const isFull   = count >= 15 && !isMine;
      btn.disabled   = isFull;
      btn.classList.toggle(`selected-${sector}`, isMine);
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
  try {
    await updatePlayerSector(_roomCode, _playerId, sector);
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
  }
}

// ── Tela de espera ────────────────────────────────────────────

function setupWaitingView(msg) {
  document.querySelectorAll('.waiting-room-code').forEach(el => el.textContent = _roomCode);
  document.getElementById('waiting-message').textContent = msg;

  const sectorIcons = { familias: 'ti-home', empresas: 'ti-building-factory', governo: 'ti-building-bank' };
  const sectorNames = { familias: 'Familias', empresas: 'Empresas', governo: 'Governo' };
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
  const event = ROUND_EVENTS[round];

  // Banner
  document.getElementById('submit-round-label').textContent  = `Rodada ${round} de 3`;
  document.getElementById('submit-event-name').textContent   = event.name;
  document.getElementById('submit-event-desc').textContent   = event.description;

  // Mostrar apenas os sliders do setor do jogador
  ['familias', 'empresas', 'governo'].forEach(s => {
    document.getElementById(`sliders-${s}`).style.display = s === _sector ? '' : 'none';
  });

  // Configurar limites dos sliders
  applyLimitsToSliders(round);

  // Atualizar preview de déficit (Governo)
  if (_sector === 'governo') {
    updateDeficitPreview();
  }
}

function applyLimitsToSliders(round) {
  const limits = _limits;

  if (_sector === 'familias') {
    setSlider('c1', limits.c1.min, limits.c1.max, 0.70, 0.01);
    setSlider('c0', limits.c0.min, limits.c0.max, 50, 1);

    // Badge de limite reduzido
    const c0Limited = round === 2 && limits.c0.max < 100;
    document.getElementById('badge-c0-limit').style.display = c0Limited ? '' : 'none';
  }

  if (_sector === 'empresas') {
    setSlider('I', limits.I.min, limits.I.max, Math.min(80, limits.I.max), 1);

    const iLimited = round >= 2;
    document.getElementById('badge-I-limit').style.display = iLimited ? '' : 'none';
    const iLimitedByCrisis = round === 2 && limits.I.max < 200;
    if (iLimitedByCrisis) {
      document.getElementById('badge-I-limit').style.display = '';
    }

    // Mostrar informação de poupança
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
    if (_sector === 'familias') msg = 'Crise de confianca: o limite maximo de c₀ caiu de R$100bi para R$60bi.';
    else if (_sector === 'empresas') msg = 'Crise de confianca: o limite maximo de I caiu de R$200bi para R$120bi.';
    if (msg) {
      warnText.textContent = msg;
      warnEl.style.display = '';
    }
  } else {
    document.getElementById('crisis-warning').style.display = 'none';
  }
}

function setSlider(id, min, max, defaultVal, step) {
  const slider = document.getElementById(`slider-${id}`);
  const valEl  = document.getElementById(`val-${id}`);
  const minEl  = document.getElementById(`min-${id}`);
  const maxEl  = document.getElementById(`max-${id}`);
  if (!slider) return;

  slider.min  = min;
  slider.max  = max;
  slider.step = step;

  const safeDefault = Math.min(Math.max(defaultVal, min), max);
  slider.value = safeDefault;

  if (valEl) {
    valEl.textContent = id === 'c1' ? Number(safeDefault).toFixed(2) : Math.round(safeDefault);
  }
  if (minEl) minEl.textContent = id === 'c1' ? Number(min).toFixed(2) : min;
  if (maxEl) maxEl.textContent = id === 'c1' ? Number(max).toFixed(2) : max;
}

function updateSlider(id, value) {
  const valEl = document.getElementById(`val-${id}`);
  if (valEl) {
    valEl.textContent = id === 'c1' ? Number(value).toFixed(2) : Math.round(value);
  }
  // Atualizar preview de déficit ao mover G ou T
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
    statEl.innerHTML = `<span class="text-gold">Deficit de R$${deficit.toFixed(0)}bi (dentro do limite de R$${event.deficitThreshold}bi).</span>`;
  } else {
    statEl.innerHTML = `<span class="text-green">Orcamento equilibrado ou superavitario.</span>`;
  }
}

// ── Submissão de valores ──────────────────────────────────────

async function submitDecision() {
  const btn   = document.getElementById('btn-submit');
  const errEl = document.getElementById('submit-error');
  errEl.classList.remove('show');

  let values = {};

  if (_sector === 'familias') {
    values = {
      c1: parseFloat(document.getElementById('slider-c1').value),
      c0: parseFloat(document.getElementById('slider-c0').value)
    };
  } else if (_sector === 'empresas') {
    values = {
      I: parseFloat(document.getElementById('slider-I').value)
    };
  } else if (_sector === 'governo') {
    values = {
      G: parseFloat(document.getElementById('slider-G').value),
      T: parseFloat(document.getElementById('slider-T').value)
    };
  }

  setLoading(btn, true);

  try {
    const round = _config?.currentRound;
    await submitRoundValues(_roomCode, round, _playerId, values);
    _lastSubmission = values;
    showView('view-submitted');
    renderSubmittedSummary(values);
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Erro ao enviar. Tente novamente.';
    errEl.classList.add('show');
  } finally {
    setLoading(btn, false);
  }
}

function renderSubmittedSummary(values) {
  const el = document.getElementById('submitted-summary');
  const items = Object.entries(values).map(([k, v]) => {
    const labels = {
      c1: 'c&#8321; Propensao a consumir',
      c0: 'c&#8320; Consumo autonomo',
      I:  'I Investimento',
      G:  'G Gastos do governo',
      T:  'T Impostos'
    };
    const fmt = k === 'c1' ? Number(v).toFixed(2) : `R$${Math.round(v)}bi`;
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

function renderRoundResult(result, round) {
  // PIB
  document.getElementById('result-round-label').textContent = `Rodada ${round} de 3`;
  document.getElementById('result-Y').textContent = fmtNum(result.Y, 0);

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
  const sectorNames = { familias: 'Familias', empresas: 'Empresas', governo: 'Governo' };
  sectorTitle.textContent = `Contribuicao do setor ${sectorNames[_sector] || ''}`;

  let detailRows = [];
  if (_sector === 'familias') {
    detailRows = [
      { label: 'c&#8321; medio do setor', value: result.c1Eff?.toFixed(2) },
      { label: 'c&#8320; medio do setor', value: fmtBI(result.c0Raw) },
      { label: 'Multiplicador gerado', value: `${result.multiplier?.toFixed(2)}x` },
    ];
  } else if (_sector === 'empresas') {
    detailRows = [
      { label: 'I medio do setor', value: fmtBI(result.IEff) },
    ];
    if (result.limits?.I?.limitedBySavings) {
      detailRows.push({ label: 'Limite pela poupanca anterior', value: fmtBI(result.limits.I.max) });
    }
  } else if (_sector === 'governo') {
    detailRows = [
      { label: 'G medio do setor', value: fmtBI(result.GEff) },
      { label: 'T medio do setor', value: fmtBI(result.TEff) },
      { label: 'Deficit (G - T)',  value: fmtBI(result.deficit) },
    ];
    if (result.penaltyInfo?.penaltyApplied) {
      detailRows.push({ label: 'Penalidade de deficit', value: `-${(result.penaltyInfo.penaltyRate * 100).toFixed(0)}% em c&#8320;` });
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
    { label: 'Renda disponivel', value: fmtBI(result.disposableIncome) },
    { label: 'Poupanca privada', value: fmtBI(result.privateSavings) },
    { label: 'Poupanca publica', value: fmtBI(result.publicSavings) },
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

  // Resumo do setor do jogador
  const sectorNames = { familias: 'Familias', empresas: 'Empresas', governo: 'Governo' };
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
      rows = [`G = ${fmtBI(res.GEff)} | T = ${fmtBI(res.TEff)} | deficit = ${fmtBI(res.deficit)}`];
    }
    return `<div class="insight-item"><span class="fw-700">Rod. ${r}:</span> ${rows.join(' | ')}</div>`;
  }).join('');

  // Conclusão
  const insights = generateFinalInsights(results);
  document.getElementById('final-conclusion').innerHTML = insights.map(i =>
    `<li class="insight-item"><i class="ti ti-info-circle"></i> ${i}</li>`
  ).join('') || `<li class="insight-item text-muted">Jogo concluido.</li>`;
}
