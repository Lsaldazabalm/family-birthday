// ─────────────────────────────────────────────────────────────
// firebase.js — Configuración de Firebase
//
// PASOS:
// 1. Ve a https://console.firebase.google.com
// 2. Crea un proyecto llamado "family-birthday"
// 3. Activa Firestore Database → Iniciar en modo producción
// 4. Ve a Configuración del proyecto → Tus apps → Web (</>)
// 5. Registra la app y reemplaza los valores de abajo
// ─────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyDz1xxMrqQKdOhZIZDczR5rMnlptwBXbAM",
  authDomain:        "family-birthday-df4b2.firebaseapp.com",
  projectId:         "family-birthday-df4b2",
  storageBucket:     "family-birthday-df4b2.appspot.com",
  messagingSenderId: "403505346642",
  appId:             "1:403505346642:web:8394237534c0662e01078b",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
