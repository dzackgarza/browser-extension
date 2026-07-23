/**
 * Relay between the page's annotator toolbar and the review service worker.
 *
 * The "Send to agent" control belongs in the toolbar beside the app's other buttons, and
 * the toolbar is the client's, rendered in the page. A page cannot reach the loopback
 * review service -- its CSP forbids it, and the service is not a web origin the page is
 * allowed to see -- but the service worker can. So the button asks by dispatching a DOM
 * event, this bridge carries the request across, and the answer comes back the same way.
 *
 * The client hides the control until `hypothesis:review-bridge-ready` is seen: without
 * this extension there is no transport, and a button that cannot work should not be
 * offered.
 *
 * Serialized by `chrome.scripting.executeScript`, so it must stay self-contained and take
 * its constants as arguments.
 *
 * @param {string} readyEvent
 * @param {string} sendEvent
 * @param {string} resultEvent
 * @param {string} statusRequestEvent
 * @param {string} statusEvent
 * @param {string} sendMessage
 * @param {string} statusMessage
 */
export function mountReviewBridge(
  readyEvent,
  sendEvent,
  resultEvent,
  statusRequestEvent,
  statusEvent,
  sendMessage,
  statusMessage,
) {
  // The page is not ours and its `window` is untyped from here, so the handle the
  // bridge parks on itself is reached through an explicit cast rather than pretended
  // into the DOM lib's `Window`.
  const global = /** @type {any} */ (window);
  if (global.__hypothesisReviewBridge) {
    return;
  }

  /**
   * Ask the service worker, and answer the page — including when the ask itself fails,
   * which is what happens when the extension is reloaded out from under the page.
   */
  /**
   * @param {string} type
   * @param {string} replyEvent
   */
  const relay = async (type, replyEvent) => {
    let detail;
    try {
      detail = await chrome.runtime.sendMessage({ type });
    } catch (error) {
      detail = {
        ok: false,
        error: `The extension could not contact its background service. ${String(error)}`,
      };
    }
    window.dispatchEvent(new CustomEvent(replyEvent, { detail }));
  };

  const onSend = () => relay(sendMessage, resultEvent);
  const onStatusRequest = () => relay(statusMessage, statusEvent);

  window.addEventListener(sendEvent, onSend);
  window.addEventListener(statusRequestEvent, onStatusRequest);
  global.__hypothesisReviewBridge = { onSend, onStatusRequest };

  // Announced after the listeners are attached, so a toolbar that reacts by asking for
  // status immediately is answered rather than ignored.
  window.dispatchEvent(new CustomEvent(readyEvent));
}

/**
 * Remove the relay. The toolbar sees no further status and hides its control.
 *
 * @param {string} sendEvent
 * @param {string} statusRequestEvent
 * @param {string} goneEvent
 */
export function unmountReviewBridge(sendEvent, statusRequestEvent, goneEvent) {
  const global = /** @type {any} */ (window);
  const bridge = global.__hypothesisReviewBridge;
  if (!bridge) {
    return;
  }
  window.removeEventListener(sendEvent, bridge.onSend);
  window.removeEventListener(statusRequestEvent, bridge.onStatusRequest);
  delete global.__hypothesisReviewBridge;
  window.dispatchEvent(new CustomEvent(goneEvent));
}
