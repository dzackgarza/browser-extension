import { chromeAPI, executeFunction } from './chrome-api';
import { mountReviewBridge, unmountReviewBridge } from '../review-bridge';
import {
  BRIDGE_GONE_EVENT,
  BRIDGE_READY_EVENT,
  RESULT_EVENT,
  STATUS_EVENT,
  STATUS_REQUEST_EVENT,
  TOGGLE_EVENT,
} from '../review-events';
import settings from './settings';

export const REVIEW_TOGGLE_MESSAGE = 'review:queue-toggle';
export const REVIEW_STATUS_MESSAGE = 'review:queue-status';

const AGENT_QUEUE = 'agent:queue';
const ACTED = 'acted';
const QUEUE_ENABLED_KEY = 'agentQueueEnabled';
const PAGE_SIZE = 100;

export class MalformedMessageError extends Error {}

type ReviewMessage = {
  type: typeof REVIEW_TOGGLE_MESSAGE | typeof REVIEW_STATUS_MESSAGE;
};

type MessageEnvelope = { type: string };

type ApiAnnotation = {
  id: string;
  created: string;
  tags: string[];
};

type QueueStatus = {
  ok: true;
  enabled: boolean;
  queued: number;
};

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

function parseReviewMessage(message: unknown): ReviewMessage | null {
  const { type } = parseMessageEnvelope(message);
  if (type !== REVIEW_TOGGLE_MESSAGE && type !== REVIEW_STATUS_MESSAGE) {
    return null;
  }
  return { type };
}

function authorizationHeaders(): HeadersInit {
  if (
    typeof settings.reviewGroup !== 'string' ||
    settings.reviewGroup === '' ||
    typeof settings.agentToken !== 'string' ||
    settings.agentToken === ''
  ) {
    throw new Error(
      'The extension build has no reviewGroup or agentToken; rebuild it from settings/custom.json.',
    );
  }
  return { Authorization: `Bearer ${settings.agentToken}` };
}

function parseAnnotation(value: unknown): ApiAnnotation {
  if (typeof value !== 'object' || value === null) {
    throw new Error('h search returned a non-object annotation.');
  }
  if (!('id' in value) || typeof value.id !== 'string') {
    throw new Error('h returned an annotation without a string id.');
  }
  if (!('created' in value) || typeof value.created !== 'string') {
    throw new Error(`h returned malformed created time for ${value.id}.`);
  }
  if (
    !('tags' in value) ||
    !Array.isArray(value.tags) ||
    !value.tags.every(tag => typeof tag === 'string')
  ) {
    throw new Error(
      `h returned malformed tags for annotation ${value.id}.`,
    );
  }
  return { id: value.id, created: value.created, tags: value.tags };
}

export async function annotations(): Promise<ApiAnnotation[]> {
  const found: ApiAnnotation[] = [];
  let after: string | undefined;
  let total = 1;
  while (found.length < total) {
    const group = encodeURIComponent(settings.reviewGroup);
    const url = new URL(`${settings.apiUrl}/groups/${group}/annotations`);
    url.searchParams.set('page[size]', String(PAGE_SIZE));
    if (after !== undefined) {
      url.searchParams.set('page[after]', after);
    }
    const response = await fetch(url, { headers: authorizationHeaders() });
    if (!response.ok) {
      throw new Error(
        `h rejected the complete group queue read (HTTP ${response.status}).`,
      );
    }
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('data' in body) ||
      !Array.isArray(body.data) ||
      !('meta' in body) ||
      typeof body.meta !== 'object' ||
      body.meta === null ||
      !('page' in body.meta) ||
      typeof body.meta.page !== 'object' ||
      body.meta.page === null ||
      !('total' in body.meta.page) ||
      typeof body.meta.page.total !== 'number'
    ) {
      throw new Error('h returned a malformed group annotation page.');
    }
    const page = body.data.map(parseAnnotation);
    found.push(...page);
    total = body.meta.page.total;
    if (page.length === 0 && found.length < total) {
      throw new Error(
        'h returned an empty group annotation page before its declared total.',
      );
    }
    after = page[page.length - 1]?.created;
  }
  return found;
}

async function replaceTags(annotation: ApiAnnotation, tags: string[]) {
  const response = await fetch(
    `${settings.apiUrl}/annotations/${encodeURIComponent(annotation.id)}`,
    {
      method: 'PATCH',
      headers: {
        ...authorizationHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `h rejected the queue update for ${annotation.id} (HTTP ${response.status}).`,
    );
  }
}

async function queueEnabled(): Promise<boolean> {
  const stored = await chromeAPI.storage.local.get(QUEUE_ENABLED_KEY);
  return stored[QUEUE_ENABLED_KEY] === true;
}

export async function reconcile(enabled: boolean): Promise<number> {
  const rows = await annotations();
  for (const annotation of rows) {
    const shouldQueue = enabled && !annotation.tags.includes(ACTED);
    const tags = annotation.tags.filter(tag => tag !== AGENT_QUEUE);
    if (shouldQueue) {
      tags.push(AGENT_QUEUE);
    }
    if (
      tags.length !== annotation.tags.length ||
      tags.some((tag, index) => tag !== annotation.tags[index])
    ) {
      await replaceTags(annotation, tags);
    }
  }
  return rows.filter(annotation => enabled && !annotation.tags.includes(ACTED))
    .length;
}

async function readQueueStatus(): Promise<QueueStatus> {
  const enabled = await queueEnabled();
  const queued = await reconcile(enabled);
  return { ok: true, enabled, queued };
}

async function toggleQueue(): Promise<QueueStatus> {
  const enabled = !(await queueEnabled());
  await chromeAPI.storage.local.set({ [QUEUE_ENABLED_KEY]: enabled });
  const queued = await reconcile(enabled);
  return { ok: true, enabled, queued };
}

export function handleReviewMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): true | undefined {
  const parsed = parseReviewMessage(message);
  if (parsed === null) {
    return undefined;
  }
  const operation =
    parsed.type === REVIEW_STATUS_MESSAGE ? readQueueStatus() : toggleQueue();
  operation.then(sendResponse, error =>
    sendResponse({ ok: false, error: String(error) }),
  );
  return true;
}

type MessageEvent = {
  addListener(listener: typeof handleReviewMessage): void;
};

export function registerReviewMessageListener(onMessage: MessageEvent) {
  onMessage.addListener(handleReviewMessage);
}

export async function injectReviewButton(tabId: number) {
  await executeFunction({
    tabId,
    func: mountReviewBridge,
    args: [
      BRIDGE_READY_EVENT,
      TOGGLE_EVENT,
      RESULT_EVENT,
      STATUS_REQUEST_EVENT,
      STATUS_EVENT,
      REVIEW_TOGGLE_MESSAGE,
      REVIEW_STATUS_MESSAGE,
    ],
  });
}

export async function removeReviewButton(tabId: number) {
  await executeFunction({
    tabId,
    func: unmountReviewBridge,
    args: [TOGGLE_EVENT, STATUS_REQUEST_EVENT, BRIDGE_GONE_EVENT],
  });
}
