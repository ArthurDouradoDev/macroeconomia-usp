# TESTING.md — Plano de Testes

## Como testar

O jogo envolve múltiplos dispositivos simultâneos. Para testar sozinho, abra 3 abas do navegador:
- Aba 1: Mestre (`master.html`)
- Aba 2: Jogador A (`player.html`)
- Aba 3: Jogador B (`player.html`)

Para um teste mais realista, abra mais abas e distribua entre os 3 setores.

Importante: os testes devem ser executados com o Firebase configurado e o projeto servido localmente ou via GitHub Pages. Para servir localmente sem servidor, use:
```bash
npx serve .
```
Ou simplesmente abra os arquivos HTML diretamente no navegador (o Firebase SDK funciona sem servidor local).

---

## Cenário 1: Criação de sala e entrada de jogadores

### Passos
1. Abrir `index.html`.
2. Clicar em "Criar sala".
3. Definir senha de mestre (ex: "1234").
4. Anotar o código de 4 letras gerado.
5. Em outra aba, abrir `index.html`.
6. Digitar o código da sala e um nome ("Alice").
7. Repetir passo 5-6 com outro nome ("Bob").

### Esperado
- O código da sala é exibido de forma clara e grande para facilitar leitura no telão.
- Alice e Bob são redirecionados para `player.html`.
- Na tela do mestre (aba 1), Alice e Bob aparecem na lista do lobby.
- Tentar entrar com código inexistente mostra erro "Sala não encontrada".
- Tentar entrar com nome vazio ou com 1 caractere mostra erro de validação.
- Tentar criar sala com senha menor que 4 dígitos mostra erro.

---

## Cenário 2: Seleção de setores

### Passos
1. Alice escolhe "Famílias".
2. Bob escolhe "Empresas".
3. Verificar a tela do mestre.

### Esperado
- Na tela do mestre, Alice aparece sob "Famílias" e Bob sob "Empresas".
- Os contadores de cada setor atualizam em tempo real.
- O botão "Iniciar Rodada 1" está DESABILITADO porque o setor "Governo" está vazio.
- Criar um terceiro jogador ("Carlos"), que escolhe "Governo".
- Agora o botão "Iniciar Rodada 1" está HABILITADO.

---

## Cenário 3: Rodada 1 completa (economia normal)

### Passos
1. Mestre clica "Iniciar Rodada 1".
2. Na aba de Alice (Famílias): ajustar c₁ para 0.80 e c₀ para 50.
3. Na aba de Bob (Empresas): ajustar I para 80.
4. Na aba de Carlos (Governo): ajustar G para 100 e T para 100.
5. Todos clicam "Enviar minha decisão".
6. Mestre verifica que 3/3 setores submeteram.
7. Mestre clica "Fechar Rodada e Calcular".

### Cálculo esperado (validar manualmente)
```
c₁ = 0.80, c₀ = 50, I = 80, G = 100, T = 100
Déficit = G - T = 0 (sem penalidade)

Gasto autônomo = c₀ + I + G - c₁ * T = 50 + 80 + 100 - 0.80 * 100 = 150
Multiplicador = 1 / (1 - 0.80) = 5.0
Y = 5.0 * 150 = 750 bilhões

Renda disponível = 750 - 100 = 650
Consumo = 50 + 0.80 * 650 = 570
Poupança privada = -50 + 0.20 * 650 = 80
Poupança pública = 100 - 100 = 0
Poupança total = 80

Verificação IS: I (80) ≈ S_total (80) ✓
```

### Esperado na tela do mestre
- Animação de cálculo passo a passo funciona sem erros.
- O PIB final exibido é 750 (em bilhões).
- O multiplicador exibido é 5.0x.
- A verificação IS mostra I = 80 e S = 80 (iguais).
- Nenhuma penalidade de déficit é mostrada.

### Esperado na tela dos jogadores
- Cada jogador vê o PIB da rodada e a contribuição do seu setor.
- A frase contextual é coerente com os dados.

---

## Cenário 4: Rodada 2 (crise de confiança)

