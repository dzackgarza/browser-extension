import { executeFunction } from './chrome-api';
import settings from './settings';

/**
 * Message sent from the injected button to the service worker to close the
 * active local review session.
 */
export const REVIEW_CLOSE_MESSAGE = 'review:close';

/** ID of the host element that carries the button's isolated shadow root. */
const HOST_ID = 'hypothesis-review-send-host';

/**
 * Build the request to the loopback endpoint owned by `hypothesis-review`.
 */
export function reviewSessionRequest(s: { reviewSessionUrl: string }) {
  return {
    url: s.reviewSessionUrl,
    init: { method: 'POST' },
  };
}

/**
 * Close the local review session. Runs in the service worker, which is not
 * restricted by the host page's CSP.
 */
async function closeReviewSession(): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
}> {
  const { url, init } = reviewSessionRequest(settings);
  try {
    const res = await fetch(url, init);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Service-worker `runtime.onMessage` listener that performs the network call
 * when the injected button is clicked. Returns `true` to keep the message
 * channel open for the async `sendResponse`; `undefined` for unrelated messages.
 */
export function handleReviewMessage(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) {
  if (message?.type !== REVIEW_CLOSE_MESSAGE) {
    return undefined;
  }
  closeReviewSession().then(sendResponse);
  return true;
}

/**
 * Function executed *in the page* to mount the floating "Send to agent" button.
 *
 * Must be self-contained: it may not reference any identifier from the enclosing
 * module scope, because it is serialized and run in the tab by `chrome.scripting`.
 */
function mountReviewButton(hostId: string, messageType: string) {
  if (document.getElementById(hostId)) {
    return; // already mounted
  }

  const host = document.createElement('div');
  host.id = hostId;
  // Fixed to the LEFT edge so it never collides with the Hypothesis sidebar,
  // which lives on the right. Max z-index so host-page stacking can't bury it.
  host.style.cssText =
    'position:fixed;left:12px;top:50%;transform:translateY(-50%);z-index:2147483647;';

  // Shadow root isolates the button from the host page's CSS, matching how the
  // Hypothesis client isolates its own injected UI.
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = [
    'button {',
    '  font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  color: #fff; background: #bd1c2b; border: none; border-radius: 6px;',
    '  padding: 10px 14px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.3);',
    '  white-space: nowrap;',
    '}',
    'button:hover { background: #a3121f; }',
    'button:disabled { opacity: .7; cursor: default; }',
  ].join('\n');

  const button = document.createElement('button');
  const defaultLabel = 'Send to agent';
  button.textContent = defaultLabel;

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const res = await chrome.runtime.sendMessage({ type: messageType });
      if (res && res.ok) {
        button.textContent = 'Sent ✓';
        button.style.background = '#1c8a3b';
      } else {
        button.textContent = 'Failed ✗';
        button.style.background = '#8a1c1c';
      }
    } catch {
      button.textContent = 'Failed ✗';
      button.style.background = '#8a1c1c';
    }
    setTimeout(() => {
      button.textContent = defaultLabel;
      button.style.background = '';
      button.disabled = false;
    }, 2000);
  });

  shadow.append(style, button);
  (document.body || document.documentElement).appendChild(host);
}

/** Function executed in the page to remove the button. */
function unmountReviewButton(hostId: string) {
  document.getElementById(hostId)?.remove();
}

/**
 * Inject the "Send to agent" button into a tab. A failure here must never break
 * the client-injection lifecycle, so errors are logged and swallowed.
 */
export async function injectReviewButton(tabId: number) {
  try {
    await executeFunction({
      tabId,
      func: mountReviewButton,
      args: [HOST_ID, REVIEW_CLOSE_MESSAGE],
    });
  } catch (err) {
    console.warn('Failed to inject review button', err);
  }
}

/** Remove the "Send to agent" button from a tab. */
export async function removeReviewButton(tabId: number) {
  try {
    await executeFunction({
      tabId,
      func: unmountReviewButton,
      args: [HOST_ID],
    });
  } catch (err) {
    console.warn('Failed to remove review button', err);
  }
}
