/**
 * The DOM event names the toolbar and this extension use to talk to each other.
 *
 * This file is the extension's half of a contract whose other half lives in the client
 * (`src/annotator/review-session.ts`). Both restate the strings, because neither repo can
 * import from the other; they are declared in one place per side so a change is a change
 * to one constant rather than to scattered literals.
 */

/** Dispatched by the bridge once it can carry requests. */
export const BRIDGE_READY_EVENT = 'hypothesis:review-bridge-ready';

/** Dispatched by the bridge when it is torn down. */
export const BRIDGE_GONE_EVENT = 'hypothesis:review-bridge-gone';

/** Dispatched by the toolbar to toggle bulk agent-queue flagging. */
export const TOGGLE_EVENT = 'hypothesis:agent-queue-toggle';

/** The bridge's answer to a toggle: `{ ok, enabled, queued, error? }`. */
export const RESULT_EVENT = 'hypothesis:agent-queue-result';

/** Dispatched by the toolbar to ask for the current queue state. */
export const STATUS_REQUEST_EVENT = 'hypothesis:agent-queue-status-request';

/** The bridge's answer to a status request: `{ ok, enabled, queued }`. */
export const STATUS_EVENT = 'hypothesis:agent-queue-status';
