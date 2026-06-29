# SPEC.md — Especificação Completa do Jogo

## 1. Conceito

A turma forma uma economia. Cada aluno controla um parâmetro econômico real. O sistema calcula o PIB de equilíbrio usando a equação do modelo keynesiano simples ensinada em aula. O jogo roda 3 rodadas, cada uma com um contexto econômico diferente. A turma descobre, na prática, como as decisões de consumo, investimento e política fiscal se conectam.

---

## 2. Papéis

### 2.1 Mestre (apresentador)

- Apenas 1 por sala.
- Cria a sala e recebe um código de 4 dígitos aleatório (letras maiúsculas, ex: "ABCD").
- Vê a lista de jogadores no lobby.
- Controla o avanço de fases: lobby → rodada 1 → rodada 2 → rodada 3 → resultados.
- Pode encerrar submissões a qualquer momento (botão "Fechar rodada").
- O mestre NÃO é um jogador. Ele não pertence a nenhum setor.
- A tela do mestre é projetada no telão da sala de aula.
- Ao criar a sala, o mestre define uma senha simples (4 dígitos numéricos) que será o `masterKey`. Essa senha é solicitada ao acessar `master.html` para evitar que jogadores acessem a tela do mestre.

### 2.2 Jogador

- Entra na sala com o código de 4 letras + seu nome.
- Escolhe o setor ao qual quer pertencer: Famílias, Empresas ou Governo.
- Cada setor aceita no mínimo 1 e no máximo 15 jogadores.
- Se um setor estiver lotado (15), o botão de seleção daquele setor fica desabilitado.
- Após escolher o setor, o jogador espera o mestre iniciar a rodada.
- Durante cada rodada, o jogador submete valores para os parâmetros do seu setor.
- Se o jogador não submeter até o mestre fechar a rodada, os valores padrão são usados.

---

## 3. Setores e Parâmetros

### 3.1 Setor Famílias

Cada jogador do setor Famílias controla dois valores:

| Parâmetro | Nome | Faixa permitida | Default | Passo do slider |
|-----------|------|-----------------|---------|-----------------|
| c₁ | Propensão marginal a consumir | 0.10 a 0.95 | 0.70 | 0.01 |
| c₀ | Consumo autônomo (em bilhões R$) | 10 a 100 | 50 | 1 |

O valor efetivo usado no cálculo é a **média aritmética** dos valores submetidos por todos os jogadores do setor Famílias.

**Textos de ajuda na UI do jogador:**
- c₁: "De cada R$1 de renda, quanto você gasta? O resto vira poupança."
- c₀: "O mínimo que sua família gasta, mesmo sem renda. Aluguel, comida básica, contas."

### 3.2 Setor Empresas

Cada jogador do setor Empresas controla um valor:

| Parâmetro | Nome | Faixa permitida | Default | Passo do slider |
|-----------|------|-----------------|---------|-----------------|
| I | Investimento agregado (em bilhões R$) | 10 a 200 | 80 | 1 |

O valor efetivo usado no cálculo é a **média aritmética** dos valores submetidos por todos os jogadores do setor Empresas.

**Restrição de interdependência (rodadas 2 e 3):**
O investimento máximo permitido na rodada N é limitado pela poupança agregada da rodada N-1. Especificamente:

```
I_max(rodada N) = min(200, poupançaPrivada(rodada N-1) + poupançaPública(rodada N-1))
```

Onde:
- Poupança privada = -c₀ + (1 - c₁) * (Y - T) [calculada na rodada anterior]
- Poupança pública = T - G [calculada na rodada anterior]

Se a poupança agregada anterior for menor que 10 (o mínimo do slider), o mínimo permanece 10 mas o jogo exibe um aviso de que a economia está descapitalizada.

Na rodada 1, não há restrição de investimento (não existe rodada anterior).

**Texto de ajuda na UI do jogador:**
- I: "Quanto as empresas investem em máquinas, fábricas e estoques."

### 3.3 Setor Governo

Cada jogador do setor Governo controla dois valores:

| Parâmetro | Nome | Faixa permitida | Default | Passo do slider |
|-----------|------|-----------------|---------|-----------------|
| G | Gastos do governo (em bilhões R$) | 20 a 200 | 100 | 1 |
| T | Impostos (em bilhões R$) | 20 a 200 | 100 | 1 |

