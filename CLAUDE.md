# CLAUDE.md — Três Setores, Uma Economia

## Visão geral do projeto

Construir um jogo educativo multiplayer em tempo real para uma aula de Macroeconomia (EACH-USP). A turma inteira (~30 alunos) forma uma economia e cada aluno pertence a um dos três setores: Famílias, Empresas ou Governo. Os três setores interagem pela equação do produto de equilíbrio ensinada na aula:

```
Y = (1 / (1 - c1)) * [c0 + I + G - c1 * T]
```

O jogo roda em 3 rodadas. Em cada rodada, os setores submetem valores para seus parâmetros. O sistema calcula o PIB de equilíbrio e projeta os resultados ao vivo. Um "mestre" (o apresentador) controla o avanço das rodadas.

O jogo deve funcionar em GitHub Pages com QR code de acesso. A única dependência externa de backend é o Firebase Realtime Database (gratuito).

---

## Stack e restrições técnicas

### Stack obrigatória
- **Frontend:** HTML + CSS + JavaScript vanilla. ZERO frameworks, ZERO build steps. Todos os arquivos devem ser servidos diretamente pelo GitHub Pages.
- **Backend/Sync:** Firebase Realtime Database (SDK via CDN). Usar o SDK modular (v9+ compat) carregado via `<script>` do CDN do Firebase.
- **Hospedagem:** GitHub Pages (site estático, sem servidor).

### Restrições
- Nenhum `npm install`, nenhum bundler, nenhum `package.json`. Tudo é vanilla.
- A aplicação inteira é um conjunto de arquivos `.html`, `.css` e `.js` na raiz do repositório.
- Mobile-first. Viewport de referência: 380px de largura. Nenhum layout com mais de 2 colunas.
- O Firebase config ficará em um arquivo separado (`firebase-config.js`) com placeholders que o usuário preencherá manualmente. Esse arquivo deve ter comentários claros explicando onde obter cada valor.
- Não usar `localStorage` para estado de jogo compartilhado. Usar apenas Firebase para toda sincronização.
- `localStorage` pode ser usado para lembrar o nome/setor do jogador no dispositivo local.
- Funcionar em Chrome mobile e Safari mobile (iOS 15+, Android 10+).
- Não usar emojis na UI principal. Usar ícones do Tabler Icons via webfont CDN (`https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css`).

---

## Estrutura de arquivos esperada

```
/
├── index.html              # Tela de entrada: criar/entrar em sala
├── player.html             # Interface do jogador (Família, Empresa ou Governo)
├── master.html             # Interface do mestre (apresentador, projetada no telão)
├── css/
│   └── style.css           # Estilos globais
├── js/
│   ├── firebase-config.js  # Config do Firebase (placeholders)
│   ├── db.js               # Abstração de leitura/escrita no Firebase
│   ├── game-engine.js      # Lógica do cálculo econômico e regras de negócio
│   ├── player-app.js       # Lógica da interface do jogador
│   └── master-app.js       # Lógica da interface do mestre
├── SETUP.md                # Instruções para o usuário configurar Firebase e hospedar
└── README.md               # Descrição do projeto
```

---

## Modelo de dados no Firebase

A estrutura no Realtime Database deve seguir este schema. Toda leitura e escrita passam pelas funções do `db.js`, nunca diretamente do código da UI.

```
rooms/
  {roomCode}/
    config/
      status: "lobby" | "round_1" | "round_2" | "round_3" | "results"
      currentRound: 1 | 2 | 3
      createdAt: timestamp
      masterKey: string (senha simples para autenticar o mestre)
      event: null | { type: string, description: string, effects: object }
    players/
      {playerId}/
        name: string
        sector: "familias" | "empresas" | "governo"
        joinedAt: timestamp
    submissions/
      round_{n}/
        {playerId}/
          values: object (depende do setor)
          submittedAt: timestamp
    results/
      round_{n}/
        c0: number
        c1: number
        I: number
        G: number
        T: number
        Y: number
        multiplier: number
        autonomousSpending: number
        savings: number
        timestamp: timestamp
```

### Regras do Firebase Realtime Database

O arquivo SETUP.md deve instruir o usuário a colar estas regras no console do Firebase:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

Nota: regras abertas são aceitáveis para um jogo de aula com vida útil de horas. O SETUP.md deve recomendar desativar o banco após o uso.

---

## Regras de negócio completas

Leia o arquivo `SPEC.md` neste mesmo diretório para todas as regras detalhadas de:
- Criação de sala e lobby
- Distribuição de setores
- Parâmetros controlados por cada setor
- Restrições numéricas de cada parâmetro
- Eventos econômicos por rodada
- Cálculo do PIB de equilíbrio
- Regras de interdependência entre setores
- Lógica da tela de resultados

