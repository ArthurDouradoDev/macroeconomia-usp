// ============================================================
// MOTOR DE CÁLCULO ECONÔMICO
// Funções puras: sem acesso a DOM, Firebase ou localStorage.
// Todas as funções são testáveis isoladamente no console.
// ============================================================

// Definição dos eventos e limites por rodada
const ROUND_EVENTS = {
  1: {
    name: 'Economia Normal',
    description: 'A economia está funcionando normalmente. Não há choques externos. Escolham seus parâmetros livremente.',
    deficitThreshold: 50,
    deficitPenalty: 0.10,
    limits: {
      c0: { min: 10, max: 100 },
      c1: { min: 0.10, max: 0.95 },
      I:  { min: 10, max: 200 },
      G:  { min: 20, max: 200 },
      T:  { min: 20, max: 200 }
    },
    // Config de pontuação (valores tunaveis, calibrados pela faixa real de Y)
    scoring: {
      targetY: 850, targetBand: 250, collectiveBonus: 30,
      refY: 1000, refConsumption: 700, refDeficit: 80
    }
  },
  2: {
    name: 'Crise de Confiança',
    description: 'Uma crise financeira internacional abalou a confiança. As famílias estão inseguras e as empresas cortam investimentos. O governo precisa decidir: intervém ou espera?',
    deficitThreshold: 50,
    deficitPenalty: 0.10,
    limits: {
      c0: { min: 10, max: 60  },  // reduzido pela crise
      c1: { min: 0.10, max: 0.95 },
      I:  { min: 10, max: 120 },  // reduzido pela crise
      G:  { min: 20, max: 200 },
      T:  { min: 20, max: 200 }
    },
    scoring: {
      targetY: 700, targetBand: 250, collectiveBonus: 30,
      refY: 850, refConsumption: 600, refDeficit: 80
    }
  },
  3: {
    name: 'Recuperação com Dilema',
    description: 'A confiança está voltando, mas o mercado está de olho no déficit público. Se o governo gastar demais agora, a credibilidade desaba. As famílias e empresas têm mais liberdade, mas será que a poupança da rodada anterior permite?',
    deficitThreshold: 30,   // limiar mais severo
    deficitPenalty: 0.15,   // penalidade maior
    limits: {
      c0: { min: 10, max: 100 },  // restaurado
      c1: { min: 0.10, max: 0.95 },
      I:  { min: 10, max: 200 },  // restaurado (mas limitado pela poupança anterior)
      G:  { min: 20, max: 200 },
      T:  { min: 20, max: 200 }
    },
    scoring: {
      targetY: 900, targetBand: 250, collectiveBonus: 30,
      refY: 1050, refConsumption: 750, refDeficit: 60
    }
  }
};

