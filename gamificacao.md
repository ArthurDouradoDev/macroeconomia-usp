# gamificacao.md — Plano de Gamificacao da Fase de Decisao

> Objetivo: transformar a parte "das perguntas" (a tela de submissao do jogador) de
> "arraste 1 ou 2 sliders e aperte enviar" em uma experiencia de decisao com narrativa,
> tensao, feedback ao vivo e identidade. Sem quebrar o modelo keynesiano: todo mecanismo
> novo continua produzindo os mesmos parametros (`c0`, `c1`, `I`, `G`, `T`) que o
> `game-engine.js` ja consome. Vanilla JS, Firebase, mobile-first, zero build.

---

## 1. Diagnostico: por que esta chato hoje

A tela `view-submit` ([player.html:138](player.html#L138)) e identica nas 3 rodadas e
resume a participacao do aluno a:

1. Ler um card de missao estatico ([game-engine.js:66](js/game-engine.js#L66)).
2. Arrastar 1 ou 2 sliders abstratos (`c0`/`c1`, `I`, ou `G`/`T`).
3. Apertar "Enviar minha decisao" ([player-app.js:563](js/player-app.js#L563)).
4. Esperar parado na tela `view-submitted`.

Problemas concretos:

- **Selector abstrato e sem historia.** "I = 80" nao significa nada para um aluno. Nao ha
  papel, nao ha aposta, nao ha consequencia visivel no momento da escolha.
- **Zero variedade entre rodadas.** A mesma UI 3 vezes. O unico que muda e um texto de
  banner e um limite de slider. A rodada 2 e a 3 nao pedem nenhuma decisao *qualitativa*
  nova do jogador.
- **Sem feedback ao vivo.** O jogador move o slider as cegas. So Governo tem um preview de
  deficit ([player-app.js:538](js/player-app.js#L538)). Familias e Empresas nao veem nada
  do impacto da propria escolha.
- **Sem tensao social.** Voce nao ve seu setor decidindo junto. O placar so aparece *depois*
  do calculo. A competicao entre setores e invisivel durante a decisao.
- **Sem identidade.** "Familia" e generico. Nao ha avatar, nome de empresa, nem persona.
- **Pontuacao invisivel na hora que importa.** O aluno sabe sua missao, mas nao sabe se o
  valor que esta escolhendo pontua bem ate ver o resultado.

A consequencia pedagogica: o aluno nao *sente* os trade-offs do modelo (paradoxo da
poupanca, estimulo fiscal, restricao IS). Ele so descobre na revelacao, passivamente.

---

## 2. Principios de design da reforma

1. **A decisao vira uma jogada, nao um ajuste.** Toda rodada o aluno faz uma escolha
   *qualitativa* (uma postura, um dilema) antes de afinar o numero.
2. **Tudo que o aluno faz tem eco imediato.** Mexeu, viu o PIB projetado e a pontuacao
   estimada mudarem na hora.
3. **O modelo nao muda, a embalagem muda.** Cada mecanica nova mapeia para `c0/c1/I/G/T`.
   O `game-engine.js` continua sendo a fonte de verdade e segue testavel isoladamente.
4. **Variedade entre rodadas.** Cada rodada tem um dilema e uma "carta" diferente, ligados
   ao evento economico ja existente ([game-engine.js:8](js/game-engine.js#L8)).
5. **Tensao coletiva visivel.** O aluno ve seu setor decidindo junto e ve a economia
   pulsando no telao antes do reveal.
6. **Identidade leve.** Cada jogador ganha uma persona do seu setor. Custa pouco e cria
   vinculo.

Restricoes mantidas: sem frameworks, sem `localStorage` para estado compartilhado, sem
emojis na UI, sem travessoes nos textos, Tabler Icons, paleta atual.

---

## 3. O novo fluxo de decisao (3 micro-passos por rodada)

Substituir a tela unica de sliders por um fluxo de 3 passos dentro de `view-submit`,
navegado por um stepper no topo. Tudo client-side, um unico envio ao final.

```
[ Passo 1: DILEMA ]  ->  [ Passo 2: CALIBRAR ]  ->  [ Passo 3: APOSTAR E ENVIAR ]
   escolhe postura        afina o numero com           confirma + aposta na meta
   (carta narrativa)      selector tangivel +          coletiva (opcional)
                          projecao ao vivo
```

### Passo 1 — Dilema (escolha narrativa)

Cada setor recebe, por rodada, um **dilema** com 2 ou 3 **cartas de postura**. A carta
escolhida define a *faixa inicial* do selector do passo 2 (role-play + ponto de partida),
e da contexto a decisao. Exemplos (todos mapeiam para faixas dos parametros existentes):

**Familias**
- R1 "Vida normal": Equilibrada / Poupadora / Gastadora.
- R2 "Crise de confianca": "Apertar o cinto" (poupar mais, c1 baixo) vs "Manter o padrao"
  (c1 alto, aposta na recuperacao).
- R3 "Recuperacao": "Voltar a consumir" vs "Reconstruir a poupanca" (alimenta o limite de
  investimento das empresas na rodada seguinte; conecta o paradoxo da poupanca).

**Empresas**
- R1 "Expansao": Agressiva / Cautelosa / Moderada (faixa de `I`).
- R2 "Cortar ou apostar": "Segurar caixa" (I baixo, seguro) vs "Investir na baixa" (I alto,
  arriscado dado o teto reduzido pela crise).
- R3 "Aproveitar a janela": apostar perto do teto limitado pela poupanca anterior vs
  jogar seguro.

**Governo**
- R1 "Postura fiscal": Expansionista / Neutra / Austera (par G/T).
- R2 "Intervir ou esperar": "Pacote de estimulo" (G alto, aceita deficit) vs "Austeridade"
  (segura G, protege credibilidade).
- R3 "O dilema do deficit": estimular sabendo que o limiar de penalidade caiu para 30 e a
  punicao subiu para 15%.

Cada carta e um botao grande (estilo `sector-card`, ja existe em
[player.html:49](player.html#L49)), com titulo, 1 linha de flavor, e um "selo" do efeito
mecanico ("c1 ~ 0.85", "I perto do teto"). Escolher a carta:
- preenche o passo 2 com o valor central da faixa daquela postura;
- guarda `stance` (string) para enviar ao Firebase como cor narrativa do reveal.

> Por que isso resolve o tedio: cria uma decisao de *identidade e estrategia* a cada rodada,
> diferente das anteriores, antes de qualquer numero. E o gancho que falta hoje.

### Passo 2 — Calibrar (selector tangivel + projecao ao vivo)

Aqui mora o pedido central: **trocar o slider abstrato por selectors concretos por setor**,
cada um com **projecao ao vivo** do PIB e da pontuacao estimada.

#### 2.1 Selectors redesenhados (por setor)

**Familias — "Divisor de Renda" (split bar) + stepper de gasto fixo.**
Em vez de um slider de porcentagem, mostrar **R$100 de renda** numa barra horizontal com
um divisor arrastavel: a parte verde e "Gastar" (define `c1`), a parte cinza e "Poupar".
O aluno literalmente divide o dinheiro. Abaixo, um **stepper grande +/-** para o "gasto
fixo da familia" (`c0`), rotulado em R$/mes como hoje
([player.html:198](player.html#L198)). Isso torna `c1` visceral e ensina "consumir = nao
poupar" sem texto.

**Empresas — "Mostrador de Investimento" (gauge radial/arco) com zona de risco.**
Trocar o slider de `I` por um **arco/medidor** com tres zonas coloridas: verde (seguro),
dourado (ousado), vermelho (acima do teto da poupanca, trava no maximo). A agulha mostra o
quanto o aluno esta perto do teto limitado pela poupanca da rodada anterior
([game-engine.js:119](js/game-engine.js#L119)). Comunica risco/ousadia que a missao das
empresas ja premia ([game-engine.js:285](js/game-engine.js#L285)) de forma visual.

**Governo — "Mesa do Orcamento" (barras duplas G e T) com o gap de deficit vivo.**
Duas barras verticais lado a lado (G e T), cada uma com handle. Entre elas, a **fenda do
deficit** se pinta: verde (superavit), dourada (deficit dentro do limiar), vermelha (acima,
penalidade). Reaproveita a logica de `updateDeficitPreview`
([player-app.js:538](js/player-app.js#L538)) elevada a elemento central e visual.

> Implementacao pragmatica: por baixo, cada selector continua escrevendo nos mesmos
> `<input type="range">` ja existentes (ou em variaveis equivalentes). O split bar e o
> gauge sao camadas visuais (`<div>` arrastaveis + `pointermove`) que setam o `value`. Isso
> mantem acessibilidade/fallback e zero dependencia. Um toggle "modo simples" pode reexpor o
> slider cru para quem preferir.

#### 2.2 Projecao ao vivo ("E se?")

Enquanto o aluno calibra, um **medidor de PIB projetado** atualiza em tempo real. A
projecao assume que os outros setores ficam nos valores da rodada anterior (ou nos defaults
na rodada 1) e roda `calculateEquilibrium` ([game-engine.js:168](js/game-engine.js#L168))
no proprio device com os parametros agregados estimados. Mostrar:

- PIB projetado (numero + barra que cresce/encolhe);
- **pontuacao estimada da missao** do setor, reusando `computeSectorScores`
  ([game-engine.js:275](js/game-engine.js#L275)) com o resultado projetado;
- um rotulo qualitativo ("Aquecendo", "Estagnado", "Superaquecido").

> Por que resolve: transforma o slider cego no "simulador" que o jogo de multiplicador
> separado ja tem. O aluno passa a *brincar de macroeconomista* antes de enviar.

### Passo 3 — Apostar e enviar (stakes)

Antes de confirmar, oferecer uma **aposta na meta coletiva** (opcional):

- O aluno aposta se o PIB da turma vai cair dentro da banda da meta da rodada
  (`targetY`/`targetBand`, ja em [game-engine.js:22](js/game-engine.js#L22)).
- Aposta "Sim" ou "Nao" vale um pequeno bonus/penalidade individual (ver secao 5).
- Torna o bonus coletivo (hoje passivo) uma decisao pessoal e gera torcida durante o reveal.

Bonus de compromisso: botao **"Travar decisao"**. Travar antes de faltar X segundos da
um pequeno bonus de "decisao firme", mas impede alterar depois. Cria o trade-off
classico (comprometer cedo vs esperar info). Quem nao trava pode reenviar enquanto a rodada
estiver aberta, como hoje ([player.html:309](player.html#L309)).

---

## 4. Identidade e tensao social (camadas transversais)

### 4.1 Persona do jogador
Ao escolher o setor, sortear uma **persona** leve do setor e guardar em `players/{id}`:
- Familias: "Familia Souza, periferia", "Familia Tanaka, classe media"...
- Empresas: "Metalurgica Andrade", "Startup Bit7"...
- Governo: "Ministra do Planejamento", "Secretario do Tesouro"...

Mostrar a persona no topo da tela de decisao e no reveal. Custo baixo, vinculo alto.
Lista fixa de nomes em `game-engine.js` (sem dependencia externa). Nome editavel opcional.

### 4.2 Reuniao do setor ao vivo ("huddle")
No passo 2, mostrar os avatares/personas dos colegas do mesmo setor (de `players` filtrado
por setor, ja disponivel em [player-app.js:268](js/player-app.js#L268)) e uma **agulha do
consenso**: a media atual do setor com base em quem ja enviou (listener de `submissions`).
O aluno ve "seu setor esta convergindo para c1 ~ 0.8" e sente a coordenacao. Anonimo nos
valores individuais, so a media.

### 4.3 Pulso da economia no telao (master)
Na tela de rodada ativa do mestre ([master-app.js:319](js/master-app.js#L319)), alem do
"X/Y enviaram", adicionar um **medidor de pulso**: a cada submissao, recalcular o PIB
parcial projetado e mover um ponteiro grande no telao. A turma ve a economia "respirando"
antes do reveal, criando suspense coletivo. Reusa `computeRoundResult` com os parciais.

---

## 5. Pontuacao e recompensas (camada de motivacao)

Manter o modelo hibrido atual (missao por setor + bonus coletivo,
[game-engine.js:275](js/game-engine.js#L275)) e somar:

1. **Estimativa ao vivo** da pontuacao da missao no passo 2 (ja descrito).
2. **Aposta na meta** (passo 3): acertar a aposta de meta vale, por exemplo, +10 individuais
   "creditados" ao placar do setor; errar, 0 ou pequena perda. Pura, calculada no reveal.
3. **Bonus de decisao firme**: travar cedo soma uns poucos pontos ao setor.
4. **Badges no reveal** (puro display, derivado dos resultados):
   - "Mao de ferro fiscal" (Governo sem penalidade nas 3 rodadas),
   - "Hat trick" (meta batida 3x),
   - "Consumista consciente" (Familias com consumo alto e poupanca nao negativa),
   - "Aposta certeira na baixa" (Empresas investiu perto do teto numa rodada de crise e o
     PIB subiu).
   Badges sao funcoes puras novas em `game-engine.js` que leem `_allResults`; nada de
   storage extra.
5. **MVP do setor** (stretch): como a agregacao e por media, premiar quem chegou mais perto
   do "valor otimo" da rodada da um motivo individual de cuidar mesmo dentro da media.

Tudo continua gravado em `results/round_n/scores` e derivado por `computeLeaderboard`
([game-engine.js:320](js/game-engine.js#L320)). Sem novas dependencias.

---

## 6. Mapeamento mecanica -> modelo (garante que o engine nao quebra)

| Mecanica nova | O que produz | Onde entra no engine |
|---|---|---|
| Carta de postura (passo 1) | faixa inicial + `stance` (string) | so preset de UI; `stance` salvo p/ reveal |
| Split bar de renda (Familias) | `c1` (0.10-0.95) | mesmo `values.c1` de hoje |
| Stepper de gasto fixo (Familias) | `c0` (10-100) | mesmo `values.c0` |
| Mostrador de investimento (Empresas) | `I` (10-200, teto da poupanca) | mesmo `values.I`, teto de `getRoundLimits` |
| Mesa do orcamento (Governo) | `G`, `T` | mesmos `values.G/T` |
| Projecao ao vivo | nada (so leitura) | chama `calculateEquilibrium` no client |
| Aposta na meta | `bet` ("sim"/"nao") | nova func pura de score no reveal |
| Travar decisao | `committedAt` timestamp | nova func pura de bonus |

Conclusao: `calculateEquilibrium`, `aggregateSectorValues`, `getRoundLimits` e
`computeRoundResult` **nao mudam**. As adicoes sao funcoes puras novas (`computeBetScore`,
`computeCommitBonus`, `computeBadges`, `DILEMMAS`, `PERSONAS`) e camadas de UI.

### Adicoes ao schema do Firebase
```
players/{playerId}/persona: string            // novo
submissions/round_n/{playerId}/
  values: {...}                                 // igual
  stance: string                                // novo (carta escolhida)
  bet: "sim" | "nao" | null                     // novo (aposta na meta)
  committedAt: timestamp | null                 // novo (decisao travada)
results/round_n/scores: {...}                   // igual; bet/commit somados aqui
```
Compativel com as regras abertas atuais do `SPEC.md` (secao 3). Campos novos sao opcionais:
ausencia = comportamento de hoje.

---

## 7. Roadmap de implementacao (incremental, testavel)

Ordenado por impacto/esforco. Cada fase e jogavel sozinha.

**Fase 0 — Base de dados de conteudo (puro, sem UI).**
Adicionar a `game-engine.js`: `DILEMMAS[round][sector]` (cartas + faixas), `PERSONAS[sector]`,
`STANCE_PRESETS`. Funcoes puras `projectEquilibrium(partial, prev)`,
`estimateSectorScore(...)`. Testaveis no console. Nao toca a UI.

**Fase 1 — Projecao ao vivo (maior impacto, menor risco).**
Adicionar o medidor de PIB + score estimado embaixo dos sliders *atuais*. Sem trocar os
selectors ainda. So isso ja mata boa parte do tedio. Liga `oninput` ->
`projectEquilibrium`.

**Fase 2 — Passo 1 (dilema/cartas).**
Inserir o passo de cartas antes dos sliders, com o stepper de navegacao. Cada carta
preseta os sliders existentes. Variedade entre rodadas aparece aqui.

**Fase 3 — Selectors tangiveis.**
Substituir visualmente: split bar (Familias), gauge (Empresas), barras duplas (Governo).
Por baixo continuam setando os mesmos `value`. Manter "modo simples" com o slider cru.

**Fase 4 — Aposta + travar decisao + badges.**
Passo 3 e as funcoes de score novas. Atualizar o reveal do mestre para exibir apostas
certas/erradas e badges.

**Fase 5 — Social (huddle + pulso no telao + personas).**
Agulha de consenso do setor, personas, e o medidor de pulso no `master.html`.

**Fase 6 — Polimento.**
Microcopy, animacoes (sem gradients/shadows/blur conforme `CLAUDE.md`), som opcional curto
no envio, revisao mobile a 380px, e atualizar `TESTING.md` com os novos cenarios.

---

## 8. Esboco de UI (mobile, 380px)

```
+--------------------------------------------+
|  Rodada 2 de 3   Crise de Confianca        |   <- banner (existe)
|  Persona: Familia Souza        [1][2][3]   |   <- persona + stepper de passos
+--------------------------------------------+
|  PASSO 1: Qual sua postura na crise?       |
|  +--------------------+ +----------------+  |
|  | Apertar o cinto    | | Manter padrao  |  |   <- cartas (estilo sector-card)
|  | poupar mais        | | apostar na     |  |
|  | c1 ~ 0.55          | | recuperacao    |  |
|  +--------------------+ | c1 ~ 0.85      |  |
|                         +----------------+  |
+--------------------------------------------+
|  PASSO 2: Divida sua renda                  |
|  R$100  [#####gastar####|##poupar##]        |   <- split bar arrastavel (c1)
|         Gastar R$72        Poupar R$28      |
|  Gasto fixo:   [ - ]  R$2.500/mes  [ + ]    |   <- stepper (c0)
|                                             |
|  PIB projetado:  [=========>      ] 812 bi  |   <- projecao ao vivo
|  Sua missao renderia: ~74 pts  (Aquecendo)  |
|  Seu setor caminha para: c1 ~ 0.78          |   <- huddle (media do setor)
+--------------------------------------------+
|  PASSO 3:  A turma bate a meta de 700 bi?   |
|        ( Sim )      ( Nao )                  |   <- aposta
|  [ Travar decisao (+bonus) ]  [ Enviar ]    |
+--------------------------------------------+
```

---

## 9. Riscos e mitigacoes

- **Complexidade demais para 15 min de aula.** Mitigacao: o fluxo de 3 passos cabe num
  envio so; passos 1 e 3 sao rapidos (1 toque). Fases 4-5 do roadmap sao opcionais; o jogo
  ja melhora muito nas fases 1-3.
- **Selectors customizados em touch.** Mitigacao: usar Pointer Events, manter o
  `<input type="range">` como fallback acessivel ("modo simples"), testar iOS/Android.
- **Projecao ao vivo confundir (assume outros setores parados).** Mitigacao: rotular claro
  "estimativa se os outros mantiverem a rodada anterior". E didatico, nao um bug.
- **Equilibrio do placar.** As novas fontes de ponto (aposta, commit) devem ser pequenas
  perto da missao (0-100) para nao dominar. Manter tunavel em `ROUND_EVENTS[n].scoring`.
- **Regressao do engine.** Mitigacao: nenhuma funcao existente muda de assinatura; as novas
  sao puras e isoladas, cobertas por testes de console como o resto do `game-engine.js`.

---

## 10. Resumo executivo

A reforma troca "arraste um slider e envie" por **escolher uma postura, calibrar com um
controle tangivel vendo o PIB reagir ao vivo, e apostar na meta da turma** com uma persona
no seu nome e o seu setor decidindo junto na sua frente. O modelo economico permanece
intacto: tudo isso so produz os mesmos `c0/c1/I/G/T`. O ganho e de *agencia, tensao e
feedback*, que e exatamente o que falta hoje. Comecar pela Fase 1 (projecao ao vivo) entrega
o maior salto de engajamento com o menor risco.
