const SERVER_ORIGIN = 'http://localhost:3000'; // Change for production

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const linkBox = document.getElementById('link-box');
const linkInput = document.getElementById('link-input');
const btnCopy = document.getElementById('btn-copy');
const statusEl = document.getElementById('status');

// Check current state
chrome.runtime.sendMessage({ action: 'get-status' }, (res) => {
  if (res && res.sharing) {
    showSharing(res.roomId);
  }
});

btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  statusEl.textContent = 'Подключение...';

  chrome.runtime.sendMessage({ action: 'start-sharing' }, (res) => {
    if (res.error) {
      statusEl.textContent = 'Ошибка: ' + res.error;
      btnStart.disabled = false;
      return;
    }
    showSharing(res.roomId);
  });
});

btnStop.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stop-sharing' });
  btnStart.style.display = '';
  btnStart.disabled = false;
  btnStop.style.display = 'none';
  linkBox.style.display = 'none';
  statusEl.textContent = 'Трансляция остановлена';
});

btnCopy.addEventListener('click', () => {
  linkInput.select();
  navigator.clipboard.writeText(linkInput.value);
  btnCopy.textContent = 'Скопировано!';
  setTimeout(() => { btnCopy.textContent = 'Копировать ссылку'; }, 2000);
});

function showSharing(roomId) {
  const link = `${SERVER_ORIGIN}/room/${roomId}`;
  linkInput.value = link;
  btnStart.style.display = 'none';
  btnStop.style.display = '';
  linkBox.style.display = '';
  statusEl.textContent = 'Трансляция активна';
}