// Dilemas por rodada e setor que preenchem presets de valores e salvam stance
const DILEMMAS = {
  1: {
    familias: [
      { id: 'equilibrada', title: 'Vida Equilibrada', flavor: 'Manter consumo e poupança normais.', badge: 'c1 ~ 0.70', presets: { c1: 0.70, c0: 50 } },
      { id: 'poupadora', title: 'Foco na Poupança', flavor: 'Reduzir gastos correntes para poupar.', badge: 'c1 ~ 0.40', presets: { c1: 0.40, c0: 30 } },
      { id: 'gastadora', title: 'Foco no Consumo', flavor: 'Gastar mais para melhorar padrão de vida.', badge: 'c1 ~ 0.90', presets: { c1: 0.90, c0: 80 } }
    ],
    empresas: [
      { id: 'moderada', title: 'Postura Moderada', flavor: 'Investimento padrão para manter o crescimento.', badge: 'I ~ 80', presets: { I: 80 } },
      { id: 'cautelosa', title: 'Postura Cautelosa', flavor: 'Reduzir investimentos para evitar riscos.', badge: 'I ~ 30', presets: { I: 30 } },
      { id: 'agressiva', title: 'Postura Agressiva', flavor: 'Apostar alto no crescimento acelerado.', badge: 'I ~ 150', presets: { I: 150 } }
    ],
    governo: [
      { id: 'neutra', title: 'Postura Neutra', flavor: 'Equilibrar gastos e cobrança de impostos.', badge: 'G ~ 100, T ~ 100', presets: { G: 100, T: 100 } },
      { id: 'austera', title: 'Austeridade Fiscal', flavor: 'Reduzir o Estado para conter dívidas.', badge: 'G ~ 60, T ~ 120', presets: { G: 60, T: 120 } },
      { id: 'expansionista', title: 'Estímulo Econômico', flavor: 'Aumentar gastos para aquecer o PIB.', badge: 'G ~ 160, T ~ 80', presets: { G: 160, T: 80 } }
    ]
  },
  2: {
    familias: [
      { id: 'apertar_cinto', title: 'Apertar o Cinto', flavor: 'Proteger a família reduzindo consumo na crise.', badge: 'c1 ~ 0.45', presets: { c1: 0.45, c0: 20 } },
      { id: 'manter_padrao', title: 'Manter o Padrão', flavor: 'Manter consumo apostando na recuperação.', badge: 'c1 ~ 0.80', presets: { c1: 0.80, c0: 50 } }
    ],
    empresas: [
      { id: 'segurar_caixa', title: 'Segurar Caixa', flavor: 'Cortar investimentos para sobreviver à crise.', badge: 'I ~ 30', presets: { I: 30 } },
      { id: 'investir_baixa', title: 'Investir na Baixa', flavor: 'Aproveitar a crise para expandir e ganhar mercado.', badge: 'I ~ 90', presets: { I: 90 } }
    ],
    governo: [
      { id: 'austeridade', title: 'Austeridade na Crise', flavor: 'Reduzir gastos p/ proteger as contas do Estado.', badge: 'G ~ 60, T ~ 100', presets: { G: 60, T: 100 } },
      { id: 'pacote_estimulo', title: 'Pacote de Estímulo', flavor: 'Gastar muito para evitar recessão profunda.', badge: 'G ~ 150, T ~ 70', presets: { G: 150, T: 70 } }
    ]
  },
  3: {
    familias: [
      { id: 'reconstruir_poupanca', title: 'Reconstruir Poupança', flavor: 'Poupar mais p/ financiar novos investimentos.', badge: 'c1 ~ 0.50', presets: { c1: 0.50, c0: 40 } },
      { id: 'voltar_consumir', title: 'Voltar a Consumir', flavor: 'Retomar compras e recuperar o bem-estar.', badge: 'c1 ~ 0.85', presets: { c1: 0.85, c0: 70 } }
    ],
    empresas: [
      { id: 'jogar_seguro', title: 'Jogar Seguro', flavor: 'Evitar superendividamento com investimento moderado.', badge: 'I ~ 60', presets: { I: 60 } },
      { id: 'aproveitar_janela', title: 'Aproveitar a Janela', flavor: 'Investir o teto máximo permitido pela poupança.', badge: 'I perto do teto', presets: { I: 'max' } }
    ],
    governo: [
      { id: 'austeridade_severa', title: 'Austeridade Severa', flavor: 'Evitar penalidade grave com orçamento controlado.', badge: 'G ~ 50, T ~ 120', presets: { G: 50, T: 120 } },
      { id: 'estimulo_limiar', title: 'Estímulo no Limiar', flavor: 'Estimular sem estourar a nova meta de déficit.', badge: 'G ~ 110, T ~ 90', presets: { G: 110, T: 90 } }
    ]
  }
};

// Personas leves por setor para criar vinculo de identidade
const PERSONAS = {
  familias: [
    'Família Souza, periferia',
    'Família Tanaka, classe média',
    'Família Oliveira, rural',
    'Família Santos, assalariados',
    'Família Pereira, servidores públicos'
  ],
  empresas: [
    'Metalúrgica Andrade',
    'Startup Bit7',
    'Supermercados Pague Pouco',
    'Construtora Alfa',
    'Agropecuária Vale Verde'
  ],
  governo: [
    'Ministra do Planejamento',
    'Secretário do Tesouro',
    'Diretor do Banco Central',
    'Ministro da Fazenda',
    'Secretária do Orçamento'
  ]
};

// Missões de cada setor (mostradas ao jogador na tela de submissão).
// Cada setor pontua por cumprir seu objetivo proprio. Os objetivos sao
// parcialmente conflitantes de proposito: e a licao central de macro.
const SECTOR_MISSIONS = {
  familias: {
    title: 'Missão: Bem-estar',
    objective: 'Maximizar o consumo das famílias.',
    tip: 'Consumir mais aquece a economia, mas gastar além da renda (poupança privada negativa) zera o seu esforço.'
  },
  empresas: {
    title: 'Missão: Crescimento',
    objective: 'Manter a economia aquecida (PIB alto) investindo com ousadia.',
    tip: 'Quanto maior o PIB, melhor. Investir perto do limite rende bônus, mas depender de uma economia descapitalizada penaliza.'
  },
  governo: {
    title: 'Missão: Equilíbrio',
    objective: 'Estimular o PIB com responsabilidade fiscal.',
    tip: 'PIB alto pontua, mas déficit alto (G muito acima de T) derruba a sua nota. Estimule sem estourar o orçamento.'
  }
};

