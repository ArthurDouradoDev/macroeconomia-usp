// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================
// Como obter esses valores:
// 1. Acesse console.firebase.google.com
// 2. Selecione seu projeto (ou crie um novo)
// 3. Clique na engrenagem > "Configurações do projeto"
// 4. Role até "Seus apps" e clique em "</>" (Web)
// 5. Copie o objeto firebaseConfig e substitua os valores abaixo
// ============================================================

const firebaseConfig = {
  // Chave de API pública do seu projeto Firebase
  apiKey: "AIzaSyCEl4UdPLooLJBvlEb-xHLvaG4ZhSMiKiY",

  // Domínio de autenticação (formato: seu-projeto.firebaseapp.com)
  authDomain: "dinamica-c6894.firebaseapp.com",

  // URL do Realtime Database (formato: https://seu-projeto-default-rtdb.firebaseio.com)
  // Ative o Realtime Database em: Firebase Console > Build > Realtime Database
  databaseURL: "https://dinamica-c6894-default-rtdb.firebaseio.com",

  // ID do projeto (visível na URL do console)
  projectId: "dinamica-c6894",

  // Bucket do Storage (formato: seu-projeto.appspot.com)
  storageBucket: "dinamica-c6894.firebasestorage.app",

  // ID do sender para notificações (número de 12 dígitos)
  messagingSenderId: "323756087831",

  // ID do app (formato: 1:123456789:web:abc123)
  appId: "COLOQUE_SE1:323756087831:web:cfba29bff2bc24eb125a52U_APP_ID_AQUI",
  
  measurementId: "G-87XYZ002ZY"
};

// Inicializa o Firebase com a configuração acima
firebase.initializeApp(firebaseConfig);
