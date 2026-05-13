# Tres Setores, Uma Economia

Jogo educativo multiplayer em tempo real para aulas de Macroeconomia. Desenvolvido para a disciplina de Introducao a Analise Economica e suas Conexoes (EACH-USP).

## O que e

A turma inteira forma uma economia. Cada aluno pertence a um dos tres setores: **Familias**, **Empresas** ou **Governo**. Em cada rodada, os setores submetem seus parametros economicos. O sistema calcula o PIB de equilibrio usando o modelo keynesiano:

```
Y = (1 / (1 - c1)) * [c0 + I + G - c1 * T]
```

O jogo tem 3 rodadas com contextos economicos distintos:
1. **Economia Normal** - calibragem inicial
2. **Crise de Confianca** - limites reduzidos para familias e empresas
3. **Recuperacao com Dilema** - restricoes fiscais mais severas, investimento limitado pela poupanca anterior

## Para o apresentador

1. Acesse `master.html` no navegador e crie a sala
2. Projete o codigo de 4 letras no telao
3. Controle o avanco das rodadas e veja a animacao de calculo ao vivo

## Para os alunos

1. Acesse o site pelo QR code ou URL
2. Digite o codigo de 4 letras e escolha um nome
3. Escolha seu setor e submeta seus valores a cada rodada

## Tecnologia

- HTML, CSS e JavaScript vanilla (sem frameworks, sem build)
- Firebase Realtime Database para sincronizacao em tempo real
- Hospedado no GitHub Pages

## Setup

Leia `SETUP.md` para instrucoes completas de configuracao.

## Estrutura de arquivos

```
/
├── index.html          Entrada: criar ou entrar em sala
├── player.html         Interface do jogador
├── master.html         Interface do mestre (projetada no telao)
├── css/
│   └── style.css       Design system completo
├── js/
│   ├── firebase-config.js  Configuracao do Firebase (preencher!)
│   ├── db.js               Abstração do banco de dados
│   ├── game-engine.js      Logica de calculo economico (pura)
│   ├── player-app.js       Logica da interface do jogador
│   └── master-app.js       Logica da interface do mestre
├── SETUP.md            Guia de configuracao passo a passo
└── README.md           Este arquivo
```