O valor efetivo usado no cálculo é a **média aritmética** dos valores submetidos por todos os jogadores do setor Governo.

**Restrição orçamentária:**
Se o déficit (G - T) ultrapassar 50 bilhões, o sistema aplica automaticamente uma penalidade: o c₀ efetivo da economia é reduzido em 10% naquela rodada. Isso simula perda de confiança dos consumidores quando o governo gasta muito mais do que arrecada. O mestre vê essa penalidade na tela de resultados e pode explicá-la à turma.

**Textos de ajuda na UI do jogador:**
- G: "Quanto o governo gasta em estradas, hospitais, educação."
- T: "Quanto o governo cobra de impostos. Mais T = menos renda disponível para famílias."

---

## 4. Eventos Econômicos

Cada rodada tem um contexto que altera as condições. O mestre NÃO escolhe os eventos. Eles são fixos e predeterminados.

### Rodada 1: Economia Normal
- **Evento:** Nenhum. Economia em estado estável.
- **Efeitos mecânicos:** Nenhuma alteração nos limites ou parâmetros.
- **Texto exibido para a turma:** "A economia está funcionando normalmente. Não há choques externos. Escolham seus parâmetros livremente."
- **Propósito pedagógico:** Calibrar. A turma entende a mecânica sem interferências.

### Rodada 2: Crise de Confiança
- **Evento:** Uma crise internacional reduz a confiança das famílias e das empresas.
- **Efeitos mecânicos:**
  - O limite máximo de c₀ para o setor Famílias cai de 100 para 60.
  - O limite máximo de I para o setor Empresas cai de 200 para 120.
  - Os limites do setor Governo não mudam.
- **Texto exibido para a turma:** "Uma crise financeira internacional abalou a confiança. As famílias estão inseguras e as empresas cortam investimentos. O governo precisa decidir: intervém ou espera?"
- **Propósito pedagógico:** O Governo ganha protagonismo. Será que aumentar G compensa a queda de I e c₀? A turma vivencia a lógica do estímulo fiscal.

### Rodada 3: Recuperação com Dilema
- **Evento:** A confiança está voltando, mas o governo acumulou déficit. Momento de escolha coletiva.
- **Efeitos mecânicos:**
  - Os limites de c₀ e I voltam ao normal (100 e 200).
  - A penalidade de déficit fiscal se torna mais severa: se G - T > 30 (ao invés de 50), o c₀ é reduzido em 15% (ao invés de 10%).
  - O investimento máximo continua limitado pela poupança da rodada anterior.
- **Texto exibido para a turma:** "A confiança está voltando, mas o mercado está de olho no déficit público. Se o governo gastar demais agora, a credibilidade desaba. As famílias e empresas têm mais liberdade, mas será que a poupança da rodada anterior permite?"
- **Propósito pedagógico:** Todas as peças se conectam. A turma percebe a relação IS: a poupança da rodada anterior financia o investimento desta. O paradoxo da poupança fica visível se c₁ foi muito alto nas rodadas passadas.

---

## 5. Cálculo do PIB de Equilíbrio

O cálculo é feito pelo sistema no `game-engine.js`. A fórmula é:

```
Y = (1 / (1 - c1_efetivo)) * (c0_efetivo + I_efetivo + G_efetivo - c1_efetivo * T_efetivo)
```

### Passo a passo do cálculo (a animação do mestre mostra cada um):

1. **Agregar parâmetros:** Calcular a média dos valores submetidos por cada setor.
2. **Aplicar efeitos do evento:** Ajustar limites conforme a rodada.
3. **Verificar déficit e penalidade:** Se (G - T) > limite da rodada, reduzir c₀ efetivo.
4. **Calcular componentes:**
   - Gasto autônomo = c₀_efetivo + I_efetivo + G_efetivo - c₁_efetivo * T_efetivo
   - Multiplicador = 1 / (1 - c₁_efetivo)
5. **Calcular Y** = Multiplicador × Gasto autônomo
6. **Calcular métricas derivadas:**
   - Renda disponível = Y - T
   - Consumo total = c₀ + c₁ * (Y - T)
   - Poupança privada = -c₀ + (1 - c₁) * (Y - T)
   - Poupança pública = T - G
   - Poupança total = Poupança privada + Poupança pública
   - Verificar relação IS: I deve ser ≈ Poupança total (mostrar ambos lado a lado como prova)

