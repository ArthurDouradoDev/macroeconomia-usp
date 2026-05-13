// ============================================================
// LÓGICA DA INTERFACE DO MESTRE
// ============================================================

let _roomCode  = null;
let _masterKey = null;
let _players   = {};
let _config    = null;
let _offConfig    = null;
let _offPlayers   = null;
let _offSubmissions = null;
let _timerInterval = null;
let _currentResult = null;    // resultado da rodada sendo revelada
let _allResults    = {};      // resultados de todas as rodadas
let _animPhase     = 0;
let _animTimers    = [];
let _manualMode    = true;    // padrão: avançar fases manualmente

// ── Utilitários de UI ─────────────────────────────────────────

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

function clearError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.classList.remove('show');
}

function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn._origHTML = btn.innerHTML;
    btn.innerHTML = '<div class="spinner"></div> Aguarde...';
  } else {
    btn.disabled = false;
    if (btn._origHTML) btn.innerHTML = btn._origHTML;
  }
}

function showConfirm(id) { document.getElementById(id).classList.add('show'); }
function hideConfirm(id) { document.getElementById(id).classList.remove('show'); }

function fmtNum(n, decimals = 0) {
  return Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function fmtBI(n) { return `R$${fmtNum(n)}bi`; }

// ── Inicialização a partir da URL ─────────────────────────────

(function init() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('room');
  const key    = params.get('key');

  if (code) document.getElementById('m-room-code').value = code.toUpperCase();
  if (key)  document.getElementById('m-master-key').value = key;

  // Se vieram na URL, tentar login automático
  if (code && key) masterLogin();

  // Formatar input do código
  document.getElementById('m-room-code').addEventListener('input', function () {
    this.value = this.value.toUpperCase().replace(/[^A-Z]/g, '');
  });
  document.getElementById('m-master-key').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '');
  });
  document.getElementById('m-master-key').addEventListener('keydown', e => {
    if (e.key === 'Enter') masterLogin();
  });
})();

// ── Login do mestre ───────────────────────────────────────────

async function masterLogin() {
  clearError('login-error');
  const code = document.getElementById('m-room-code').value.trim().toUpperCase();
  const key  = document.getElementById('m-master-key').value.trim();
  const btn  = document.getElementById('btn-login');

  if (code.length !== 4) {
    showError('login-error', 'Digite o codigo de 4 letras da sala.');
    return;
  }
  if (!/^\d{4}$/.test(key)) {
    showError('login-error', 'A senha deve ter 4 digitos numericos.');
    return;
  }

  setLoading(btn, true);

  try {
    const exists = await roomExists(code);
    if (!exists) {
      showError('login-error', 'Sala nao encontrada.');
      return;
    }

    const config = await getRoom(code);
    if (!config) {
      showError('login-error', 'Erro ao carregar a sala.');
      return;
    }
    if (config.masterKey !== key) {
      showError('login-error', 'Senha incorreta.');
      return;
    }

    _roomCode  = code;
    _masterKey = key;
    _config    = config;

    // Atualizar URL sem recarregar (para facilitar reload)
    history.replaceState(null, '', `master.html?room=${code}&key=${key}`);

    startMasterSession();

  } catch (err) {
    console.error(err);
    showError('login-error', 'Erro de conexao. Tente novamente.');
  } finally {
    setLoading(btn, false);
  }
}

// ── Sessão do mestre ──────────────────────────────────────────

function startMasterSession() {
  // Carregar resultados anteriores
  getAllResults(_roomCode).then(r => { _allResults = r || {}; });

  // Listener de jogadores
  _offPlayers = onPlayersChange(_roomCode, players => {
    _players = players;
    if (_config?.status === 'lobby') updateLobbyView();
  });

  // Listener de configuração
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
}