### Passos
1. Mestre avança para Rodada 2.
2. Verificar que o evento "Crise de Confiança" aparece nas telas de todos os jogadores.
3. Alice (Famílias): tentar colocar c₀ acima de 60. Deve estar bloqueado.
4. Bob (Empresas): verificar que I máximo é min(120, poupança da rodada 1).
   - Poupança da rodada 1 = 80, logo I_max = min(120, 80) = 80.
5. Alice define c₁ = 0.60 e c₀ = 40.
6. Bob define I = 60.
7. Carlos (Governo) define G = 150 e T = 80 (tentando estimular a economia).
8. Todos submetem. Mestre fecha rodada.

### Cálculo esperado
```
c₁ = 0.60, c₀ = 40, I = 60, G = 150, T = 80
Déficit = 150 - 80 = 70 > 50 → Penalidade: c₀ reduzido em 10%
c₀_efetivo = 40 * 0.90 = 36

Gasto autônomo = 36 + 60 + 150 - 0.60 * 80 = 198
Multiplicador = 1 / (1 - 0.60) = 2.5
Y = 2.5 * 198 = 495 bilhões

Renda disponível = 495 - 80 = 415
Consumo = 36 + 0.60 * 415 = 285
Poupança privada = -36 + 0.40 * 415 = 130
Poupança pública = 80 - 150 = -70
Poupança total = 130 + (-70) = 60

Verificação IS: I (60) ≈ S_total (60) ✓
```

### Esperado
- O PIB caiu de 750 para 495 (queda de 34%).
- A animação mostra a penalidade de déficit (c₀ reduzido de 40 para 36).
- A comparação entre rodada 1 e 2 é exibida.
- O jogador do setor Famílias vê um destaque: "c₁ caiu de 0.80 para 0.60, reduzindo o multiplicador de 5.0x para 2.5x."

---

## Cenário 5: Rodada 3 (recuperação com dilema)

### Passos
1. Mestre avança para Rodada 3.
2. Verificar que os limites voltaram ao normal (c₀ até 100, I até 200).
3. Verificar que I_max é limitado pela poupança da rodada 2 = 60.
4. Verificar que o limiar de déficit agora é 30 (não 50) e a penalidade é 15%.
5. Alice: c₁ = 0.75, c₀ = 50.
6. Bob: I = 60 (máximo permitido pela poupança anterior).
7. Carlos: G = 100, T = 100 (equilibrando o orçamento).
8. Todos submetem. Mestre fecha rodada.

### Cálculo esperado
```
c₁ = 0.75, c₀ = 50, I = 60, G = 100, T = 100
Déficit = 0 ≤ 30 → Sem penalidade

Gasto autônomo = 50 + 60 + 100 - 0.75 * 100 = 135
Multiplicador = 1 / (1 - 0.75) = 4.0
Y = 4.0 * 135 = 540 bilhões

Renda disponível = 540 - 100 = 440
Consumo = 50 + 0.75 * 440 = 380
Poupança privada = -50 + 0.25 * 440 = 60
Poupança pública = 100 - 100 = 0
Poupança total = 60

Verificação IS: I (60) ≈ S_total (60) ✓
```

### Esperado
- O PIB subiu de 495 para 540, mas ainda está abaixo da rodada 1 (750).
- O resultado final mostra a evolução: 750 → 495 → 540.
- A restrição de investimento pela poupança ficou visível: Bob não pôde investir mais que 60 porque a poupança anterior era 60.
- A relação IS se manteve em todas as rodadas.

---

## Cenário 6: Tela de resultado final

### Esperado na tela do mestre
- Gráfico ou painel comparativo das 3 rodadas.
- Destaques automáticos coerentes com os dados (maior variação, maior/menor multiplicador).
- A relação IS verificada para todas as rodadas.
- Botão "Encerrar sala" funciona e impede novos acessos.

### Esperado na tela dos jogadores
- Resumo de 3 rodadas com PIB e contribuição do setor.
- Gráfico de barras com os 3 PIBs.
- Frase de conclusão coerente.