// Valores padrão por setor (usados quando jogador não submete)
const DEFAULTS = {
  familias: { c0: 50, c1: 0.70 },
  empresas: { I: 80 },
  governo:  { G: 100, T: 100 }
};

// Largura da "banda" de calibragem em torno do valor central de cada postura
// (em unidades do modelo). Ao escolher uma postura no passo 1, o slider do
// passo 2 fica restrito a [centro - banda, centro + banda], intersectado com
// os limites da rodada. Assim a escolha qualitativa realmente limita a faixa.
const STANCE_BANDS = { c1: 0.12, c0: 15, I: 30, G: 30, T: 30 };

// ── Utilitários ───────────────────────────────────────────────

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

// Limita um valor ao intervalo [0, 1]
function clamp01(value) {
  return clamp(value, 0, 1);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ── Limites da rodada ─────────────────────────────────────────

// Retorna os limites efetivos de uma rodada, ajustando I pela poupança anterior
function getRoundLimits(round, prevResult) {
  const base = ROUND_EVENTS[round].limits;
  const limits = {
    c0: { ...base.c0 },
    c1: { ...base.c1 },
    I:  { ...base.I },
    G:  { ...base.G },
    T:  { ...base.T }
  };

  if (round >= 2 && prevResult) {
    const prevSavings = prevResult.totalSavings;
    const iMaxFromSavings = Math.max(10, Math.min(base.I.max, prevSavings));
    limits.I.max = round2(iMaxFromSavings);
    limits.I.limitedBySavings = true;
    limits.I.prevSavings = round2(prevSavings);
    limits.I.undercapitalized = prevSavings < 10;
  }

  return limits;
}

// ── Penalidade de déficit ─────────────────────────────────────

// Verifica e aplica redução de c₀ se o déficit ultrapassar o limiar
function applyDeficitPenalty(c0, G, T, round) {
  const event = ROUND_EVENTS[round];
  const deficit = G - T;

  if (deficit > event.deficitThreshold) {
    return {
      c0Effective: round2(c0 * (1 - event.deficitPenalty)),
      penaltyApplied: true,
      deficit: round2(deficit),
      penaltyRate: event.deficitPenalty,
      threshold: event.deficitThreshold,
      reduction: round2(c0 * event.deficitPenalty)
    };
  }

  return {
    c0Effective: c0,
    penaltyApplied: false,
    deficit: round2(deficit),
    penaltyRate: 0,
    threshold: event.deficitThreshold,
    reduction: 0
  };
}

// ── Cálculo principal ─────────────────────────────────────────

/**
 * Calcula o equilíbrio econômico keynesiano.
 * Função pura: recebe parâmetros, retorna resultados.
 *
 * @param {object} params - { c0, c1, I, G, T }
 * @returns {object} Todos os indicadores calculados
 */
function calculateEquilibrium(params) {
  const c0 = Number(params.c0);
  const c1 = clamp(Number(params.c1), 0.01, 0.99); // evitar divisão por zero
  const I  = Number(params.I);
  const G  = Number(params.G);
  const T  = Number(params.T);

  const multiplier        = 1 / (1 - c1);
  const autonomousSpending = c0 + I + G - c1 * T;
  const Y                 = multiplier * autonomousSpending;

  const disposableIncome  = Y - T;
  const consumption       = c0 + c1 * disposableIncome;
  const privateSavings    = -c0 + (1 - c1) * disposableIncome;
  const publicSavings     = T - G;
  const totalSavings      = privateSavings + publicSavings;
  const deficit           = G - T;

  // Relação IS: I deve ≈ poupança total (tolerância de 0.01)
  const isBalance = Math.abs(I - totalSavings) < 0.01;

  return {
    Y:                round2(Y),
    multiplier:       round2(multiplier),
    autonomousSpending: round2(autonomousSpending),
    consumption:      round2(consumption),
    disposableIncome: round2(disposableIncome),
    privateSavings:   round2(privateSavings),
    publicSavings:    round2(publicSavings),
    totalSavings:     round2(totalSavings),
    isBalance,
    deficit:          round2(deficit)
  };
}

// ── Agregação de setores ──────────────────────────────────────

// Calcula a média dos valores submetidos por um setor
function aggregateSectorValues(submissions, players, sector) {
  const sectorPlayerIds = Object.entries(players || {})
    .filter(([, p]) => p.sector === sector)
    .map(([id]) => id);

  if (sectorPlayerIds.length === 0) return null;

  const submitted = sectorPlayerIds.filter(id => submissions?.[id]?.values);
  const submittedCount = submitted.length;
  const totalCount = sectorPlayerIds.length;

  if (sector === 'familias') {
    let totalC0 = 0, totalC1 = 0;
    for (const id of sectorPlayerIds) {
      const v = submissions?.[id]?.values;
      totalC0 += v ? Number(v.c0) : DEFAULTS.familias.c0;
      totalC1 += v ? Number(v.c1) : DEFAULTS.familias.c1;
    }
    return {
      c0: round2(totalC0 / totalCount),
      c1: round2(totalC1 / totalCount),
      submittedCount,
      totalCount
    };
  }

  if (sector === 'empresas') {
    let totalI = 0;
    for (const id of sectorPlayerIds) {
      const v = submissions?.[id]?.values;
      totalI += v ? Number(v.I) : DEFAULTS.empresas.I;
    }
    return {
      I: round2(totalI / totalCount),
      submittedCount,
      totalCount
    };
  }

  if (sector === 'governo') {
    let totalG = 0, totalT = 0;
    for (const id of sectorPlayerIds) {
      const v = submissions?.[id]?.values;
      totalG += v ? Number(v.G) : DEFAULTS.governo.G;
      totalT += v ? Number(v.T) : DEFAULTS.governo.T;
    }
    return {
      G: round2(totalG / totalCount),
      T: round2(totalT / totalCount),
      submittedCount,
      totalCount
    };
  }

  return null;
}

// Tabela de apostas: cada nivel de confianca define o ganho (acerto) e a perda
// (erro). Apostar passa a ter risco real - errar custa pontos. Os valores sao
// pequenos perto da missao (0-100) para nao dominar o placar (ver gamificacao.md secao 9).
const BET_STAKES = {
  seguro: { label: 'Seguro', win: 6,  loss: -2 },
  ousado: { label: 'Ousado', win: 15, loss: -8 }
};

// Calcula o saldo de pontos de uma aposta individual. Funcao pura.
// Acertar rende o ganho do nivel; errar aplica a perda. Sem aposta = 0.
function computeBetPayoff(bet, betStake, targetHit) {
  if (!bet) return 0;
  const correct = (bet === 'sim' && targetHit) || (bet === 'nao' && !targetHit);
  const stake = BET_STAKES[betStake] || BET_STAKES.seguro;
  return correct ? stake.win : stake.loss;
}

// Calcula os bonus de gamificacao por setor (media proporcional de apostas e travas)
function computeSectorGamificationBonus(submissions, players, sector, targetHit) {
  const sectorPlayerIds = Object.entries(players || {})
    .filter(([, p]) => p.sector === sector)
    .map(([id]) => id);

  if (sectorPlayerIds.length === 0) {
    return { betBonus: 0, commitBonus: 0, totalBonus: 0, betCorrectCount: 0, betWrongCount: 0, commitCount: 0 };
  }

  let totalBetBonus = 0;
  let totalCommitBonus = 0;
  let betCorrectCount = 0;
  let betWrongCount = 0;
  let commitCount = 0;

  for (const id of sectorPlayerIds) {
    const sub = submissions?.[id];
    if (!sub) continue;
    if (sub.bet) {
      const correct = (sub.bet === 'sim' && targetHit) || (sub.bet === 'nao' && !targetHit);
      totalBetBonus += computeBetPayoff(sub.bet, sub.betStake, targetHit);
      if (correct) betCorrectCount++; else betWrongCount++;
    }
    if (sub.lockedEarly) {
      totalCommitBonus += 5;
      commitCount++;
    }
  }

  const count = sectorPlayerIds.length;
  return {
    betBonus: round2(totalBetBonus / count),
    commitBonus: round2(totalCommitBonus / count),
    totalBonus: round2((totalBetBonus + totalCommitBonus) / count),
    betCorrectCount,
    betWrongCount,
    commitCount
  };
}

// Calcula as insignias (badges) obtidas por cada setor e coletivamente no final das 3 rodadas.
function computeBadges(allResults) {
  const badges = { familias: [], empresas: [], governo: [], coletivo: [] };
  const rounds = [1, 2, 3].filter(r => allResults[r] || allResults[`round_${r}`]);
  if (rounds.length === 0) return badges;

  const getRoundRes = (r) => allResults[r] || allResults[`round_${r}`];

  // 1. Hat Trick (Coletivo)
  const hatTrick = [1, 2, 3].every(r => {
    const res = getRoundRes(r);
    return res && res.scoring?.targetHit;
  });
  if (hatTrick) {
    badges.coletivo.push({
      id: 'hat_trick',
      name: 'Hat Trick Coletivo',
      desc: 'A economia bateu a meta de PIB de equilíbrio nas 3 rodadas!'
    });
  }

  // 2. Mao de Ferro Fiscal (Governo)
  const maoDeFerro = [1, 2, 3].every(r => {
    const res = getRoundRes(r);
    return res && res.penaltyInfo && !res.penaltyInfo.penaltyApplied;
  });
  if (maoDeFerro) {
    badges.governo.push({
      id: 'mao_de_ferro',
      name: 'Mão de Ferro Fiscal',
      desc: 'O Governo governou sem sofrer nenhuma penalidade fiscal por déficit excessivo.'
    });
  }

  // 3. Consumista Consciente (Famílias)
  const consumistaConsciente = [1, 2, 3].every(r => {
    const res = getRoundRes(r);
    return res && res.consumption >= 400 && res.privateSavings >= 0;
  });
  if (consumistaConsciente) {
    badges.familias.push({
      id: 'consumista_consciente',
      name: 'Consumista Consciente',
      desc: 'As Famílias mantiveram consumo saudável com poupança positiva em todas as rodadas.'
    });
  }

  // 4. Aposta Certeira na Baixa (Empresas)
  const r2 = getRoundRes(2);
  if (r2) {
    const limits = r2.limits;
    const iMax = limits?.I?.max || 120;
    const highInvest = r2.IEff >= iMax - 10;
    const targetHit = r2.scoring?.targetHit;
    if (highInvest && targetHit) {
      badges.empresas.push({
        id: 'aposta_certeira_baixa',
        name: 'Aposta Certeira na Baixa',
        desc: 'As Empresas investiram forte perto do teto na crise (R2) e a meta de PIB foi atingida.'
      });
    }
  }

  return badges;
}

// ── Pontuação por setor (gamificação) ─────────────────────────

/**
 * Calcula a pontuação de cada setor na rodada. Função pura.
 * Modelo hibrido: cada setor pontua por cumprir sua missao (0 a 100) e,
 * se o PIB atingir a meta da rodada, todos ganham um bonus coletivo.
 *
 * @param {object} result - resultado de calculateEquilibrium + parametros efetivos
 * @param {object} limits - limites da rodada (de getRoundLimits)
 * @param {number} round  - numero da rodada (1..3)
 * @param {object} [submissions] - submissões de jogadores (opcional)
 * @param {object} [players] - jogadores conectados (opcional)
 * @returns {object} { familias, empresas, governo, collectiveBonus, targetHit, targetY, breakdown }
 */
function computeSectorScores(result, limits, round, submissions, players) {
  const cfg = ROUND_EVENTS[round].scoring;
  const { Y, consumption, privateSavings, IEff, deficit } = result;

  // Familias: maximizar consumo, penalizado se a poupanca privada ficou negativa
  let familiasBase = clamp01(consumption / cfg.refConsumption) * 100;
  const familiasOverLeveraged = privateSavings < 0;
  if (familiasOverLeveraged) familiasBase *= 0.6;
  const familiasScore = Math.round(clamp(familiasBase, 0, 100));

  // Empresas: PIB alto (base) + ousadia de investimento, penalizado se descapitalizada
  const iMax = limits?.I?.max || 200;
  const boldness = clamp01(IEff / iMax);
  let empresasBase = clamp01(Y / cfg.refY) * 85 + boldness * 15;
  const undercapitalized = !!limits?.I?.undercapitalized;
  if (undercapitalized) empresasBase *= 0.7;
  const empresasScore = Math.round(clamp(empresasBase, 0, 100));

  // Governo: PIB alto, penalizado pelo deficit (e pela penalidade fiscal aplicada)
  const deficitDrag = clamp01(Math.max(0, deficit) / cfg.refDeficit);
  let governoBase = clamp01(Y / cfg.refY) * 100 * (1 - 0.5 * deficitDrag);
  if (result.penaltyInfo?.penaltyApplied) governoBase -= 20;
  const governoScore = Math.round(clamp(governoBase, 0, 100));

  // Bonus coletivo: PIB dentro da banda da meta
  const targetHit = Math.abs(Y - cfg.targetY) <= cfg.targetBand;
  const collectiveBonus = targetHit ? cfg.collectiveBonus : 0;

  // Gamification Individual/Sector bonuses
  const famBonus = computeSectorGamificationBonus(submissions, players, 'familias', targetHit);
  const empBonus = computeSectorGamificationBonus(submissions, players, 'empresas', targetHit);
  const govBonus = computeSectorGamificationBonus(submissions, players, 'governo', targetHit);

  return {
    familias: Math.round(familiasScore + collectiveBonus + famBonus.totalBonus),
    empresas: Math.round(empresasScore + collectiveBonus + empBonus.totalBonus),
    governo:  Math.round(governoScore + collectiveBonus + govBonus.totalBonus),
    collectiveBonus,
    targetHit,
    targetY: cfg.targetY,
    gamification: {
      familias: famBonus,
      empresas: empBonus,
      governo: govBonus
    },
    breakdown: {
      familias: { base: familiasScore, overLeveraged: familiasOverLeveraged, ...famBonus },
      empresas: { base: empresasScore, boldness: round2(boldness), undercapitalized, ...empBonus },
      governo:  { base: governoScore, deficitDrag: round2(deficitDrag), penalty: !!result.penaltyInfo?.penaltyApplied, ...govBonus }
    }
  };
}

// Soma os scores de todas as rodadas e devolve um ranking ordenado. Função pura.
// allResults: { round_1: {...,scores}, round_2: {...}, ... } ou { 1: {...}, 2: {...} }
function computeLeaderboard(allResults) {
  const sectors = ['familias', 'empresas', 'governo'];
  const totals = { familias: 0, empresas: 0, governo: 0 };
  const perRound = { familias: {}, empresas: {}, governo: {} };

  for (const key of Object.keys(allResults || {})) {
    const res = allResults[key];
    if (!res || !res.scores) continue;
    const n = parseInt(String(key).replace('round_', ''));
    for (const s of sectors) {
      const pts = Number(res.scores[s]) || 0;
      totals[s] += pts;
      perRound[s][n] = pts;
    }
  }

  const ranking = sectors
    .map(s => ({ sector: s, total: totals[s], perRound: perRound[s] }))
    .sort((a, b) => b.total - a.total);

  // Atribuir posicao (empates compartilham a mesma posicao)
  ranking.forEach((row, i) => {
    row.rank = (i > 0 && row.total === ranking[i - 1].total)
      ? ranking[i - 1].rank
      : i + 1;
  });

  return ranking;
}

// ── Duração configurável ──────────────────────────────────────

/**
 * Deriva os tempos de cada parte a partir da duração total escolhida.
 * Função pura. totalMinutes entre 10 e 20.
 * @returns {object} { totalMinutes, submissionSeconds, revealSeconds }
 */
function computeDurations(totalMinutes) {
  const tm = clamp(Math.round(Number(totalMinutes) || 15), 10, 20);
  const totalSec = tm * 60;
  // Reserva fixa: ~60s de intro (lobby->rodada) e ~90s para o resultado final
  const perRound = (totalSec - 150) / 3;
  const submissionSeconds = clamp(Math.round(perRound * 0.68), 60, 300);
  const revealSeconds     = clamp(Math.round(perRound * 0.32), 30, 150);
  return { totalMinutes: tm, submissionSeconds, revealSeconds };
}

// ── Cálculo completo da rodada ────────────────────────────────

// Compila todos os valores, aplica penalidades e retorna resultado completo
function computeRoundResult(submissions, players, round, prevResult) {
  const limits = getRoundLimits(round, prevResult);

  const fam  = aggregateSectorValues(submissions, players, 'familias');
  const emp  = aggregateSectorValues(submissions, players, 'empresas');
  const gov  = aggregateSectorValues(submissions, players, 'governo');

  // Aplicar limites da rodada
  const c0Raw = clamp(fam?.c0 ?? DEFAULTS.familias.c0, limits.c0.min, limits.c0.max);
  const c1Raw = clamp(fam?.c1 ?? DEFAULTS.familias.c1, limits.c1.min, limits.c1.max);
  const IEff  = clamp(emp?.I  ?? DEFAULTS.empresas.I,  limits.I.min,  limits.I.max);
  const GEff  = clamp(gov?.G  ?? DEFAULTS.governo.G,   limits.G.min,  limits.G.max);
  const TEff  = clamp(gov?.T  ?? DEFAULTS.governo.T,   limits.T.min,  limits.T.max);

  // Verificar e aplicar penalidade de déficit
  const penaltyInfo = applyDeficitPenalty(c0Raw, GEff, TEff, round);
  const c0Eff = penaltyInfo.c0Effective;

  const equilibrium = calculateEquilibrium({
    c0: c0Eff, c1: c1Raw, I: IEff, G: GEff, T: TEff
  });

  // Montar resultado base (necessario para a pontuação)
  const base = {
    ...equilibrium,
    // Parâmetros efetivos usados no cálculo
    c0Eff, c1Eff: c1Raw, IEff, GEff, TEff,
    c0Raw,
    // Informações de penalidade
    penaltyInfo,
    // Resumos por setor
    familiasSummary: fam,
    empresasSummary: emp,
    governoSummary:  gov,
    // Limites aplicados
    limits,
    round,
    eventName: ROUND_EVENTS[round].name
  };

  // Pontuação dos setores (gamificação) — persistida junto do resultado
  const scoring = computeSectorScores(base, limits, round, submissions, players);
  base.scores = { familias: scoring.familias, empresas: scoring.empresas, governo: scoring.governo };
  base.scoring = scoring;

  return base;
}

// ── Projeção ao vivo (gamificação, fase 1) ────────────────────

/**
 * Projeta o equilíbrio enquanto um jogador ainda está calibrando, assumindo
 * que os OUTROS setores mantêm os valores efetivos da rodada anterior (ou os
 * defaults na rodada 1). Serve para o feedback "E se?" na tela de submissão.
 *
 * Função pura. Espelha a montagem de computeRoundResult, então o objeto
 * retornado é compatível com computeSectorScores.
 *
 * @param {string} sector       - 'familias' | 'empresas' | 'governo'
 * @param {object} sectorValues - valores que o jogador está editando (ex: { c0, c1 })
 * @param {number} round        - rodada atual (1..3)
 * @param {object|null} prevResult - resultado da rodada anterior (para baseline e teto de I)
 * @returns {object} resultado projetado (mesmos campos de computeRoundResult, + projected:true)
 */
function projectEquilibrium(sector, sectorValues, round, prevResult) {
  const limits = getRoundLimits(round, prevResult);

  // Baseline dos OUTROS setores: valores efetivos da rodada anterior, ou
  // defaults na rodada 1 (não existe rodada anterior).
  const baseline = prevResult ? {
    c0: prevResult.c0Raw ?? prevResult.c0Eff ?? DEFAULTS.familias.c0,
    c1: prevResult.c1Eff ?? DEFAULTS.familias.c1,
    I:  prevResult.IEff  ?? DEFAULTS.empresas.I,
    G:  prevResult.GEff  ?? DEFAULTS.governo.G,
    T:  prevResult.TEff  ?? DEFAULTS.governo.T
  } : {
    c0: DEFAULTS.familias.c0,
    c1: DEFAULTS.familias.c1,
    I:  DEFAULTS.empresas.I,
    G:  DEFAULTS.governo.G,
    T:  DEFAULTS.governo.T
  };

  // Sobrepor o setor do jogador com os valores que ele está mexendo agora
  const merged = { ...baseline };
  const v = sectorValues || {};
  if (sector === 'familias') {
    if (v.c0 != null) merged.c0 = Number(v.c0);
    if (v.c1 != null) merged.c1 = Number(v.c1);
  } else if (sector === 'empresas') {
    if (v.I != null) merged.I = Number(v.I);
  } else if (sector === 'governo') {
    if (v.G != null) merged.G = Number(v.G);
    if (v.T != null) merged.T = Number(v.T);
  }

  // Clampar pelos limites da rodada (mesma regra do cálculo real)
  const c0Raw = clamp(merged.c0, limits.c0.min, limits.c0.max);
  const c1Raw = clamp(merged.c1, limits.c1.min, limits.c1.max);
  const IEff  = clamp(merged.I,  limits.I.min,  limits.I.max);
  const GEff  = clamp(merged.G,  limits.G.min,  limits.G.max);
  const TEff  = clamp(merged.T,  limits.T.min,  limits.T.max);

  // Penalidade de déficit (idêntica ao cálculo real)
  const penaltyInfo = applyDeficitPenalty(c0Raw, GEff, TEff, round);
  const c0Eff = penaltyInfo.c0Effective;

  const equilibrium = calculateEquilibrium({
    c0: c0Eff, c1: c1Raw, I: IEff, G: GEff, T: TEff
  });

  return {
    ...equilibrium,
    c0Eff, c1Eff: c1Raw, IEff, GEff, TEff, c0Raw,
    penaltyInfo,
    limits,
    round,
    projected: true
  };
}

/**
 * Estima a pontuação da missão de um setor a partir de um resultado projetado.
 * Função pura. Reusa computeSectorScores para não duplicar a regra de pontos.
 *
 * @returns {object} { points, base, collectiveBonus, targetHit, targetY }
 */
function estimateSectorScore(sector, projection, round) {
  const scoring = computeSectorScores(projection, projection.limits, round);
  return {
    points: scoring[sector],
    base: scoring.breakdown?.[sector]?.base ?? scoring[sector],
    collectiveBonus: scoring.collectiveBonus,
    targetHit: scoring.targetHit,
    targetY: scoring.targetY
  };
}

/**
 * Rótulo qualitativo do estado da economia, relativo à meta da rodada.
 * Função pura. tone mapeia para uma classe de cor da UI (green/gold/red).
 *
 * @returns {object} { label, tone }
 */
function describeOutput(Y, round) {
  const cfg = ROUND_EVENTS[round].scoring;
  const low  = cfg.targetY - cfg.targetBand;
  const high = cfg.targetY + cfg.targetBand;
  if (Y < low)  return { label: 'Estagnada',     tone: 'red' };
  if (Y > high) return { label: 'Superaquecida', tone: 'gold' };
  return { label: 'Aquecida', tone: 'green' };
}

// ── Insights textuais ─────────────────────────────────────────

// Gera frases de análise baseadas nos resultados da rodada
function generateRoundInsights(currentResult, prevResult, round) {
  const insights = [];

  if (prevResult) {
    const delta = currentResult.Y - prevResult.Y;
    const pct   = Math.abs((delta / prevResult.Y) * 100).toFixed(1);
    const dir   = delta > 0 ? 'subiu' : 'caiu';
    insights.push(`O PIB ${dir} ${pct}% em relação à rodada anterior (de R$${prevResult.Y.toFixed(0)}bi para R$${currentResult.Y.toFixed(0)}bi).`);

    if (Math.abs(currentResult.multiplier - prevResult.multiplier) > 0.05) {
      const mDir = currentResult.multiplier > prevResult.multiplier ? 'subiu' : 'caiu';
      insights.push(`O multiplicador ${mDir} de ${prevResult.multiplier}x para ${currentResult.multiplier}x.`);
    }
  }

  if (currentResult.penaltyInfo.penaltyApplied) {
    insights.push(`Penalidade fiscal: déficit de R$${currentResult.penaltyInfo.deficit.toFixed(0)}bi reduziu o consumo autônomo em ${(currentResult.penaltyInfo.penaltyRate * 100).toFixed(0)}%.`);
  }

  if (currentResult.isBalance) {
    insights.push(`Relação IS verificada: I = R$${currentResult.IEff.toFixed(0)}bi, S_total = R$${currentResult.totalSavings.toFixed(0)}bi.`);
  }

  return insights;
}

// Gera destaques para a tela de resultado final (3 rodadas)
function generateFinalInsights(results) {
  const rounds = [1, 2, 3].filter(r => results[r]);
  if (rounds.length < 2) return [];

  const insights = [];

  // Maior e menor PIB
  let maxY = -Infinity, minY = Infinity, maxRound = 1, minRound = 1;
  for (const r of rounds) {
    if (results[r].Y > maxY) { maxY = results[r].Y; maxRound = r; }
    if (results[r].Y < minY) { minY = results[r].Y; minRound = r; }
  }
  insights.push(`O maior PIB foi na rodada ${maxRound} (R$${maxY.toFixed(0)}bi) e o menor na rodada ${minRound} (R$${minY.toFixed(0)}bi).`);

  // Maior variação
  let biggestChange = 0, biggestFrom = 1, biggestTo = 2;
  for (let i = 0; i < rounds.length - 1; i++) {
    const from = rounds[i], to = rounds[i + 1];
    const change = Math.abs(results[to].Y - results[from].Y);
    if (change > biggestChange) {
      biggestChange = change;
      biggestFrom = from;
      biggestTo = to;
    }
  }
  const changePct = Math.abs((results[biggestTo].Y - results[biggestFrom].Y) / results[biggestFrom].Y * 100).toFixed(1);
  insights.push(`A maior variação de PIB foi entre a rodada ${biggestFrom} e ${biggestTo} (${changePct}%).`);

  // Maior multiplicador
  let maxMult = -Infinity, maxMultRound = 1;
  for (const r of rounds) {
    if (results[r].multiplier > maxMult) {
      maxMult = results[r].multiplier;
      maxMultRound = r;
    }
  }
  insights.push(`O multiplicador mais alto foi na rodada ${maxMultRound} (${maxMult}x, c1 = ${results[maxMultRound].c1Eff}).`);

  // Verificação IS em todas as rodadas
  const allBalance = rounds.every(r => results[r].isBalance);
  if (allBalance) {
    insights.push('Relação IS verificada em todas as rodadas: o modelo keynesiano esteve sempre em equilíbrio.');
  }

  return insights;
}