### Validação do cálculo

O `game-engine.js` deve exportar uma função `calculateEquilibrium(params)` que recebe:

```javascript
{
  c0: number,  // consumo autônomo efetivo (já com penalidade se houver)
  c1: number,  // propensão marginal a consumir efetiva
  I: number,   // investimento efetivo
  G: number,   // gastos do governo efetivos
  T: number    // impostos efetivos
}
```

E retorna:

```javascript
{
  Y: number,            // PIB de equilíbrio
  multiplier: number,   // multiplicador
  autonomousSpending: number,  // gasto autônomo
  consumption: number,  // consumo total
  disposableIncome: number,  // renda disponível
  privateSavings: number,    // poupança privada
  publicSavings: number,     // poupança pública
  totalSavings: number,      // poupança total
  isBalance: boolean,        // I ≈ totalSavings (com tolerância de 0.01)
  deficit: number            // G - T
}
```

Essa função DEVE ser pura (sem efeitos colaterais, sem acesso a DOM ou Firebase).

---

## 5b. Pontuação e Missões (gamificação)

Modelo híbrido: cada setor pontua por cumprir sua **missão** (0 a 100) e, se o PIB da rodada atingir a **meta**, os três setores ganham um **bônus coletivo**. Os pontos das 3 rodadas se acumulam num **ranking**. Toda a lógica é pura em `game-engine.js` (`computeSectorScores`, `computeLeaderboard`).

### Missões (`SECTOR_MISSIONS`)
- **Famílias (Bem-estar):** maximizar o consumo, sem se endividar. Pontuação = `clamp01(consumo / refConsumption) * 100`, multiplicada por 0.6 se a poupança privada ficar negativa.
- **Empresas (Crescimento):** PIB alto investindo com ousadia. Pontuação = `clamp01(Y / refY) * 85 + clamp01(I / I_max) * 15`, multiplicada por 0.7 se a economia estiver descapitalizada (poupança anterior < 10).
- **Governo (Equilíbrio):** PIB alto com déficit baixo. Pontuação = `clamp01(Y / refY) * 100 * (1 - 0.5 * clamp01(max(0, déficit) / refDeficit))`, menos 20 fixos se a penalidade fiscal foi aplicada.

### Bônus coletivo
`targetHit = |Y - targetY| <= targetBand`. Se verdadeiro, soma `collectiveBonus` (30) aos três setores.

### Constantes por rodada (em `ROUND_EVENTS[n].scoring`, tunáveis)
| Rodada | targetY | targetBand | refY | refConsumption | refDeficit |
|--------|---------|-----------|------|----------------|-----------|
| 1 | 850 | 250 | 1000 | 700 | 80 |
| 2 | 700 | 250 | 850 | 600 | 80 |
| 3 | 900 | 250 | 1050 | 750 | 60 |

Os scores (`{ familias, empresas, governo }`) são gravados junto do resultado da rodada em `results/round_n/scores`. O ranking acumulado é derivado dos resultados, sem storage adicional.

---

## 5c. Duração configurável

O mestre define a duração total (10 a 20 min) por um slider no lobby (`config.totalMinutes`). A função pura `computeDurations(totalMinutes)` deriva os tempos de cada parte:

```
totalSec = totalMinutes * 60
perRound = (totalSec - 150) / 3        // reserva ~60s de intro e ~90s para o resultado final
submissionSeconds = clamp(round(perRound * 0.68), 60, 300)
revealSeconds     = clamp(round(perRound * 0.32), 30, 150)
```

Ao iniciar uma rodada, o mestre grava `config.roundEndsAt = Date.now() + submissionSeconds * 1000`. Mestre e jogadores contam regressivamente até esse instante (sincronizado). Ao zerar, a rodada **encerra automaticamente** (o mestre ainda pode fechar antes). As durações das fases da animação de revelação são escaladas proporcionalmente a `revealSeconds`.

---

## 6. Interface do Jogador (player.html)

