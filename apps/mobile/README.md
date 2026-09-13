# @norte/mobile

App **React Native (Expo SDK 57, dev build)** de Norte AI y su **widget de Android**.

Consume los mismos endpoints de `@norte/api` y renderiza el mismo protocolo **Norte A2UI v2** (y el Norte UI Spec v1 del historial viejo) con
componentes nativos propios: el agente emite un solo JSON y web y móvil lo pintan cada uno con lo
suyo.

---

## 1. Por qué dev build y no Expo Go

El widget necesita código nativo (`react-native-android-widget` entra como config plugin), y Expo Go
solo trae los módulos que Expo compiló de antemano. Sin dev build no hay widget, y el widget es la
mitad de la historia que contamos: el acceso al asistente desde la pantalla de inicio del teléfono.

---

## 2. Correrlo

```bash
cd apps/mobile && npm install
```

Este workspace **no** está en los `workspaces` de la raíz a propósito: Metro y el hoisting de npm se
llevan mal, y depurar la resolución de módulos no es a lo que queremos dedicarle el hackathon.
`apps/mobile` tiene su propio `node_modules`.

Apunta la app a tu API y compila el dev build (una sola vez por dispositivo):

```bash
PUBLIC_API_URL=https://tu-servidor npx eas build --profile development --platform android
```

Instala el APK que te da EAS y levanta el bundler:

```bash
cd apps/mobile && npm start
```

Con Android Studio y un emulador o un cable, el dev build también se compila local:

```bash
cd apps/mobile && npm run android
```

> Si la URL de la API cambia el día de la demo, **no hace falta recompilar**: se ajusta desde
> Servicios → Conexión (o desde el propio login) y se guarda en el llavero del dispositivo.

Credenciales sintéticas: `regina` / `Banorte2026` (también `carlos` y `maria`).

---

## 3. Flujo de sesión

```
  primera vez                      siguientes
┌──────────────┐                 ┌──────────────┐
│ LoginScreen  │                 │ UnlockScreen │
│ usuario +    │                 │ huella o     │
│ contraseña   │                 │ Face ID      │
└──────┬───────┘                 └──────┬───────┘
       │ POST /api/auth/login            │ el sistema aprueba
       ▼                                 ▼
  token firmado ──► expo-secure-store ──► GET /api/auth/session ──► adentro
```

**La biometría nunca viaja al servidor.** El sistema operativo responde sí o no y, solo con un sí, la
app lee el token que ya tenía guardado en el llavero (Keychain en iOS, EncryptedSharedPreferences en
Android). Es lo que hace la banca real y evita inventarnos un protocolo biométrico propio, que sería
la parte más fácil de romper de todo esto.

`expo-local-authentication` decide sola si el dispositivo ofrece rostro, huella o iris, y el copy y el
ícono cambian con ella: a un iPhone con Face ID no se le pide "huella".

---

## 4. Estructura

```
apps/mobile/
├── app.config.js          scheme norteai · permisos · plugin del widget · extra.apiUrl
├── eas.json               perfiles development / preview / production
├── index.js               registra la app y el manejador del widget
├── App.js                 fuentes → AuthProvider → NavigationContainer con deep links
├── src/
│   ├── api/               client (token + errores) · sse (streaming por XHR) · endpoints
│   ├── auth/              AuthProvider (4 estados) · biometrics (biometría + llavero)
│   ├── charts/            motor de gráficas propio en SVG: 16 tipos del catálogo
│   ├── chat/              useAgent (un turno completo) · useHistory (Tiger Data)
│   ├── components/        primitivas propias: Icon, ui, TopBar, BottomNav, Composer, ConnectionSheet
│   ├── lib/               config (URL de la API) · format · useDashboard · widget
│   ├── navigation/        RootNavigator · linking (norteai://) · ref
│   ├── a2ui/              Renderer A2UI (React sobre el runtime compartido) · inputs nativos · core/ (copia sincronizada)
│   ├── renderer/          Norte UI Spec v1 → nativo (miniaturas e historial viejo)
│   ├── screens/           Login · Unlock · Assistant (Chat/Historial/Categorías) · Cuentas ·
│   │                      Transferencias · Inversiones · Servicios
│   ├── theme/             tokens idénticos a apps/web/public/css/tokens.css
│   └── voice/             useVoice: dictado y voz del agente vía /api/voice/*
└── widget/                NorteWidget (la pantalla) · task-handler (los eventos de Android)
```

---

## 5. El widget

Dos accesos directos en la pantalla de inicio, sin abrir la app primero:

| Botón | Deep link | Qué pasa |
|---|---|---|
| ⌨️ **Abrir app** | `norteai://chat?mode=text` | Entra al chat con el teclado listo |
| 🎤 **Voz** | `norteai://chat?mode=voice` | Entra al chat **grabando**, y el agente responde hablando |

El widget no habla con la API ni guarda estado: solo abre deep links, así que no puede quedar
desincronizado. Lo único que lee es el nombre de la sesión para saludar, y la app lo redibuja al
entrar y al salir (`src/lib/widget.js`).

Cada uri lleva una marca de tiempo `t` porque Android puede reentregar el mismo intent; sin ella la
app no sabría si es un toque nuevo o el anterior.

---

## 6. Streaming SSE en React Native

`fetch` en React Native no expone `response.body`: el polyfill resuelve la promesa hasta el último
byte. Con fetch, la interfaz generada aparecería de golpe al final y perderíamos justo lo que el reto
premia — ver al agente interpretar, llamar herramientas y construir la pantalla.

`src/api/sse.js` usa `XMLHttpRequest`, que sí entrega `responseText` parcial en cada `onprogress`, y
corta los eventos por la línea en blanco del protocolo SSE. Mismo contrato que la web, distinto
transporte.

---

## 7. Voz

| | Cómo |
|---|---|
| **Dictar** | `expo-audio` graba → el archivo se sube en binario a `POST /api/voice/transcribe` con `file.upload()` de `expo-file-system` (sin multipart ni base64) |
| **Escuchar** | `GET /api/voice/speak?text=…` se reproduce directo desde la URL, así que empieza a sonar mientras se genera |

La key de ElevenLabs solo existe en el servidor. El agente habla únicamente cuando la persona llegó
por voz: leer en voz alta algo que acaba de escribir sería ruido.

---

## 8. Reglas que hereda del proyecto

- **Componentes propios.** No hay librería de UI ni de íconos ni de gráficas: `src/components`,
  `src/charts`, `src/renderer` y `src/a2ui` son del equipo, igual que en la web. El núcleo del protocolo
  (`src/a2ui/core`) se copia desde `packages/a2ui-schema` con `npm run sync:a2ui`; no se edita aquí.
- **Nada de números inventados.** Todo dato viene de una herramienta MCP vía `@norte/api`.
- **El dinero se confirma con un formulario.** La pantalla de Transferencias no transfiere: prepara la
  intención y se la pasa al agente, que genera el formulario y ejecuta `transfer_funds`. El servidor
  solo autoriza esa herramienta tras un envío `[form:transfer_funds]`.
- **Archivos de menos de 400 líneas** y copy en español mexicano.

Detalles del reto y del protocolo en el [README raíz](../../README.md).
