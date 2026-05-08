# 📖 GUIA COMPLETO — Controle de Tempo
### Como publicar o app online em ~30 minutos, sem precisar programar

---

## O que você vai usar (tudo gratuito)

| Ferramenta | Para quê |
|---|---|
| **Firebase** (Google) | Banco de dados + login dos usuários |
| **GitHub** | Guardar os arquivos do projeto |
| **Vercel** | Hospedar o app na internet |
| **VS Code** (opcional) | Editar o arquivo de configuração |

---

## PARTE 1 — Configurar o Firebase

### Passo 1.1 — Criar conta e projeto

1. Acesse **https://firebase.google.com**
2. Clique em **"Começar"** e faça login com sua conta Google
3. Clique em **"Adicionar projeto"**
4. Dê um nome: `controle-tempo` → clique em **Continuar**
5. Desative o Google Analytics (não precisa) → clique em **"Criar projeto"**
6. Aguarde criar e clique em **"Continuar"**

---

### Passo 1.2 — Ativar o banco de dados (Firestore)

1. No menu à esquerda, clique em **"Firestore Database"**
2. Clique em **"Criar banco de dados"**
3. Selecione **"Iniciar no modo de produção"** → clique em **Avançar**
4. Escolha a região **southamerica-east1 (São Paulo)** → clique em **"Ativar"**
5. Aguarde criar

---

### Passo 1.3 — Configurar regras de segurança do Firestore

1. Na tela do Firestore, clique na aba **"Regras"**
2. **Apague tudo** que está lá e cole o texto abaixo:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /entries/{entryId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow read: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

3. Clique em **"Publicar"**

---

### Passo 1.4 — Ativar o Login (Authentication)

1. No menu à esquerda, clique em **"Authentication"**
2. Clique em **"Vamos começar"**
3. Clique em **"E-mail/senha"**
4. Ative o primeiro toggle (E-mail/senha) → clique em **"Salvar"**

---

### Passo 1.5 — Criar o usuário Administrador manualmente

1. Ainda em **Authentication**, clique na aba **"Usuários"**
2. Clique em **"Adicionar usuário"**
3. Preencha:
   - E-mail: `admin@suaempresa.com` (pode ser qualquer e-mail válido)
   - Senha: escolha uma senha forte
4. Clique em **"Adicionar usuário"**
5. **Copie o UID** que aparece na lista (parece: `abc123xyz...`)

6. Agora vá em **Firestore Database → Dados**
7. Clique em **"+ Iniciar coleção"**
8. ID da coleção: `users` → clique em **Avançar**
9. ID do documento: **cole o UID** que você copiou
10. Adicione os campos:
    - `name` (string) → `Administrador`
    - `email` (string) → o e-mail que você usou
    - `role` (string) → `admin`
    - `createdAt` (string) → a data de hoje
11. Clique em **"Salvar"**

---

### Passo 1.6 — Pegar as credenciais do Firebase

1. No menu à esquerda, clique na **engrenagem ⚙️** → **"Configurações do projeto"**
2. Role para baixo até **"Seus aplicativos"**
3. Clique no ícone **`</>`** (Web)
4. Apelido do app: `controle-tempo-web` → clique em **"Registrar app"**
5. Você vai ver um bloco de código parecido com esse:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "controle-tempo-xxxxx.firebaseapp.com",
  projectId: "controle-tempo-xxxxx",
  storageBucket: "controle-tempo-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

6. **Deixe essa janela aberta** — você vai precisar desses valores no próximo passo

---

## PARTE 2 — Configurar os arquivos do projeto

### Passo 2.1 — Editar o arquivo firebase.js

1. Abra a pasta `controle-tempo` que você baixou
2. Abra o arquivo `src/firebase.js` com qualquer editor de texto
   (Bloco de Notas, VS Code, TextEdit etc.)
3. **Substitua** cada valor `COLE_AQUI_xxx` pelo valor correspondente do Firebase:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSy...",           // ← cole o apiKey
  authDomain:        "seu-projeto.firebaseapp.com",  // ← cole o authDomain
  projectId:         "seu-projeto",         // ← cole o projectId
  storageBucket:     "seu-projeto.appspot.com",      // ← cole o storageBucket
  messagingSenderId: "123456789",           // ← cole o messagingSenderId
  appId:             "1:123:web:abc",       // ← cole o appId
}
```

4. **Salve o arquivo**

---

## PARTE 3 — Publicar no GitHub

### Passo 3.1 — Criar conta no GitHub

1. Acesse **https://github.com** e crie uma conta gratuita
   (ou faça login se já tiver)

---

### Passo 3.2 — Criar repositório

1. Clique em **"New"** (botão verde) ou acesse https://github.com/new
2. Nome do repositório: `controle-tempo`
3. Deixe como **Private** (privado) — mais seguro
4. Clique em **"Create repository"**

---

### Passo 3.3 — Fazer upload dos arquivos

1. Na página do repositório criado, clique em **"uploading an existing file"**
2. Arraste **toda a pasta `controle-tempo`** para a área de upload
   (ou clique em "choose your files" e selecione todos os arquivos)
3. Aguarde o upload terminar
4. No campo "Commit changes", escreva: `primeiro upload`
5. Clique em **"Commit changes"**

---

## PARTE 4 — Publicar no Vercel

### Passo 4.1 — Criar conta no Vercel

1. Acesse **https://vercel.com**
2. Clique em **"Sign Up"**
3. Escolha **"Continue with GitHub"** — isso conecta os dois

---

### Passo 4.2 — Importar o projeto

1. No dashboard do Vercel, clique em **"Add New → Project"**
2. Encontre o repositório `controle-tempo` na lista
3. Clique em **"Import"**

---

### Passo 4.3 — Configurar o deploy

1. **Framework Preset**: selecione **Vite**
2. **Build Command**: `npm run build`
3. **Output Directory**: `dist`
4. Clique em **"Deploy"**
5. Aguarde 1-2 minutos ☕

---

### Passo 4.4 — Acessar o app

1. Quando terminar, o Vercel mostra o link do seu app:
   `https://controle-tempo-xxx.vercel.app`
