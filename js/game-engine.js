// ============================================================
// MOTOR DE CÁLCULO ECONÔMICO
// Funções puras: sem acesso a DOM, Firebase ou localStorage.
// Todas as funções são testáveis isoladamente no console.
// ============================================================

// Definição dos eventos e limites por rodada
const ROUND_EVENTS = {
  1: {
    name: 'Economia Normal',
    description: 'A economia está funcionando normalmente. Nao ha choques externos. Escolham seus parametros livremente.',
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
    name: 'Crise de Confianca',
    description: 'Uma crise financeira internacional abalou a confianca. As familias estao inseguras e as empresas cortam investimentos. O governo precisa decidir: intervem ou espera?',
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
    name: 'Recuperacao com Dilema',
    description: 'A confianca esta voltando, mas o mercado esta de olho no deficit publico. Se o governo gastar demais agora, a credibilidade desaba. As familias e empresas tem mais liberdade, mas sera que a poupanca da rodada anterior permite?',
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

// Missões de cada setor (mostradas ao jogador na tela de submissão).
// Cada setor pontua por cumprir seu objetivo proprio. Os objetivos sao
// parcialmente conflitantes de proposito: e a licao central de macro.
const SECTOR_MISSIONS = {
  familias: {
    title: 'Missao: Bem-estar',
    objective: 'Maximizar o consumo das familias.',
    tip: 'Consumir mais aquece a economia, mas gastar alem da renda (poupanca privada negativa) zera o seu esforco.'
  },
  empresas: {
    title: 'Missao: Crescimento',
    objective: 'Manter a economia aquecida (PIB alto) investindo com ousadia.',
    tip: 'Quanto maior o PIB, melhor. Investir perto do limite rende bônus, mas depender de uma economia descapitalizada penaliza.'
  },
  governo: {
    title: 'Missao: Equilibrio',
    objective: 'Estimular o PIB com responsabilidade fiscal.',
    tip: 'PIB alto pontua, mas deficit alto (G muito acima de T) derruba a sua nota. Estimule sem estourar o orcamento.'
  }
};

// Valores padrão por setor (usados quando jogador não submete)
const DEFAULTS = {
  familias: { c0: 50, c1: 0.70 },
  empresas: { I: 80 },
  governo:  { G: 100, T: 100 }
};

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

// ── Pontuação por setor (gamificação) ─────────────────────────

/**
 * Calcula a pontuação de cada setor na rodada. Função pura.
 * Modelo hibrido: cada setor pontua por cumprir sua missao (0 a 100) e,
 * se o PIB atingir a meta da rodada, todos ganham um bonus coletivo.
 *
 * @param {object} result - resultado de calculateEquilibrium + parametros efetivos
 * @param {object} limits - limites da rodada (de getRoundLimits)
 * @param {number} round  - numero da rodada (1..3)
 * @returns {object} { familias, empresas, governo, collectiveBonus, targetHit, targetY, breakdown }
 */
function computeSectorScores(result, limits, round) {
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

  return {
    familias: familiasScore + collectiveBonus,
    empresas: empresasScore + collectiveBonus,
    governo:  governoScore + collectiveBonus,
    collectiveBonus,
    targetHit,
    targetY: cfg.targetY,
    breakdown: {
      familias: { base: familiasScore, overLeveraged: familiasOverLeveraged },
      empresas: { base: empresasScore, boldness: round2(boldness), undercapitalized },
      governo:  { base: governoScore, deficitDrag: round2(deficitDrag), penalty: !!result.penaltyInfo?.penaltyApplied }
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
  const scoring = computeSectorScores(base, limits, round);
  base.scores = { familias: scoring.familias, empresas: scoring.empresas, governo: scoring.governo };
  base.scoring = scoring;

  return base;
}

// ── Insights textuais ─────────────────────────────────────────

// Gera frases de análise baseadas nos resultados da rodada
function generateRoundInsights(currentResult, prevResult, round) {
  const insights = [];

  if (prevResult) {
    const delta = currentResult.Y - prevResult.Y;
    const pct   = Math.abs((delta / prevResult.Y) * 100).toFixed(1);
    const dir   = delta > 0 ? 'subiu' : 'caiu';
    insights.push(`O PIB ${dir} ${pct}% em relacao a rodada anterior (de R$${prevResult.Y.toFixed(0)}bi para R$${currentResult.Y.toFixed(0)}bi).`);

    if (Math.abs(currentResult.multiplier - prevResult.multiplier) > 0.05) {
      const mDir = currentResult.multiplier > prevResult.multiplier ? 'subiu' : 'caiu';
      insights.push(`O multiplicador ${mDir} de ${prevResult.multiplier}x para ${currentResult.multiplier}x.`);
    }
  }

  if (currentResult.penaltyInfo.penaltyApplied) {
    insights.push(`Penalidade fiscal: deficit de R$${currentResult.penaltyInfo.deficit.toFixed(0)}bi reduziu o consumo autonomo em ${(currentResult.penaltyInfo.penaltyRate * 100).toFixed(0)}%.`);
  }

  if (currentResult.isBalance) {
    insights.push(`Relacao IS verificada: I = R$${currentResult.IEff.toFixed(0)}bi, S_total = R$${currentResult.totalSavings.toFixed(0)}bi.`);
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
  insights.push(`A maior variacao de PIB foi entre a rodada ${biggestFrom} e ${biggestTo} (${changePct}%).`);

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
    insights.push('Relacao IS verificada em todas as rodadas: o modelo keynesiano esteve sempre em equilibrio.');
  }

  return insights;
}
