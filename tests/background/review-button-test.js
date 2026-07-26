import {
  injectReviewButton,
  MalformedMessageError,
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
});