**Implemente TODAS as regras de SPEC.md sem exceção.** Se houver ambiguidade, resolva com a opção mais simples que mantém a jogabilidade.

---

## Padrões de código

### JavaScript
- Usar `const` e `let`. Nunca `var`.
- Funções assíncronas com `async/await`. Nunca callbacks aninhados.
- Nomes de variáveis e funções em inglês (camelCase).
- Comentários de documentação em português (o público é brasileiro).
- Todas as funções públicas do `game-engine.js` devem ser testáveis isoladamente (sem dependência de DOM ou Firebase).
- Validação de inputs no client: todo campo numérico deve ser sanitizado antes de enviar ao Firebase.

### CSS
- Mobile-first. Um único breakpoint opcional em `768px` para a tela do mestre (projetada no telão).
- Cores via CSS custom properties no `:root`.
- Sem frameworks CSS.
- Paleta: fundo escuro (tons de #080d12 a #192636), verde primário (#00e676), dourado secundário (#fbbf24), azul terciário (#60a5fa), vermelho para alertas (#f87171).
- Tipografia: `DM Sans` para corpo, `Space Mono` para números e código. Carregar via Google Fonts CDN.
- Border radius: 14px para cards, 8px para inputs, 999px para pills/badges.
- Nunca usar gradients, box-shadows ou blur.

### HTML
- Sem frameworks. Sem web components.
- Cada página (`index.html`, `player.html`, `master.html`) é autossuficiente com seus próprios scripts.
- Compartilhar `style.css`, `firebase-config.js`, `db.js` e `game-engine.js` entre as páginas.

---

## Fluxo do jogo (referência rápida)

```
[index.html] Mestre cria sala → recebe código de 4 dígitos
                                         ↓
[index.html] Jogadores entram com código + nome
                                         ↓
[player.html] Jogador escolhe setor (ou é designado)
                                         ↓
[master.html] Mestre vê lobby, distribui setores, inicia rodada 1
                                         ↓
[player.html] Cada setor submete valores (3 min temporizador)
                                         ↓
[master.html] Mestre encerra submissões → sistema calcula Y
                                         ↓
[master.html] Animação de cálculo passo a passo (projetada no telão)
                                         ↓
→ Repete para rodadas 2 e 3 (com eventos econômicos)
                                         ↓
[master.html] Tela final de resultados comparativos entre as 3 rodadas
[player.html] Cada jogador vê seu impacto individual
```

---

## Geração do SETUP.md

O Claude Code deve gerar um `SETUP.md` com instruções passo a passo, em português, incluindo:

1. Como criar um projeto no Firebase Console (console.firebase.google.com)
2. Como ativar o Realtime Database (região us-central1)
3. Como copiar o objeto de configuração e colar em `firebase-config.js`
4. Como colar as regras de segurança
5. Como criar o repositório no GitHub
6. Como ativar GitHub Pages (Settings > Pages > main > / root)
7. Como gerar o QR code com a URL final
8. Um checklist de verificação antes da aula

---

## O que NÃO fazer

- Não usar TypeScript.
- Não usar React, Vue, Svelte ou qualquer framework.
- Não criar um `package.json`.
- Não usar Tailwind ou qualquer CSS framework.
- Não usar localStorage para estado compartilhado do jogo (apenas para dados locais do dispositivo como nome do jogador).
- Não usar WebSockets customizados (Firebase cuida disso).
- Não criar mais de 3 páginas HTML.
- Não colocar a lógica de cálculo econômico dentro do código da UI. Ela deve estar isolada em `game-engine.js`.
- Não usar `alert()`, `confirm()` ou `prompt()`.
- Não usar travessões (—) em nenhum texto da interface.
- Não gerar o arquivo `multiplicador.html`. Ele é um projeto separado.

---

## Ordem de implementação sugerida

1. `firebase-config.js` e `db.js` (infraestrutura)
2. `game-engine.js` com todas as funções de cálculo (lógica pura, sem I/O)
3. `style.css` (design system completo)
4. `index.html` (criação e entrada em sala)
5. `master.html` + `master-app.js` (interface do mestre)
6. `player.html` + `player-app.js` (interface do jogador)
7. `SETUP.md` e `README.md`
8. Testar o fluxo completo (ver TESTING.md)

---

## Validação

Após construir tudo, leia `TESTING.md` neste diretório e execute os cenários de teste descritos. Corrija qualquer falha antes de considerar o projeto concluído.
