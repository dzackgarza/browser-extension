/** ID of the host element that carries the button's isolated shadow root. */
export const REVIEW_BUTTON_HOST_ID = 'hypothesis-review-send-host';

/** Message sent to the service worker to close the active review session. */
export const REVIEW_CLOSE_MESSAGE = 'review:close';

/**
 * Mount the floating "Send to agent" button.
 *
 * This function is also serialized by `chrome.scripting.executeScript`, so it must remain
 * self-contained and receive module constants as arguments.
 *
 * @param {string} hostId
 * @param {string} messageType
 * @returns {HTMLElement}
 */
export function mountReviewButton(hostId, messageType) {
  const existingHost = document.getElementById(hostId);
  if (existingHost) {
    return existingHost;
  }

  const host = document.createElement('div');
  host.id = hostId;
  host.style.cssText =
    'position:fixed;left:12px;top:50%;transform:translateY(-50%);z-index:2147483647;';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = [
    '.control { display:flex; flex-direction:column; align-items:flex-start; gap:8px; }',
    'button {',
    '  font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  color: #fff; background: #bd1c2b; border: none; border-radius: 6px;',
    '  min-height: 44px; padding: 10px 14px; cursor: pointer;',
    '  box-shadow: 0 2px 8px rgba(0,0,0,.3); white-space: nowrap;',
    '}',
    'button:hover { background: #a3121f; }',
    'button:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }',
    'button:disabled { opacity: .7; cursor: default; }',
    '[role="status"] {',
    '  display:none; max-width:320px; padding:9px 11px; border-radius:6px;',
    '  font: 500 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  color:#fff; background:#70131c; box-shadow:0 2px 8px rgba(0,0,0,.3);',
    '}',
  ].join('\n');

  const control = document.createElement('div');
  control.className = 'control';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Send to agent';
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Sending…';
    status.style.display = 'none';
    status.textContent = '';

    let result;
    try {
      result = await chrome.runtime.sendMessage({ type: messageType });
    } catch (error) {
      result = {
        ok: false,
        error: `The extension could not contact its background service. ${String(error)}`,
      };
    }
    if (result?.ok) {
      button.textContent = 'Sent ✓';
      button.style.background = '#1c8a3b';
      setTimeout(() => {
        button.textContent = 'Send to agent';
        button.style.background = '';
        button.disabled = false;
      }, 2000);
      return;
    }

    button.textContent = 'Try sending again';
    button.style.background = '#8a1c1c';
    button.disabled = false;
    status.textContent =
      result?.error ??
      `The review service rejected the close request (HTTP ${result?.status ?? 'unknown'}).`;
    status.style.display = 'block';
  });

  control.append(button, status);
  shadow.append(style, control);
  (document.body || document.documentElement).appendChild(host);
  return host;
}

/**
 * Remove the floating review button.
 *
 * @param {string} hostId
 */
export function unmountReviewButton(hostId) {
  document.getElementById(hostId)?.remove();
}
