# 🎂 Junta Familiar — Guía de instalación y despliegue

---

## Estructura del proyecto

```
family-birthday/
├── src/
│   ├── firebase.js   ← 🔥 Configuración Firebase (debes editar esto)
│   ├── db.js         ← Capa de datos (no tocar)
│   ├── App.jsx       ← App principal
│   └── main.jsx      ← Entrada React
├── index.html
├── package.json
├── vite.config.js
└── firestore.rules   ← Reglas de seguridad Firestore
```

---

## PASO 1 — Crear proyecto Firebase (5 minutos)

1. Ve a [https://console.firebase.google.com](https://console.firebase.google.com)
2. Clic en **"Crear un proyecto"** → nombre: `family-birthday`
3. Desactiva Google Analytics (no lo necesitas) → **Crear proyecto**

### Activar Firestore Database

4. En el menú izquierdo → **Firestore Database** → **Crear base de datos**
5. Selecciona **"Iniciar en modo producción"** → elige la región más cercana (ej: `us-central1`) → **Listo**

### Copiar las credenciales

6. Clic en el ⚙️ (Configuración del proyecto) → pestaña **"Tus apps"**
7. Clic en el ícono **`</>`** (Web) → nombre: `family-birthday-web` → **Registrar app**
8. Copia el bloque `firebaseConfig` que aparece

### Configurar las reglas de Firestore

9. En Firestore → pestaña **Reglas** → pega el contenido de `firestore.rules` → **Publicar**

---

## PASO 2 — Configurar el proyecto local

### Editar `src/firebase.js`

Reemplaza los valores con los que copiaste:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",        // ← tu valor real
  authDomain:        "family-birthday-xxx.firebaseapp.com",
  projectId:         "family-birthday-xxx",
  storageBucket:     "family-birthday-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123",
};
```

---

## PASO 3 — Instalar y probar en local

Abre **PowerShell** en la carpeta del proyecto:

```bash
npm install
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173) — deberías ver la pantalla de login.

✅ **Prueba**: regístrate como usuario, luego como admin. Los datos deben aparecer en Firestore Console en tiempo real.

---

## PASO 4 — Subir a GitHub

```bash
git init
git add .
git commit -m "feat: family birthday app con Firebase"
```

1. Ve a [github.com](https://github.com) → **New repository**
2. Nombre: `family-birthday` → **Create repository** (sin README)
3. Ejecuta los comandos que GitHub te muestra en "push an existing repository"

---

## PASO 5 — Desplegar en Vercel (gratis)

1. Ve a [vercel.com](https://vercel.com) → **Add New Project**
2. Importa el repositorio `family-birthday`
3. Vercel detecta Vite automáticamente — **no cambies nada**
4. Clic en **Deploy** ✅

En ~2 minutos tendrás una URL del tipo:
**`https://family-birthday-xxx.vercel.app`**

Comparte esa URL con tu grupo. ¡Listo!

---

## Actualizaciones futuras

Cada vez que modifiques el código:

```bash
git add .
git commit -m "descripción del cambio"
git push
```

Vercel redespliega automáticamente.

---

## ¿Cómo funciona el login?

- Cada integrante **se registra solo** con nombre, celular, fecha de nacimiento y PIN de 4 dígitos
- El PIN se guarda **hasheado** en Firebase (nadie puede verlo en texto plano)
- El admin recibe notificación cada vez que alguien nuevo se registra
- Si alguien **olvida su PIN**, puede crear uno nuevo directamente desde la pantalla de login

---

## Datos que se guardan en Firebase

| Colección | Contenido |
|---|---|
| `members` | Integrantes, foto, PIN hasheado |
| `payments` | Pagos, coberturas, vouchers |
| `wishes` | Saludos del muro con reacciones |
| `config` | Perfil del grupo, notificaciones pendientes |

---

## Cuánto cuesta Firebase

**$0.** El plan gratuito (Spark) incluye:
- 1 GB de almacenamiento
- 50.000 lecturas/día
- 20.000 escrituras/día

Para un grupo de 20-30 personas usando la app mensualmente, usarás menos del 1% del límite gratuito.
