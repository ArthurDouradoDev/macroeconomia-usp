# Guia de Configuracao: Tres Setores, Uma Economia

Siga este guia passo a passo antes da aula. Tempo estimado: 15 a 20 minutos.

---

## 1. Criar projeto no Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Clique em **"Adicionar projeto"**
3. Escolha um nome (ex: `tres-setores-usp`)
4. Desative o Google Analytics (desnecessario para este projeto)
5. Clique em **"Criar projeto"**

---

## 2. Ativar o Realtime Database

1. No painel do Firebase, clique em **"Build"** no menu lateral
2. Selecione **"Realtime Database"**
3. Clique em **"Criar banco de dados"**
4. Selecione a regiao **"United States (us-central1)"**
5. Selecione **"Iniciar no modo de teste"** e clique em **"Ativar"**

---

## 3. Configurar as regras de segurança

As regras abertas sao aceitaveis para um jogo de aula com duracao de horas.

1. No Realtime Database, clique na aba **"Regras"**
2. Substitua o conteudo pelo JSON abaixo e clique em **"Publicar"**:

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

**Importante:** Apos a aula, retorne a esta tela e altere as regras para negar todo acesso:

```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

---

## 4. Obter a configuracao do Firebase

1. No painel do Firebase, clique na **engrenagem** ao lado de "Visao geral do projeto"
2. Selecione **"Configuracoes do projeto"**
3. Role ate a secao **"Seus apps"**
4. Clique em **"</>"** (adicionar app Web)
5. Digite um apelido (ex: `tres-setores-web`) e clique em **"Registrar app"**
6. Voce vera um bloco de codigo como este (os valores sao de exemplo):

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAbc123...",
  authDomain: "tres-setores-usp.firebaseapp.com",
  databaseURL: "https://tres-setores-usp-default-rtdb.firebaseio.com",
  projectId: "tres-setores-usp",
  storageBucket: "tres-setores-usp.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

---

## 5. Colar a configuracao no projeto

1. Abra o arquivo `js/firebase-config.js` em qualquer editor de texto
2. Substitua cada placeholder pelo valor correspondente do passo anterior:

```javascript
const firebaseConfig = {
  apiKey: "COLE_SUA_API_KEY_AQUI",
  authDomain: "COLE_SEU_AUTH_DOMAIN_AQUI",
  databaseURL: "COLE_SUA_DATABASE_URL_AQUI",   // obrigatorio!
  projectId: "COLE_SEU_PROJECT_ID_AQUI",
  storageBucket: "COLE_SEU_STORAGE_BUCKET_AQUI",
  messagingSenderId: "COLE_SEU_MESSAGING_SENDER_ID_AQUI",
  appId: "COLE_SEU_APP_ID_AQUI"
};
```

Salve o arquivo.

---

## 6. Publicar no GitHub Pages

### 6.1 Criar o repositório

1. Acesse [github.com](https://github.com) e faca login
2. Clique em **"New repository"**
3. Nome sugerido: `tres-setores` (ou `macroeconomia-usp`)
4. Deixe como **Public** (necessario para GitHub Pages gratuito)
5. Clique em **"Create repository"**

### 6.2 Subir os arquivos

**Opcao A: Interface web do GitHub (mais facil)**
1. Na pagina do repositorio, clique em **"uploading an existing file"**
2. Arraste todos os arquivos do projeto (mantenha a estrutura de pastas: `css/`, `js/`)
3. Clique em **"Commit changes"**

**Opcao B: Git via terminal**
```bash
git init
git add .
git commit -m "Primeiro commit"
git branch -M main
git remote add origin https://github.com/seu-usuario/tres-setores.git
git push -u origin main
```

### 6.3 Ativar o GitHub Pages

1. No repositorio, clique em **"Settings"**
2. No menu lateral, clique em **"Pages"**
3. Em "Branch", selecione **"main"** e pasta **"/ (root)"**
4. Clique em **"Save"**
5. Aguarde 1 a 2 minutos. A URL do site aparecera como:
   `https://seu-usuario.github.io/tres-setores/`

---

## 7. Gerar o QR code para a aula

1. Acesse qualquer gerador de QR code gratuito, como:
   - [qr-code-generator.com](https://www.qr-code-generator.com)
   - [qrcode-monkey.com](https://www.qrcode-monkey.com)
2. Cole a URL do GitHub Pages gerada no passo anterior
3. Baixe o QR code em PNG ou SVG
4. Insira no slide da apresentacao para que os alunos escaneiem

---

## 8. Teste antes da aula

1. Abra o site no seu navegador (desktop ou mobile)
2. Clique em **"Criar sala"**, defina uma senha de 4 digitos
3. Abra outra aba e entre como jogador com o codigo gerado
4. Adicione mais 2 jogadores (um por setor) e inicie a Rodada 1
5. Envie valores e verifique se o calculo do PIB aparece corretamente

---

## Checklist antes da aula

- [ ] Firebase Realtime Database esta ativo e com as regras abertas publicadas
- [ ] `js/firebase-config.js` tem todos os valores reais (sem COLOQUE_...)
- [ ] O site carrega sem erros no console do navegador
- [ ] Criacao de sala funciona: codigo de 4 letras aparece
- [ ] Jogadores conseguem entrar com o codigo
- [ ] Seleção de setor atualiza em tempo real na tela do mestre
- [ ] Rodada 1 calcula corretamente (testar com c1=0.8, c0=50, I=80, G=100, T=100 -> Y deve ser 750)
- [ ] QR code impresso ou nos slides para projetar
- [ ] Celular com Chrome ou Safari atualizado para usar como jogador de teste
- [ ] Apos a aula: desativar as regras do Firebase Realtime Database

---

## Duvidas frequentes

**O Firebase esta gratuito?**
Sim. O plano Spark (gratuito) inclui 1 GB de dados e 10 GB de download por mes, mais do que suficiente para uma aula.

**Precisa de servidor?**
Nao. Tudo roda no browser. O Firebase e o unico serviço externo utilizado.

**Quantos alunos suporta?**
O limite por setor e 15 jogadores. Com 3 setores: ate 45 jogadores por sala. O plano gratuito do Firebase suporta 100 conexoes simultaneas.

**O jogo funciona sem internet?**
Nao. Firebase exige conexao ativa. Certifique-se de que a sala tem Wi-Fi confiavel.
