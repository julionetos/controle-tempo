// ─────────────────────────────────────────────────────────────────────────────
// PASSO 1: Cole aqui as credenciais do seu projeto Firebase
// Veja o GUIA.md para saber onde encontrar esses valores
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from 'firebase/app'
import { getAuth }        from 'firebase/auth'
import { getFirestore }   from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            "AIzaSyBnPDpDOXWCz-p1AsHy4f3V_MzmOLoSJ34",
  authDomain:        "controle-de-tarefas-d6ea6.firebaseapp.com",
  projectId:         "controle-de-tarefas-d6ea6",
  storageBucket:     "controle-de-tarefas-d6ea6.firebasestorage.app",
  messagingSenderId: "71347896162",
  appId:             "1:71347896162:web:3b5e18d0443638376fb63b",
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db   = getFirestore(app)