function routeView(config) {
  const status = config.status;

  if (status === 'lobby') {
    showView('view-lobby');
    document.getElementById('lobby-room-code').textContent = _roomCode;
    document.getElementById('lobby-code-big').textContent  = _roomCode;
    updateLobbyView();

  } else if (status === 'round_1' || status === 'round_2' || status === 'round_3') {
    const round = config.currentRound;
    showView('view-round');
    setupRoundView(round);

  } else if (status === 'results_1' || status === 'results_2' || status === 'results_3') {
    const round = config.currentRound;
    // Carregar o resultado e mostrar a animação (se ainda não foi mostrada)
    getRoundResult(_roomCode, round).then(result => {
      if (result) {
        _currentResult = result;
        _allResults[`round_${round}`] = result;
        startRevealAnimation(round, result);
      }
    });

  } else if (status === 'results') {
    getAllResults(_roomCode).then(raw => {
      const results = {};
      for (const key of Object.keys(raw || {})) {
        const n = parseInt(key.replace('round_', ''));
        results[n] = raw[key];
      }
      showFinalResults(results);
    });

  } else if (status === 'closed') {
    showView('view-closed');
  }
}

// ── Lobby ─────────────────────────────────────────────────────

function updateLobbyView() {
  const counts = { familias: 0, empresas: 0, governo: 0, unsectored: 0 };
  const listEl = document.getElementById('player-list');
  listEl.innerHTML = '';

  for (const [id, p] of Object.entries(_players)) {
    if (p.sector) counts[p.sector] = (counts[p.sector] || 0) + 1;
    else counts.unsectored++;

    const sectorLabel = p.sector
      ? `<span class="badge ${p.sector === 'familias' ? 'badge-green' : p.sector === 'empresas' ? 'badge-blue' : 'badge-gold'}">${sectorName(p.sector)}</span>`
      : `<span class="badge badge-muted">sem setor</span>`;

    listEl.innerHTML += `
      <div class="player-item">
        <i class="ti ti-user text-muted"></i>
        <span class="player-item-name">${esc(p.name)}</span>
        <span class="player-item-sector">${sectorLabel}</span>
      </div>`;
  }

  document.getElementById('count-familias').textContent = counts.familias;
  document.getElementById('count-empresas').textContent  = counts.empresas;
  document.getElementById('count-governo').textContent   = counts.governo;
  document.getElementById('total-players').textContent   = Object.keys(_players).length;

  const canStart = counts.familias >= 1 && counts.empresas >= 1 && counts.governo >= 1;
  document.getElementById('btn-start-round').disabled = !canStart;
  const warn = document.getElementById('lobby-warning');
  if (canStart) warn.classList.remove('show');
  else warn.classList.add('show');
}