2. **Compartilhe esse link** com sua equipe!

---

## PARTE 5 — Adicionar colaboradores

1. Acesse o link do app
2. Clique em **"Criar conta"**
3. Cada colaborador preenche **nome, e-mail e senha**
4. Pronto! Eles já aparecem no painel do administrador

---

## ❓ Perguntas frequentes

**Meus dados são seguros?**
Sim. O Firebase usa a infraestrutura do Google. Os dados ficam no servidor em São Paulo (ou na região que você escolheu) e só usuários autenticados podem acessar.

**Quantos usuários posso ter?**
O plano gratuito do Firebase suporta até **50.000 leituras e 20.000 escritas por dia** — suficiente para equipes de até ~100 pessoas.

**Preciso pagar alguma coisa?**
Não. Firebase (Spark), GitHub (repositório privado) e Vercel (plano hobby) são todos gratuitos para esse uso.

**Como atualizar o app no futuro?**
Edite os arquivos, faça upload novamente no GitHub e o Vercel republica automaticamente em 1-2 minutos.

**Como mudar alguém para administrador?**
No Firebase Console → Firestore → coleção `users` → clique no UID da pessoa → edite o campo `role` de `user` para `admin`.

---

## 🆘 Se algo der errado

| Erro | Solução |
|---|---|
| "Firebase: Error (auth/invalid-api-key)" | Verifique se colou o `apiKey` corretamente em `firebase.js` |
| "Missing or insufficient permissions" | Verifique se publicou as regras do Firestore (Passo 1.3) |
| "Build failed" no Vercel | Confirme que o Framework está como **Vite** |
| App abre mas não loga | Confirme que ativou E-mail/senha no Authentication (Passo 1.4) |

---

✅ **Pronto! Seu app está no ar.**