---

## Cenário 7: Edge cases

### 7.1 Jogador não submete
- Mestre fecha a rodada com um jogador que não submeteu.
- Esperado: valores default do setor são usados para aquele jogador.

### 7.2 Jogador submete múltiplas vezes
- Jogador envia, depois muda de ideia e envia novamente.
- Esperado: apenas a última submissão é considerada.

### 7.3 Desconexão e reconexão
- Jogador fecha a aba no meio de uma rodada.
- Jogador reabre `player.html?room={código}`.
- Esperado: o jogador é reconectado (via playerId do localStorage), vê o estado atual da rodada, e pode submeter normalmente.

### 7.4 Setor com 1 jogador
- Apenas 1 jogador no setor Governo.
- Esperado: a média do setor é simplesmente o valor desse jogador. Sem erros.

### 7.5 Penalidade de déficit na rodada 3
- Governo define G = 180, T = 100 (déficit = 80 > 30).
- Esperado: c₀ é reduzido em 15%. A penalidade aparece na animação.

---

## Cenário 8: Validação do game-engine.js isolado

O `game-engine.js` deve ser testável fora do navegador. Para validar:

1. Abrir o console do navegador em qualquer página que carregue `game-engine.js`.
2. Executar:

```javascript
// Teste 1: Economia básica
const r1 = calculateEquilibrium({ c0: 50, c1: 0.8, I: 80, G: 100, T: 100 });
console.assert(Math.abs(r1.Y - 750) < 0.01, `Teste 1 falhou: Y = ${r1.Y}, esperado 750`);
console.assert(Math.abs(r1.multiplier - 5.0) < 0.01, `Teste 1 falhou: mult = ${r1.multiplier}`);
console.assert(r1.isBalance === true, `Teste 1 falhou: IS não balanceado`);

// Teste 2: c₁ baixo
const r2 = calculateEquilibrium({ c0: 30, c1: 0.5, I: 50, G: 80, T: 60 });
// Y = 2 * (30 + 50 + 80 - 30) = 2 * 130 = 260
console.assert(Math.abs(r2.Y - 260) < 0.01, `Teste 2 falhou: Y = ${r2.Y}, esperado 260`);

// Teste 3: Déficit alto
const r3 = calculateEquilibrium({ c0: 45, c1: 0.7, I: 60, G: 200, T: 50 });
// Y = 3.333 * (45 + 60 + 200 - 35) = 3.333 * 270 = 900
console.assert(Math.abs(r3.Y - 900) < 1, `Teste 3 falhou: Y = ${r3.Y}, esperado ~900`);
console.assert(r3.deficit === 150, `Teste 3 falhou: déficit = ${r3.deficit}`);

// Teste 4: Relação IS
const r4 = calculateEquilibrium({ c0: 40, c1: 0.6, I: 70, G: 90, T: 90 });
console.assert(r4.isBalance === true, `Teste 4 falhou: IS não balanceou`);

console.log("Todos os testes do game-engine passaram.");
```

Se algum `assert` falhar, o motor de cálculo tem um bug que deve ser corrigido antes de continuar.

### Testes das funções de gamificação e duração

