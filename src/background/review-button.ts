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
const SEARCH_PAGE_SIZE = 200;

export class MalformedMessageError extends Error {}

type ReviewMessage = {
  type: typeof REVIEW_TOGGLE_MESSAGE | typeof REVIEW_STATUS_MESSAGE;
};

type MessageEnvelope = { type: string };

type ApiAnnotation = {
  id: string;
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
  if (settings.reviewGroup === '' || settings.agentToken === '') {
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
    throw new Error('h search returned an annotation without a string id.');
  }
  if (
    !('tags' in value) ||
    !Array.isArray(value.tags) ||
    !value.tags.every(tag => typeof tag === 'string')
  ) {
    throw new Error(
      `h search returned malformed tags for annotation ${value.id}.`,
    );
  }
  return { id: value.id, tags: value.tags };
}

async function annotations(): Promise<ApiAnnotation[]> {
  const found: ApiAnnotation[] = [];
  let offset = 0;
  let total = 1;
  while (offset < total) {
    const url = new URL(`${settings.apiUrl}/search`);
    url.searchParams.set('group', settings.reviewGroup);
    url.searchParams.set('limit', String(SEARCH_PAGE_SIZE));
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, { headers: authorizationHeaders() });
    if (!response.ok) {
      throw new Error(
        `h search rejected the queue read (HTTP ${response.status}).`,
      );
    }
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('rows' in body) ||
      !Array.isArray(body.rows) ||
      !('total' in body) ||
      typeof body.total !== 'number'
    ) {
      throw new Error('h search returned a malformed queue page.');
    }
    found.push(...body.rows.map(parseAnnotation));
    total = body.total;
    offset += body.rows.length;
    if (body.rows.length === 0 && offset < total) {
      throw new Error(
        'h search returned an empty page before its declared total.',
      );
    }
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

async function reconcile(enabled: boolean): Promise<number> {
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