### 6.1 Tela de seleção de setor
- Exibida após entrar na sala.
- 3 cards grandes: Famílias, Empresas, Governo.
- Cada card mostra: nome do setor, ícone (Tabler), parâmetros que o jogador controlará, e quantos jogadores já escolheram aquele setor (atualizado em tempo real via Firebase).
- Ícones sugeridos: Famílias = `ti-home`, Empresas = `ti-building-factory`, Governo = `ti-building-bank`.
- Cores: Famílias = verde (#00e676), Empresas = azul (#60a5fa), Governo = dourado (#fbbf24).

### 6.2 Tela de espera
- Após escolher setor, mostrar "Aguardando o mestre iniciar a rodada..."
- Animação sutil de loading (3 dots pulsando).
- Atualizar via listener do Firebase no campo `config/status`.

### 6.3 Tela de submissão (rodada ativa)
- Banner no topo com: número da rodada, nome do evento, descrição do evento.
- Sliders para cada parâmetro do setor do jogador, com:
  - Label do parâmetro
  - Texto de ajuda (ver seção 3)
  - Valor atual exibido em fonte monoespacada grande
  - Limites mínimo e máximo visíveis
  - Se a rodada restringiu algum limite, exibir um badge "Limite reduzido pela crise" em vermelho.
- Para Empresas nas rodadas 2/3: mostrar a poupança da rodada anterior e o limite de investimento derivado dela.
- Botão "Enviar minha decisão" no final.
- Após enviar: tela de confirmação com os valores submetidos e "Aguardando os outros setores..."
- O jogador PODE alterar seus valores enquanto a rodada estiver aberta (novo envio sobrescreve o anterior).

### 6.4 Tela de resultado da rodada
- Mostrada quando o mestre projeta os resultados.
- Exibir:
  - O PIB calculado (número grande, verde).
  - A contribuição do setor do jogador: quais valores médios do setor dele foram usados.
  - Uma frase contextual gerada pelo JS, tipo: "Seu setor definiu c₁ = 0.75. Isso gerou um multiplicador de 4.0x."
  - Comparação com a rodada anterior (se rodada 2 ou 3): PIB subiu ou caiu? Por quanto?

### 6.5 Tela de resultado final
- Após a rodada 3, exibir resumo das 3 rodadas.
- Gráfico de barras simples (3 barras, uma por rodada) mostrando a evolução do PIB.
- Destaque para o maior e menor PIB entre as 3 rodadas.
- Frase de conclusão: qual rodada teve o maior multiplicador e por quê (baseada nos parâmetros).

---

## 7. Interface do Mestre (master.html)

### 7.1 Acesso
- Ao abrir `master.html`, solicitar o código da sala e a senha de mestre (masterKey).
- Validar contra o Firebase. Se inválido, exibir erro.

### 7.2 Lobby
- Lista de todos os jogadores conectados, agrupados por setor.
- Contadores: X famílias, Y empresas, Z governo.
- Botão "Iniciar Rodada 1" (habilitado somente quando pelo menos 1 jogador em cada setor).

### 7.3 Tela de rodada ativa
- Banner com número da rodada e evento.
- Exibir em tempo real quantos jogadores de cada setor já submeteram.
  - Formato: "Famílias: 8/12 enviaram | Empresas: 3/5 enviaram | Governo: 2/4 enviaram"
- Temporizador visual de 3 minutos (180 segundos), contando regressivamente.
  - O temporizador é apenas visual e indicativo. Ele NÃO encerra a rodada automaticamente.
  - O mestre encerra manualmente com o botão "Fechar Rodada e Calcular".
- O botão "Fechar Rodada" deve ter uma confirmação: "Tem certeza? Jogadores que não enviaram usarão valores padrão."

### 7.4 Tela de revelação (animação de cálculo)
- Esta é a tela mais importante. Ela é projetada no telão da sala.
- A animação deve ser sequencial e durável (~30 a 45 segundos) para que o apresentador possa narrar.
- Sequência da animação:

**Fase 1 (5s):** "Coletando decisões dos setores..."
Mostrar os 3 setores com os valores médios que cada um submeteu, aparecendo um de cada vez com animação de fade-in.

**Fase 2 (5s):** "Verificando restrições..."
Se houve penalidade de déficit: mostrar o déficit (G - T), destacar em vermelho, mostrar a redução de c₀. Se não houve, mostrar um check verde "Sem penalidades".

**Fase 3 (10s):** "Montando a equação..."
Mostrar a equação genérica:
```
Y = [1 / (1 - c₁)] × [c₀ + I + G - c₁ × T]
```
Depois substituir cada variável pelo valor efetivo da rodada, uma por uma, com highlight na variável sendo substituída.

**Fase 4 (5s):** "Calculando o multiplicador..."
Mostrar: `1 / (1 - c₁) = 1 / (1 - 0.XX) = N.XX`
Número grande, verde, pulsando.

**Fase 5 (5s):** "Calculando o gasto autônomo..."
Mostrar a soma: `c₀ + I + G - c₁ × T = XXX bilhões`

**Fase 6 (5s):** "Resultado: PIB de equilíbrio"
Número gigante do Y, com animação de count-up.
Abaixo: mini cards com Consumo, Poupança Privada, Poupança Pública, e a verificação da relação IS (I ≈ S).

**Fase 7 (sempre visível após a animação):**
Painel resumo com todos os parâmetros e resultados, disponível enquanto o mestre não avançar.

- O mestre pode pular a animação com um botão "Pular para resultado".
- Após a animação, botão "Avançar para Rodada N+1" (ou "Ver Resultado Final" na rodada 3).

### 7.5 Tela de resultado final (após rodada 3)
- Comparativo das 3 rodadas lado a lado:
  - PIB de cada rodada (gráfico de barras ou números empilhados).
  - Multiplicador de cada rodada.
  - Evento de cada rodada.
- Destaques automáticos gerados pelo JS:
  - "A maior variação de PIB foi entre a rodada X e Y (-Z%)."
  - "O multiplicador mais alto foi na rodada X (c₁ = 0.XX)."
  - "A relação IS se manteve em todas as rodadas: I ≈ S + (T - G)." (provar com números)
- Botão "Encerrar sala" que muda o status para "closed" e impede novas submissões.

---

## 8. Fluxo de Criação e Entrada na Sala

### Criar sala (index.html, modo mestre)
1. Mestre clica "Criar sala".
2. Sistema gera código de 4 letras maiúsculas aleatórias (verificar que não existe no Firebase).
3. Mestre define uma senha de 4 dígitos numéricos (masterKey).
4. Sistema cria o nó `rooms/{código}` no Firebase com status "lobby".
5. Mestre é redirecionado para `master.html?room={código}`.

### Entrar na sala (index.html, modo jogador)
1. Jogador digita o código de 4 letras.
2. Sistema verifica se a sala existe e está em status "lobby".
3. Se não: erro "Sala não encontrada ou jogo já iniciado."
4. Se sim: jogador digita seu nome (máx 20 caracteres, mín 2).
5. Sistema gera um `playerId` aleatório (uuid curto de 8 chars).
6. Salvar `playerId` e `name` no `localStorage` do dispositivo.
7. Criar o nó `players/{playerId}` no Firebase.
8. Redirecionar para `player.html?room={código}`.

---

## 9. Tratamento de Erros e Edge Cases

- **Jogador fecha o navegador e volta:** Usar o `playerId` do `localStorage` para reconectar. Verificar se o nó do jogador ainda existe no Firebase. Se sim, retomar de onde parou.
- **Mestre fecha o navegador e volta:** Solicitar código da sala + masterKey novamente. Retomar o estado atual da sala.
- **Nenhum jogador de um setor:** O botão "Iniciar Rodada" fica desabilitado. Exibir aviso ao mestre: "Cada setor precisa de pelo menos 1 jogador."
- **Todos os jogadores de um setor não submetem:** Usar os valores default daquele setor.
- **Valores fora da faixa:** O slider impede fisicamente valores fora da faixa. Se por qualquer razão um valor fora da faixa chegar ao Firebase (manipulação direta), o `game-engine.js` deve clampar o valor ao limite mais próximo.
- **Conexão instável:** O Firebase SDK cuida de reconexão automática. A UI deve mostrar um indicador discreto de status de conexão (bolinha verde/vermelha no rodapé).

---

## 10. Textos e Microcopy

Toda a interface é em português brasileiro. Sem travessões (—) em nenhum texto. Usar vírgulas, pontos ou dois pontos no lugar.

Tons:
- Instruções: direto e breve.
- Eventos econômicos: narrativo mas conciso (2 a 3 frases).
- Resultados: celebratório para PIB alto, inquisitivo para PIB baixo ("O que aconteceu?").
- Erros: gentil e claro.
