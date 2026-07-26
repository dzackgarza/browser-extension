import {
  annotations,
  injectReviewButton,
  MalformedMessageError,
  reconcile,
  registerReviewMessageListener,
  removeReviewButton,
  REVIEW_STATUS_MESSAGE,
  REVIEW_TOGGLE_MESSAGE,
  $imports,
} from '../../src/background/review-button';
import {
  mountReviewBridge,
  unmountReviewBridge,
} from '../../src/review-bridge';
import {
  BRIDGE_GONE_EVENT,
  BRIDGE_READY_EVENT,
  RESULT_EVENT,
  STATUS_EVENT,
  STATUS_REQUEST_EVENT,
  TOGGLE_EVENT,
} from '../../src/review-events';

describe('background/review-button', () => {
  let fakeExecuteFunction;

  beforeEach(() => {
    fakeExecuteFunction = sinon.stub().resolves(undefined);
    $imports.$mock({
      './chrome-api': { executeFunction: fakeExecuteFunction },
    });
  });

  afterEach(() => {
    $imports.$restore();
  });

  it('mounts the queue relay with the complete event contract', async () => {
    await injectReviewButton(7);

    assert.calledOnce(fakeExecuteFunction);
    assert.deepEqual(fakeExecuteFunction.args[0][0], {
      tabId: 7,
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
  });

  it('unmounts the queue relay from the requested tab', async () => {
    await removeReviewButton(9);

    assert.calledOnce(fakeExecuteFunction);
    assert.deepEqual(fakeExecuteFunction.args[0][0], {
      tabId: 9,
      func: unmountReviewBridge,
      args: [TOGGLE_EVENT, STATUS_REQUEST_EVENT, BRIDGE_GONE_EVENT],
    });
  });

  describe('the runtime message envelope', () => {
    let listeners;

    beforeEach(() => {
      listeners = [];
      registerReviewMessageListener({
        addListener: listener => listeners.push(listener),
      });
    });

    function deliver(message, sendResponse = sinon.stub()) {
      assert.equal(listeners.length, 1);
      return listeners[0](message, { id: 'test-extension' }, sendResponse);
    }

    [
      null,
      undefined,
      REVIEW_TOGGLE_MESSAGE,
      {},
      { payload: 'x' },
      { type: 42 },
    ].forEach(message => {
      it(`rejects malformed message ${JSON.stringify(message)}`, () => {
        assert.throws(() => deliver(message), MalformedMessageError);
      });
    });

    it('leaves a well-formed message for the handler that owns it', () => {
      const sendResponse = sinon.stub();

      assert.isUndefined(deliver({ type: 'getConfigForTab' }, sendResponse));
      assert.notCalled(sendResponse);
    });
  });

  describe('the complete group queue', () => {
    let fetchStub;

    beforeEach(() => {
      fetchStub = sinon.stub(globalThis, 'fetch');
    });

    afterEach(() => {
      fetchStub.restore();
    });

    function response(body, status = 200) {
      return {
        ok: status >= 200 && status < 300,
        status,
        json: sinon.stub().resolves(body),
      };
    }

    it('reads every annotation through the Postgres-backed group endpoint', async () => {
      const first = Array.from({ length: 100 }, (_, index) => ({
        id: `annotation-${index}`,
        created: `2026-07-26T00:00:${String(99 - index).padStart(2, '0')}Z`,
        tags: [],
      }));
      const last = {
        id: 'annotation-100',
        created: '2026-07-25T23:59:59Z',
        tags: [],
      };
      fetchStub.onFirstCall().resolves(
        response({ meta: { page: { total: 101 } }, data: first }),
      );
      fetchStub.onSecondCall().resolves(
        response({ meta: { page: { total: 101 } }, data: [last] }),
      );

      assert.lengthOf(await annotations(), 101);
      assert.match(fetchStub.firstCall.args[0].pathname, /\/groups\/.+\/annotations$/);
      assert.equal(
        fetchStub.secondCall.args[0].searchParams.get('page[after]'),
        first.at(-1).created,
      );
    });

    it('flags unacted annotations and preserves all existing tags', async () => {
      fetchStub.onFirstCall().resolves(
        response({
          meta: { page: { total: 2 } },
          data: [
            {
              id: 'queued',
              created: '2026-07-26T00:00:02Z',
              tags: ['important'],
            },
            {
              id: 'done',
              created: '2026-07-26T00:00:01Z',
              tags: ['acted', 'important'],
            },
          ],
        }),
      );
      fetchStub.onSecondCall().resolves(response({}));

      assert.equal(await reconcile(true), 1);
      assert.equal(fetchStub.callCount, 2);
      assert.deepEqual(JSON.parse(fetchStub.secondCall.args[1].body), {
        tags: ['important', 'agent:queue'],
      });
    });
  });
});