```javascript
// Duração: deriva submissão e revelação dentro dos limites
[10, 15, 20].forEach(tm => {
  const d = computeDurations(tm);
  console.assert(d.submissionSeconds >= 60 && d.submissionSeconds <= 300, `submit ${tm}`);
  console.assert(d.revealSeconds >= 30 && d.revealSeconds <= 150, `reveal ${tm}`);
});
console.assert(computeDurations(5).totalMinutes === 10, "clamp baixo");
console.assert(computeDurations(99).totalMinutes === 20, "clamp alto");

// Pontuação: jogo moderado e equilibrado atinge a meta
const players = { a:{sector:"familias"}, b:{sector:"empresas"}, c:{sector:"governo"} };
const subs = { a:{values:{c0:55,c1:0.78}}, b:{values:{I:90}}, c:{values:{G:110,T:100}} };
const r = computeRoundResult(subs, players, 1, null);
console.assert(r.scores && typeof r.scores.familias === "number", "scores presentes");
console.assert(r.scoring.targetHit === true, "meta atingida com jogo moderado");

// Déficit alto derruba o Governo
const subsDef = { a:{values:{c0:50,c1:0.7}}, b:{values:{I:80}}, c:{values:{G:200,T:20}} };
const rDef = computeRoundResult(subsDef, players, 1, null);
console.assert(rDef.scoring.breakdown.governo.penalty === true, "penalidade fiscal aplicada");

// Ranking acumulado ordena e trata empates
const lb = computeLeaderboard({ round_1: r, round_2: rDef });
console.assert(lb.length === 3 && lb[0].rank === 1, "ranking ordenado");
const tie = computeLeaderboard({ round_1: { scores: { familias: 50, empresas: 50, governo: 10 } } });
console.assert(tie[0].rank === 1 && tie[1].rank === 1, "empate compartilha posicao");
console.log("Testes de gamificacao e duracao passaram.");
```

---

## Cenário 9: Gamificação, ranking e duração

### Passos
1. No lobby do mestre, ajustar o slider de **duração total** para 10 min e conferir o texto derivado ("submissao ~1:42 | revelacao ~0:48 por rodada").
2. Iniciar a rodada 1. Confirmar que o cronômetro do mestre e o do celular contam para o **mesmo instante** (diferença de poucos segundos).
3. No celular, conferir o **card de missão** do setor (objetivo + dica).
4. Deixar o cronômetro zerar sem fechar manualmente.
5. Após a revelação, observar a **fase de pontuação** (meta de PIB, pontos por setor, ranking animado).
6. No celular, conferir o bloco "Sua pontuação" (pontos do setor + posição no ranking).
7. Repetir nas rodadas 2 e 3 e, no fim, conferir o **pódio/ranking final** no telão e a posição final no celular.

### Esperado
- O cronômetro **encerra a rodada automaticamente** ao zerar; quem não enviou usa o padrão. O mestre ainda consegue fechar antes.
- Jogo equilibrado (PIB dentro da meta) gera bônus coletivo de +30 para os três setores.
- Déficit alto reduz a nota do Governo; consumo além da renda corta a nota das Famílias; economia descapitalizada penaliza as Empresas.
- O ranking acumulado é consistente entre telão e celular.
- A duração total real fica próxima do valor escolhido (10 a 20 min).

---

## Checklist final antes de considerar o projeto pronto

- [ ] `index.html` abre sem erros no console.
- [ ] Sala é criada com código de 4 letras e senha de 4 dígitos.
- [ ] Jogadores entram com código + nome e são redirecionados.
- [ ] Seleção de setor funciona e contadores atualizam em tempo real no mestre.
- [ ] Botão "Iniciar Rodada" só habilita com pelo menos 1 jogador por setor.
- [ ] Rodada 1: parâmetros sem restrições, cálculo correto (verificar com teste manual).
- [ ] Rodada 2: limites de c₀ e I reduzidos conforme evento. Penalidade de déficit funciona.
- [ ] Rodada 3: limites restaurados. I limitado pela poupança da rodada 2. Penalidade mais severa.
- [ ] Animação de cálculo no mestre executa todas as fases sem erros (incluindo a fase de pontuação).
- [ ] Slider de duração no lobby ajusta o tempo derivado de cada rodada.
- [ ] Cronômetro sincronizado entre mestre e jogadores; encerra a rodada automaticamente ao zerar.
- [ ] Card de missão aparece no celular; pontos e ranking aparecem no resultado e no final.
- [ ] Ranking acumulado e pódio final consistentes entre telão e celular.
- [ ] Tela de resultado final compara as 3 rodadas.
- [ ] Testes do `game-engine.js` no console passam (cálculo, gamificação e duração).
- [ ] Funciona em Chrome e Safari mobile.
- [ ] Nenhum travessão (—) aparece em textos da interface.
- [ ] Indicador de conexão Firebase visível e funcional.
- [ ] Reconexão de jogador funciona via localStorage.
