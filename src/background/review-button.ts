import { executeFunction } from './chrome-api';
import {
  mountReviewButton,
  REVIEW_BUTTON_HOST_ID,
  REVIEW_CLOSE_MESSAGE,
  unmountReviewButton,
} from '../review-button-ui';
import settings from './settings';

export { REVIEW_CLOSE_MESSAGE };

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
    if (res.ok) {
      return { ok: true, status: res.status };
    }
    return {
      ok: false,
      status: res.status,
      error: `The review service rejected the close request (HTTP ${res.status}).`,
    };
  } catch (err) {
    return {
      ok: false,
      error: `No active review session is listening. Start annotate wait and try again. Technical detail: ${String(err)}`,
    };
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
 * Inject the "Send to agent" button into a tab. A failure here must never break
 * the client-injection lifecycle, so errors are logged and swallowed.
 */
export async function injectReviewButton(tabId: number) {
  try {
    await executeFunction({
      tabId,
      func: mountReviewButton,
      args: [REVIEW_BUTTON_HOST_ID, REVIEW_CLOSE_MESSAGE],
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
      args: [REVIEW_BUTTON_HOST_ID],
    });
  } catch (err) {
    console.warn('Failed to remove review button', err);
  }
}
