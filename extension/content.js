// Prevent duplicate injection
if (!window._player2pipInjected) {
  window._player2pipInjected = true;

  let cursorEl = null;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'simulate-input') {
      handleInput(msg.data);
    } else if (msg.action === 'remove-cursor') {
      removeCursor();
    }
  });

  function ensureCursor() {
    if (cursorEl) return cursorEl;
    cursorEl = document.createElement('div');
    cursorEl.id = 'player2pip-remote-cursor';
    cursorEl.style.cssText = `
      position: fixed;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(255, 100, 100, 0.7);
      border: 2px solid #ff3333;
      pointer-events: none;
      z-index: 2147483647;
      transform: translate(-50%, -50%);
      transition: left 0.05s linear, top 0.05s linear;
      display: none;
    `;
    document.body.appendChild(cursorEl);
    return cursorEl;
  }

  function removeCursor() {
    if (cursorEl) {
      cursorEl.remove();
      cursorEl = null;
    }
  }

  function handleInput(data) {
    const pageX = data.x * document.documentElement.clientWidth;
    const pageY = data.y * document.documentElement.clientHeight;

    if (data.event === 'mousemove') {
      const cursor = ensureCursor();
      cursor.style.display = 'block';
      cursor.style.left = pageX + 'px';
      cursor.style.top = pageY + 'px';
      return;
    }

    if (data.event === 'wheel') {
      const target = document.elementFromPoint(pageX, pageY) || document.body;
      target.dispatchEvent(new WheelEvent('wheel', {
        clientX: pageX,
        clientY: pageY,
        deltaX: data.deltaX || 0,
        deltaY: data.deltaY || 0,
        bubbles: true,
        cancelable: true
      }));
      // Also scroll directly since synthetic wheel won't trigger native scroll
      const scrollable = findScrollable(target);
      scrollable.scrollBy(data.deltaX || 0, data.deltaY || 0);
      return;
    }

    if (data.event === 'keydown' || data.event === 'keyup') {
      const activeEl = document.activeElement;
      const target = activeEl || document.body;
      target.dispatchEvent(new KeyboardEvent(data.event, {
        key: data.key,
        code: data.code,
        shiftKey: data.shift || false,
        ctrlKey: data.ctrl || false,
        altKey: data.alt || false,
        metaKey: data.meta || false,
        bubbles: true,
        cancelable: true
      }));
      // Handle text input for input/textarea
      if (data.event === 'keydown' && isTextInput(activeEl) && data.key.length === 1) {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        const value = activeEl.value;
        activeEl.value = value.slice(0, start) + data.key + value.slice(end);
        activeEl.selectionStart = activeEl.selectionEnd = start + 1;
        activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (data.event === 'keydown' && isTextInput(activeEl) && data.key === 'Backspace') {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        const value = activeEl.value;
        if (start === end && start > 0) {
          activeEl.value = value.slice(0, start - 1) + value.slice(end);
          activeEl.selectionStart = activeEl.selectionEnd = start - 1;
        } else {
          activeEl.value = value.slice(0, start) + value.slice(end);
          activeEl.selectionStart = activeEl.selectionEnd = start;
        }
        activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }

    // Mouse events: click, mousedown, mouseup, dblclick
    const target = document.elementFromPoint(pageX, pageY);
    if (!target) return;

    target.dispatchEvent(new MouseEvent(data.event, {
      clientX: pageX,
      clientY: pageY,
      button: data.button || 0,
      bubbles: true,
      cancelable: true
    }));

    // Special handling for clicks
    if (data.event === 'click') {
      // Links: trigger native click for navigation
      const link = target.closest('a');
      if (link) {
        link.click();
        return;
      }
      // Inputs: focus on click
      if (isTextInput(target) || target.tagName === 'SELECT' || target.tagName === 'BUTTON') {
        target.focus();
      }
      // Checkboxes/radios: toggle
      if (target.type === 'checkbox' || target.type === 'radio') {
        target.click();
      }
      // Video elements: toggle play/pause
      if (target.tagName === 'VIDEO') {
        if (target.paused) target.play();
        else target.pause();
      }
    }
  }

  function isTextInput(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      const type = el.type.toLowerCase();
      return ['text', 'password', 'email', 'search', 'url', 'tel', 'number'].includes(type);
    }
    return el.isContentEditable;
  }

  function findScrollable(el) {
    let current = el;
    while (current && current !== document.body) {
      const overflow = getComputedStyle(current).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && current.scrollHeight > current.clientHeight) {
        return current;
      }
      current = current.parentElement;
    }
    return document.documentElement;
  }
}
