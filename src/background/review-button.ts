import { executeFunction } from './chrome-api';
import { mountReviewBridge, unmountReviewBridge } from '../review-bridge';
import {
  BRIDGE_GONE_EVENT,
  BRIDGE_READY_EVENT,
  RESULT_EVENT,
  SEND_EVENT,
  STATUS_EVENT,
  STATUS_REQUEST_EVENT,
} from '../review-events';
import settings from './settings';

/** Message sent to the service worker to close the active review session. */
export const REVIEW_CLOSE_MESSAGE = 'review:close';

/** Message sent to the service worker to read the active session's status. */
export const REVIEW_STATUS_MESSAGE = 'review:status';

/**
 * A value reached the runtime message bus without the envelope every sender is
 * required to use. Nothing on the bus can route it, so it is thrown rather
 * than ignored: the service worker reports it instead of leaving the sender to
 * believe its request was accepted.
 */
export class MalformedMessageError extends Error {}

/** The message contracts this module handles. */
type ReviewMessage = {
  type: typeof REVIEW_CLOSE_MESSAGE | typeof REVIEW_STATUS_MESSAGE;
};

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
function parseReviewMessage(message: unknown): ReviewMessage | null {
  const { type } = parseMessageEnvelope(message);
  if (type !== REVIEW_CLOSE_MESSAGE && type !== REVIEW_STATUS_MESSAGE) {
    return null;
  }
  return { type };
}

/**
 * The status endpoint of the same loopback service the close URL names.
 *
 * Derived rather than configured separately: one service, one declared origin, two
 * sibling paths. A second setting would be a second thing to get wrong.
 */
function statusUrl(): string {
  return new URL('/session/status', settings.reviewSessionUrl).toString();
}

/**
 * Read the open session's status: whether one is listening, and how much it would
 * deliver if closed now.
 *
 * A service that is not running is not an error to report as a failure -- it is the
 * normal state between review sessions, and the answer the toolbar needs in order to
 * say so rather than offer a control that cannot work.
 */
async function readSessionStatus(): Promise<{
  ok: boolean;
  listening: boolean;
  queued?: number;
}> {
  try {
    const res = await fetch(statusUrl());
    if (!res.ok) {
      return { ok: false, listening: false };
    }
    const body = await res.json();
    return { ok: true, listening: true, queued: body.queued };
  } catch {
    return { ok: true, listening: false };
  }
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
  const parsed = parseReviewMessage(message);
  if (parsed === null) {
    return undefined;
  }
  if (parsed.type === REVIEW_STATUS_MESSAGE) {
    readSessionStatus().then(sendResponse);
    return true;
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
 * Inject the relay that lets the annotator toolbar reach the review service.
 *
 * Failures propagate to the caller: extension.ts reports them and puts the tab into the
 * extension's errored state, so a page whose toolbar cannot reach the review service is
 * never presented as having a working review workflow (hypothesis-review#7: no swallowed
 * errors).
 */
export async function injectReviewButton(tabId: number) {
  await executeFunction({
    tabId,
    func: mountReviewBridge,
    args: [
      BRIDGE_READY_EVENT,
      SEND_EVENT,
      RESULT_EVENT,
      STATUS_REQUEST_EVENT,
      STATUS_EVENT,
      REVIEW_CLOSE_MESSAGE,
      REVIEW_STATUS_MESSAGE,
    ],
  });
}

/** Remove the relay from a tab, so the toolbar hides its control. Failures propagate. */
export async function removeReviewButton(tabId: number) {
  await executeFunction({
    tabId,
    func: unmountReviewBridge,
    args: [SEND_EVENT, STATUS_REQUEST_EVENT, BRIDGE_GONE_EVENT],
  });
}
