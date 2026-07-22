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
 * A value reached the runtime message bus without the envelope every sender is
 * required to use. Nothing on the bus can route it, so it is thrown rather
 * than ignored: the service worker reports it instead of leaving the sender to
 * believe its request was accepted.
 */
export class MalformedMessageError extends Error {}

/** The only message contract this module handles. */
type ReviewCloseMessage = { type: typeof REVIEW_CLOSE_MESSAGE };

/**
 * The envelope shared by every message on `runtime.onMessage`. `type` is
 * required: it is what decides which handler owns the message.
 */
type MessageEnvelope = { type: string };

/**
 * Validate the envelope of a value that arrived from outside this module, and
 * outside the extension's own compiled code.
 *
 * The returned value is built out of what was checked, so its static type is
 * produced by the validation rather than asserted alongside it.
 */
function parseMessageEnvelope(message: unknown): MessageEnvelope {
  if (typeof message !== 'object' || message === null) {
    throw new MalformedMessageError(
      `Runtime message is not an object (received ${typeof message}).`,
    );
  }
  if (!('type' in message)) {
    throw new MalformedMessageError(
      'Runtime message has no "type" discriminator.',
    );
  }
  const { type } = message;
  if (typeof type !== 'string') {
    throw new MalformedMessageError(
      `Runtime message "type" is not a string (received ${typeof type}).`,
    );
  }
  return { type };
}

/**
 * Validate a message against this module's contract.
 *
 * Throws if the message is malformed. Returns `null` if it is a well-formed
 * message addressed to another handler on the shared bus, which this module
 * must leave for that handler to answer.
 */
function parseReviewCloseMessage(message: unknown): ReviewCloseMessage | null {
  const { type } = parseMessageEnvelope(message);
  if (type !== REVIEW_CLOSE_MESSAGE) {
    return null;
  }
  return { type };
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
  try {
    const res = await fetch(settings.reviewSessionUrl, { method: 'POST' });
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
 * when the injected button is clicked.
 *
 * Returns `true` to keep the message channel open for the async
 * `sendResponse`; `undefined` for a well-formed message owned by another
 * listener on the same bus.
 */
export function handleReviewMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): true | undefined {
  if (parseReviewCloseMessage(message) === null) {
    return undefined;
  }
  closeReviewSession().then(sendResponse);
  return true;
}

/** The part of `chrome.runtime.onMessage` that this module uses. */
type MessageEvent = {
  addListener(listener: typeof handleReviewMessage): void;
};

/**
 * Register the review-session listener on a runtime message bus.
 *
 * The bus is passed in rather than reached for, so registration is itself an
 * observable boundary.
 */
export function registerReviewMessageListener(onMessage: MessageEvent) {
  onMessage.addListener(handleReviewMessage);
}

/**
 * Inject the "Send to agent" button into a tab.
 *
 * Failures propagate to the caller: extension.ts reports them and puts the tab
 * into the extension's errored state, so a page without the review control is
 * never presented as having a working review workflow
 * (hypothesis-review#7: no swallowed errors).
 */
export async function injectReviewButton(tabId: number) {
  await executeFunction({
    tabId,
    func: mountReviewButton,
    args: [REVIEW_BUTTON_HOST_ID, REVIEW_CLOSE_MESSAGE],
  });
}

/** Remove the "Send to agent" button from a tab. Failures propagate. */
export async function removeReviewButton(tabId: number) {
  await executeFunction({
    tabId,
    func: unmountReviewButton,
    args: [REVIEW_BUTTON_HOST_ID],
  });
}
