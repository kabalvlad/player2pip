# Player2PiP

## RU — Смотри вместе

Приложение для совместного просмотра видео/аудио. Один пользователь (хост) вставляет команду в консоль браузера на странице с медиа — второй (зритель) получает ссылку и смотрит/слушает в реальном времени. Оба могут управлять плеером (play, pause, перемотка).

**Как работает:**
1. Создай комнату на главной странице
2. Скопируй команду, открой страницу с видео/аудио
3. Нажми `F12` → Console → вставь команду → нажми кнопку на странице
4. Отправь ссылку зрителю

**Технологии:** WebRTC (P2P стриминг), WebSocket (сигналинг), `captureStream()` + `AudioContext` (захват медиа), Express

---

## EN — Watch Together

App for collaborative video/audio watching. One user (host) pastes a command into the browser console on a page with media — the other (viewer) gets a link and watches/listens in real time. Both can control the player (play, pause, seek).

**How it works:**
1. Create a room on the main page
2. Copy the command, open the page with video/audio
3. Press `F12` → Console → paste the command → click the button on the page
4. Send the link to the viewer

**Tech:** WebRTC (P2P streaming), WebSocket (signaling), `captureStream()` + `AudioContext` (media capture), Express

---

## ES — Mira Juntos

Aplicación para ver video/audio de forma colaborativa. Un usuario (host) pega un comando en la consola del navegador en una página con medios — el otro (espectador) recibe un enlace y ve/escucha en tiempo real. Ambos pueden controlar el reproductor (play, pausa, avance).

**Cómo funciona:**
1. Crea una sala en la página principal
2. Copia el comando, abre la página con video/audio
3. Presiona `F12` → Console → pega el comando → haz clic en el botón de la página
4. Envía el enlace al espectador

**Tecnologías:** WebRTC (streaming P2P), WebSocket (señalización), `captureStream()` + `AudioContext` (captura de medios), Express

---

## Run / Запуск / Ejecutar

```bash
npm install
npm start
# http://localhost:30000
```

### Docker

```bash
docker build -t player2pip .
docker run -d --network host player2pip
```

> Requires HTTPS for `getDisplayMedia` fallback. Use Cloudflare Tunnel or a reverse proxy.
>
> Для `getDisplayMedia` нужен HTTPS. Используй Cloudflare Tunnel или reverse proxy.
>
> Se requiere HTTPS para `getDisplayMedia`. Usa Cloudflare Tunnel o reverse proxy.