function sectorName(s) {
  return s === 'familias' ? 'Familias' : s === 'empresas' ? 'Empresas' : 'Governo';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Iniciar rodada ────────────────────────────────────────────

async function startRound(round) {
  const btn = document.getElementById('btn-start-round');
  setLoading(btn, true);
  try {
    await updateRoomStatus(_roomCode, `round_${round}`, round);
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(btn, false);
  }
}

// ── View de rodada ativa ──────────────────────────────────────

function setupRoundView(round) {
  const event = ROUND_EVENTS[round];
  document.getElementById('round-label-active').textContent    = `Rodada ${round} de 3`;
  document.getElementById('round-event-name-active').textContent = event.name;
  document.getElementById('round-event-desc-active').textContent  = event.description;

  startTimer();

  // Listener de submissões
  if (_offSubmissions) _offSubmissions();
  _offSubmissions = onSubmissionsChange(_roomCode, round, subs => {
    updateSubmissionCounts(subs, round);
  });
}

function startTimer() {
  if (_timerInterval) clearInterval(_timerInterval);
  let seconds = 180;

  function tick() {
    const m  = Math.floor(seconds / 60);
    const s  = seconds % 60;
    const el = document.getElementById('timer-display');
    if (!el) return;
    el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    el.className   = 'timer-value' + (seconds <= 30 ? ' urgent' : seconds <= 60 ? ' warning' : '');
    if (seconds <= 0) { clearInterval(_timerInterval); return; }
    seconds--;
  }

  tick();
  _timerInterval = setInterval(tick, 1000);
}

function updateSubmissionCounts(subs, round) {
  const el = document.getElementById('submission-counts');
  if (!el) return;

  const sectors = ['familias', 'empresas', 'governo'];
  let html = '';

  for (const sector of sectors) {
    const total = Object.values(_players).filter(p => p.sector === sector).length;
    const submitted = Object.entries(_players)
      .filter(([id, p]) => p.sector === sector && subs[id]?.values)
      .length;
    const allIn = submitted === total && total > 0;

    const icon = sector === 'familias' ? 'ti-home' : sector === 'empresas' ? 'ti-building-factory' : 'ti-building-bank';
    const color = sector === 'familias' ? 'sector-familias' : sector === 'empresas' ? 'sector-empresas' : 'sector-governo';

    html += `
      <div class="sub-count-row">
        <span class="sub-count-sector">
          <i class="ti ${icon} ${color}"></i>
          ${sectorName(sector)}
        </span>
        <span class="sub-count-nums ${allIn ? 'all-in' : ''}">
          ${submitted}/${total} enviaram ${allIn ? '<i class="ti ti-check"></i>' : ''}
        </span>
      </div>`;
  }

  el.innerHTML = html;
}

// ── Fechar rodada ─────────────────────────────────────────────

function requestCloseRound() {
  const round = _config?.currentRound;
  const subs  = {}; // já temos pelo listener mas vamos buscar frescos ao confirmar
  const notSubmitted = Object.values(_players)
    .filter(p => p.sector && true).length; // simplificado: mostrar aviso generico
  document.getElementById('confirm-close-desc').textContent =
    `Jogadores que nao enviaram usarao os valores padrao. Esta acao nao pode ser desfeita.`;
  showConfirm('confirm-close');
}

async function closeRoundConfirmed() {
  hideConfirm('confirm-close');
  if (_timerInterval) clearInterval(_timerInterval);

  const round = _config?.currentRound;
  const btn   = document.getElementById('btn-close-round');
  setLoading(btn, true);

  try {
    const [subs, prevResultRaw] = await Promise.all([
      getSubmissions(_roomCode, round),
      round >= 2 ? getRoundResult(_roomCode, round - 1) : Promise.resolve(null)
    ]);

    const result = computeRoundResult(subs, _players, round, prevResultRaw);
    await saveRoundResult(_roomCode, round, result);
    await updateRoomStatus(_roomCode, `results_${round}`, round);

  } catch (err) {
    console.error('Erro ao fechar rodada:', err);
  } finally {
    // Sempre restaura o botão — se deu certo a view muda de qualquer forma
    setLoading(btn, false);
  }
}

// ── Animação de revelação ─────────────────────────────────────

function activateRevealPhase(n) {
  _animPhase = n;
  document.querySelectorAll('.calc-phase').forEach(el => el.classList.remove('active'));
  document.getElementById(`phase-${n}`).classList.add('active');
  for (let i = 1; i <= 7; i++) {
    const dot = document.getElementById(`pdot-${i}`);
    if (!dot) continue;
    dot.className = 'phase-dot ' + (i < n ? 'done' : i === n ? 'current' : '');
  }
  if (n === 6) runCountUp(_currentResult.Y);

  // Em modo manual: mostrar "Próximo" nas fases 1-6, ocultar na fase 7
  const nextBtn = document.getElementById('btn-next-phase');
  if (nextBtn) nextBtn.style.display = (_manualMode && n < 7) ? '' : 'none';
}

function manualNextPhase() {
  if (_animPhase < 7) activateRevealPhase(_animPhase + 1);
}

function toggleRevealMode() {
  _manualMode = !_manualMode;
  const modeBtn = document.getElementById('btn-toggle-mode');
  const nextBtn = document.getElementById('btn-next-phase');

  if (_manualMode) {
    modeBtn.innerHTML = '<i class="ti ti-hand-click"></i> Manual';
    modeBtn.className = 'btn btn-secondary btn-sm btn-inline';
    // Cancelar timers automáticos restantes
    _animTimers.forEach(t => clearTimeout(t));
    _animTimers = [];
    if (nextBtn) nextBtn.style.display = _animPhase < 7 ? '' : 'none';
  } else {
    modeBtn.innerHTML = '<i class="ti ti-player-play"></i> Auto';
    modeBtn.className = 'btn btn-gold btn-sm btn-inline';
    if (nextBtn) nextBtn.style.display = 'none';
    // Disparar timers para as fases restantes a partir da atual
    const durations = [5000, 5000, 10000, 5000, 5000, 5000, 0];
    let elapsed = 0;
    for (let i = _animPhase; i < durations.length - 1; i++) {
      elapsed += durations[i];
      const phase = i + 2;
      const t = setTimeout(() => activateRevealPhase(phase), elapsed);
      _animTimers.push(t);
    }
  }
}

function startRevealAnimation(round, result) {
  _currentResult = result;
  showView('view-reveal');

  _animTimers.forEach(t => clearTimeout(t));
  _animTimers = [];
  _animPhase = 0;

  // Resetar toggle para manual (padrão a cada nova rodada)
  _manualMode = true;
  const modeBtn = document.getElementById('btn-toggle-mode');
  if (modeBtn) {
    modeBtn.innerHTML = '<i class="ti ti-hand-click"></i> Manual';
    modeBtn.className = 'btn btn-secondary btn-sm btn-inline';
  }

  // Construir barra de progresso
  const prog = document.getElementById('phase-progress');
  prog.innerHTML = Array.from({ length: 7 }, (_, i) =>
    `<div class="phase-dot" id="pdot-${i + 1}"></div>`
  ).join('');

  const prevResult = _allResults[`round_${round - 1}`] || null;

  fillPhase1(result);
  fillPhase2(result, round);
  fillPhase3(result);
  fillPhase4(result);
  fillPhase5(result);
  fillPhase6(result);
  fillPhase7(result, prevResult, round);

  activateRevealPhase(1);
  // Modo manual: não configura timers — o mestre clica em "Próximo"
}

function skipToResult() {
  _animTimers.forEach(t => clearTimeout(t));
  _animTimers = [];
  const round = _config?.currentRound;
  const prevResult = _allResults[`round_${round - 1}`] || null;
  fillPhase7(_currentResult, prevResult, round);
  activateRevealPhase(7);
}

// Fase 1: valores de cada setor
function fillPhase1(result) {
  const el = document.getElementById('phase1-sectors');
  const sectors = [
    { name: 'Familias', icon: 'ti-home', color: 'green', values: [
        { label: 'c&#8320; (consumo autonomo)', value: `R$${result.c0Raw?.toFixed(1)}bi` },
        { label: 'c&#8321; (propensao a consumir)', value: result.c1Eff?.toFixed(2) }
    ]},
    { name: 'Empresas', icon: 'ti-building-factory', color: 'blue', values: [
        { label: 'I (investimento)', value: `R$${result.IEff?.toFixed(1)}bi` }
    ]},
    { name: 'Governo', icon: 'ti-building-bank', color: 'gold', values: [
        { label: 'G (gastos)', value: `R$${result.GEff?.toFixed(1)}bi` },
        { label: 'T (impostos)', value: `R$${result.TEff?.toFixed(1)}bi` }
    ]}
  ];

  el.innerHTML = sectors.map(s => `
    <div class="card mb-3" style="border-color:var(--${s.color})">
      <div class="sector-card-top mb-2">
        <div class="sector-card-icon ${s.name.toLowerCase()}">
          <i class="ti ${s.icon} text-${s.color}"></i>
        </div>
        <div class="fw-700">${s.name}</div>
      </div>
      ${s.values.map(v => `
        <div class="sector-summary-row">
          <span class="sector-summary-label">${v.label}</span>
          <span class="sector-summary-value">${v.value}</span>
        </div>`).join('')}
    </div>`).join('');
}

// Fase 2: verificar restrições e penalidades
function fillPhase2(result, round) {
  const el = document.getElementById('phase2-content');
  const p  = result.penaltyInfo;
  let html = '';

  if (p.penaltyApplied) {
    html += `
      <div class="deficit-warning mb-3">
        <strong><i class="ti ti-alert-triangle"></i> Penalidade de deficit fiscal</strong><br>
        Deficit (G - T) = R$${p.deficit.toFixed(0)}bi > limiar de R$${p.threshold}bi.<br>
        c&#8320; reduzido em ${(p.penaltyRate * 100).toFixed(0)}%: de R$${result.c0Raw?.toFixed(1)}bi para R$${result.c0Eff?.toFixed(1)}bi.
      </div>`;
  } else {
    html += `
      <div style="display:flex;align-items:center;gap:.75rem;padding:1rem;background:rgba(0,230,118,.08);border-radius:8px">
        <i class="ti ti-circle-check text-green" style="font-size:1.5rem"></i>
        <div>
          <div class="fw-700 text-green">Sem penalidades</div>
          <div class="text-sm text-muted">Deficit = R$${p.deficit.toFixed(0)}bi (dentro do limite de R$${p.threshold}bi)</div>
        </div>
      </div>`;
  }

  if (result.limits?.I?.limitedBySavings) {
    html += `
      <div class="card mt-3" style="border-color:var(--blue)">
        <div class="text-sm text-muted mb-1">Restricao de investimento</div>
        <div>Poupanca da rodada anterior: <strong class="mono">R$${result.limits.I.prevSavings?.toFixed(0)}bi</strong></div>
        <div>Investimento maximo: <strong class="mono">R$${result.limits.I.max?.toFixed(0)}bi</strong></div>
        ${result.limits.I.undercapitalized ? `<div class="badge badge-red mt-2">Economia descapitalizada</div>` : ''}
      </div>`;
  }

  el.innerHTML = html;
}

// Fase 3: equação com substituição progressiva
function fillPhase3(result) {
  const el = document.getElementById('phase3-equation');
  const { c0Eff: c0, c1Eff: c1, IEff: I, GEff: G, TEff: T } = result;

  el.innerHTML = `
    <div>Y = [1 / (1 - <span class="eq-highlight">c&#8321;</span>)] &times; [<span class="eq-highlight">c&#8320;</span> + <span class="eq-highlight">I</span> + <span class="eq-highlight">G</span> - <span class="eq-highlight">c&#8321;</span> &times; <span class="eq-highlight">T</span>]</div>
    <div class="mt-3 text-muted" style="font-size:.85rem">Substituindo os valores:</div>
    <div class="mt-2">Y = [1 / (1 - <span class="eq-highlight">${c1?.toFixed(2)}</span>)] &times; [<span class="eq-highlight">${c0?.toFixed(1)}</span> + <span class="eq-highlight">${I?.toFixed(1)}</span> + <span class="eq-highlight">${G?.toFixed(1)}</span> - <span class="eq-highlight">${c1?.toFixed(2)}</span> &times; <span class="eq-highlight">${T?.toFixed(1)}</span>]</div>
  `;
}

// Fase 4: multiplicador
function fillPhase4(result) {
  const el  = document.getElementById('phase4-mult');
  const num = document.getElementById('phase4-number');
  const c1  = result.c1Eff;
  el.innerHTML = `
    <div>Multiplicador = 1 / (1 - ${c1?.toFixed(2)}) = 1 / ${(1 - c1).toFixed(2)} = <span class="eq-highlight">${result.multiplier?.toFixed(2)}</span></div>`;
  num.textContent = `${result.multiplier?.toFixed(2)}x`;
}

// Fase 5: gasto autônomo
function fillPhase5(result) {
  const el = document.getElementById('phase5-auto');
  const { c0Eff: c0, c1Eff: c1, IEff: I, GEff: G, TEff: T, autonomousSpending: A } = result;
  el.innerHTML = `
    <div>Gasto autonomo = c&#8320; + I + G - c&#8321; &times; T</div>
    <div class="mt-2">= ${c0?.toFixed(1)} + ${I?.toFixed(1)} + ${G?.toFixed(1)} - ${c1?.toFixed(2)} &times; ${T?.toFixed(1)}</div>
    <div class="mt-2">= <span class="eq-highlight">${A?.toFixed(2)} bilhoes</span></div>
  `;
}

// Fase 6: PIB de equilíbrio + métricas
function fillPhase6(result) {
  const el = document.getElementById('phase6-metrics');
  el.innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Consumo total</div>
      <div class="metric-value">${fmtBI(result.consumption)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Poupanca privada</div>
      <div class="metric-value">${fmtBI(result.privateSavings)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Poupanca publica</div>
      <div class="metric-value">${fmtBI(result.publicSavings)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Poupanca total</div>
      <div class="metric-value">${fmtBI(result.totalSavings)}</div>
    </div>
  `;

  const isEl = document.getElementById('phase6-is');
  isEl.innerHTML = `
    <div class="is-verify-icon ${result.isBalance ? 'ok' : 'err'}">
      <i class="ti ${result.isBalance ? 'ti-check' : 'ti-x'}"></i>
    </div>
    <div>
      <div class="fw-700">${result.isBalance ? 'Relacao IS verificada' : 'IS nao balanceou'}</div>
      <div class="text-sm text-muted">I = ${fmtBI(result.IEff)} | S_total = ${fmtBI(result.totalSavings)}</div>
    </div>
  `;
}

// Fase 7: painel resumo (permanece visível)
function fillPhase7(result, prevResult, round) {
  // Parâmetros
  const params = document.getElementById('phase7-params');
  params.innerHTML = [
    { label: 'c&#8320; efetivo', value: fmtBI(result.c0Eff) },
    { label: 'c&#8321; efetivo', value: result.c1Eff?.toFixed(2) },
    { label: 'I efetivo',        value: fmtBI(result.IEff) },
    { label: 'G efetivo',        value: fmtBI(result.GEff) },
    { label: 'T efetivo',        value: fmtBI(result.TEff) },
  ].map(r => `
    <div class="sector-summary-row">
      <span class="sector-summary-label">${r.label}</span>
      <span class="sector-summary-value">${r.value}</span>
    </div>`).join('');

  // Resultados
  const res = document.getElementById('phase7-results');
  res.innerHTML = [
    { label: 'PIB (Y)',            value: fmtBI(result.Y) },
    { label: 'Multiplicador',      value: `${result.multiplier?.toFixed(2)}x` },
    { label: 'Consumo total',      value: fmtBI(result.consumption) },
    { label: 'Renda disponivel',   value: fmtBI(result.disposableIncome) },
    { label: 'Poupanca privada',   value: fmtBI(result.privateSavings) },
    { label: 'Poupanca publica',   value: fmtBI(result.publicSavings) },
    { label: 'Poupanca total',     value: fmtBI(result.totalSavings) },
  ].map(r => `
    <div class="metric-card">
      <div class="metric-label">${r.label}</div>
      <div class="metric-value">${r.value}</div>
    </div>`).join('');

  // Penalidade
  const penEl = document.getElementById('phase7-penalty');
  if (result.penaltyInfo?.penaltyApplied) {
    penEl.style.display = '';
    penEl.innerHTML = `<i class="ti ti-alert-triangle"></i> Penalidade fiscal: deficit de ${fmtBI(result.penaltyInfo.deficit)} reduziu c&#8320; em ${(result.penaltyInfo.penaltyRate * 100).toFixed(0)}%.`;
  } else {
    penEl.style.display = 'none';
  }

  // IS
  const isEl = document.getElementById('phase7-is');
  isEl.innerHTML = `
    <div class="is-verify-icon ${result.isBalance ? 'ok' : 'err'}">
      <i class="ti ${result.isBalance ? 'ti-check' : 'ti-x'}"></i>
    </div>
    <div>
      <div class="fw-700">${result.isBalance ? 'Relacao IS verificada' : 'IS nao balanceou'}</div>
      <div class="text-sm text-muted">I = ${fmtBI(result.IEff)} | S = ${fmtBI(result.totalSavings)}</div>
    </div>`;

  // Insights
  const insights = generateRoundInsights(result, prevResult, round);
  document.getElementById('phase7-insights').innerHTML = insights.map(i =>
    `<li class="insight-item"><i class="ti ti-info-circle"></i> ${i}</li>`
  ).join('');

  // Botão avançar
  document.getElementById('phase7-round').textContent = round;
  const advBtn    = document.getElementById('btn-advance');
  const advLabel  = document.getElementById('btn-advance-label');
  if (round < 3) {
    advLabel.textContent = `Avancar para Rodada ${round + 1}`;
    advBtn.style.display = '';
  } else {
    advLabel.textContent = 'Ver Resultado Final';
    advBtn.style.display = '';
  }
}

// Count-up animado para o PIB
function runCountUp(target) {
  const el       = document.getElementById('phase6-Y');
  const duration = 2500;
  const steps    = 60;
  const stepMs   = duration / steps;
  let current    = 0;
  let step       = 0;

  const interval = setInterval(() => {
    step++;
    current = Math.round((target / steps) * step);
    if (step >= steps) {
      current = target;
      clearInterval(interval);
    }
    el.textContent = fmtNum(current, 0);
  }, stepMs);
}

// ── Avançar para próxima rodada / resultado final ─────────────

async function advanceGame() {
  const round = _config?.currentRound;
  const btn   = document.getElementById('btn-advance');
  setLoading(btn, true);

  try {
    if (round < 3) {
      await updateRoomStatus(_roomCode, `round_${round + 1}`, round + 1);
    } else {
      await updateRoomStatus(_roomCode, 'results', 3);
    }
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(btn, false);
  }
}

// ── Resultado final ───────────────────────────────────────────

async function showFinalResults(results) {
  _allResults = results;
  showView('view-final');

  const rounds   = [1, 2, 3].filter(r => results[r]);
  const yValues  = rounds.map(r => results[r].Y);
  const maxY     = Math.max(...yValues);
  const minY     = Math.min(...yValues);

  // Grafico de barras
  const chartEl = document.getElementById('final-bar-chart');
  chartEl.innerHTML = rounds.map(r => {
    const y      = results[r].Y;
    const pct    = maxY > 0 ? (y / maxY) * 100 : 0;
    const cls    = y === maxY ? 'best' : y === minY ? 'worst' : '';
    return `
      <div class="bar-group">
        <div class="bar-value">${fmtNum(y, 0)}</div>
        <div class="bar-fill ${cls}" style="height:${pct}%"></div>
        <div class="bar-label">Rodada ${r}<br><small>${ROUND_EVENTS[r].name.split(' ')[0]}</small></div>
      </div>`;
  }).join('');

  // Tabela comparativa
  const tableEl = document.getElementById('final-rounds-table');
  tableEl.innerHTML = rounds.map(r => {
    const res = results[r];
    return `
      <div class="card mb-3">
        <div class="fw-700 mb-2">Rodada ${r}: ${ROUND_EVENTS[r].name}</div>
        <div class="metrics-grid">
          ${[
            { label: 'PIB (Y)', value: fmtBI(res.Y) },
            { label: 'Multiplicador', value: `${res.multiplier?.toFixed(2)}x` },
            { label: 'c&#8321;', value: res.c1Eff?.toFixed(2) },
            { label: 'Poupanca total', value: fmtBI(res.totalSavings) },
          ].map(m => `
            <div class="metric-card">
              <div class="metric-label">${m.label}</div>
              <div class="metric-value">${m.value}</div>
            </div>`).join('')}
        </div>
        ${res.penaltyInfo?.penaltyApplied ? `<div class="deficit-warning mt-2 text-sm"><i class="ti ti-alert-triangle"></i> Penalidade de deficit aplicada.</div>` : ''}
      </div>`;
  }).join('');

  // Destaques
  const insights = generateFinalInsights(results);
  document.getElementById('final-insights').innerHTML = insights.map(i =>
    `<li class="insight-item"><i class="ti ti-info-circle"></i> ${i}</li>`
  ).join('') || '<li class="insight-item text-muted">Dados insuficientes para destaques.</li>';

  // IS checks
  const isChecks = document.getElementById('final-is-checks');
  isChecks.innerHTML = rounds.map(r => {
    const res = results[r];
    return `
      <div class="is-verify mt-2">
        <div class="is-verify-icon ${res.isBalance ? 'ok' : 'err'}">
          <i class="ti ${res.isBalance ? 'ti-check' : 'ti-x'}"></i>
        </div>
        <div>
          <div class="fw-700">Rodada ${r}: ${res.isBalance ? 'IS balanceado' : 'IS desbalanceado'}</div>
          <div class="text-sm text-muted">I = ${fmtBI(res.IEff)} | S = ${fmtBI(res.totalSavings)}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Encerrar sala ─────────────────────────────────────────────

function requestEndGame() { showConfirm('confirm-end'); }

async function endGameConfirmed() {
  hideConfirm('confirm-end');
  await closeRoom(_roomCode);
}
