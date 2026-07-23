import {
  injectReviewButton,
  MalformedMessageError,
  registerReviewMessageListener,
  removeReviewButton,
  REVIEW_CLOSE_MESSAGE,
  $imports,
} from '../../src/background/review-button';
import { mountReviewBridge, unmountReviewBridge } from '../../src/review-bridge';
import {
  BRIDGE_GONE_EVENT,
  BRIDGE_READY_EVENT,
  RESULT_EVENT,
  SEND_EVENT,
  STATUS_EVENT,
  STATUS_REQUEST_EVENT,
} from '../../src/review-events';
import settings from '../../src/background/settings';

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

  // Boundary 1: the scripting interface. `executeFunction` is substituted only
  // to observe the arguments the module actually hands to it; the assertions
  // are about those arguments, not about the substitute.
  describe('the scripting boundary', () => {
    it('mounts the review relay in the requested tab', async () => {
      await injectReviewButton(7);

      assert.calledOnce(fakeExecuteFunction);
      const options = fakeExecuteFunction.args[0][0];
      assert.equal(options.tabId, 7);
      assert.equal(options.func, mountReviewBridge);
      // The relay is handed the whole event contract the toolbar listens on: it is
      // serialized into the page, so anything it needs has to travel with it.
      assert.deepEqual(options.args, [
        BRIDGE_READY_EVENT,
        SEND_EVENT,
        RESULT_EVENT,
        STATUS_REQUEST_EVENT,
        STATUS_EVENT,
        REVIEW_CLOSE_MESSAGE,
        'review:status',
      ]);
    });

    it('unmounts the review relay from the requested tab', async () => {
      await removeReviewButton(9);

      assert.calledOnce(fakeExecuteFunction);
      const options = fakeExecuteFunction.args[0][0];
      assert.equal(options.tabId, 9);
      assert.equal(options.func, unmountReviewBridge);
      assert.deepEqual(options.args, [
        SEND_EVENT,
        STATUS_REQUEST_EVENT,
        BRIDGE_GONE_EVENT,
      ]);
    });

    // hypothesis-review#7: a failed injection must surface to the caller (which
    // puts the tab into the extension's errored state), never be swallowed into
    // a console warning that leaves the review workflow looking available.
    it('propagates an injection failure to the caller', async () => {
      const boom = new Error('executeScript failed');
      fakeExecuteFunction.rejects(boom);

      let err;
      try {
        await injectReviewButton(1);
      } catch (e) {
        err = e;
      }
      assert.equal(err, boom);
    });

    it('propagates a removal failure to the caller', async () => {
      const boom = new Error('executeScript failed');
      fakeExecuteFunction.rejects(boom);

      let err;
      try {
        await removeReviewButton(1);
      } catch (e) {
        err = e;
      }
      assert.equal(err, boom);
    });
  });

  // Boundaries 2 and 3: the message listener and the outgoing request. Every
  // message below is delivered through the listener the module registered, and
  // every request assertion reads the arguments handed to `fetch`.
  describe('the message and network boundaries', () => {
    let fakeFetch;
    let listeners;
    let sender;

    /** A runtime message bus that records what gets registered on it. */
    function messageBus() {
      return {
        addListener: listener => listeners.push(listener),
      };
    }

    function deliver(message, sendResponse = sinon.stub()) {
      assert.equal(
        listeners.length,
        1,
        'expected exactly one registered listener',
      );
      return listeners[0](message, sender, sendResponse);
    }

    /** Let the listener's response promise settle. */
    function settle() {
      return new Promise(resolve => setTimeout(resolve, 0));
    }

    beforeEach(() => {
      listeners = [];
      sender = { id: 'test-extension' };
      fakeFetch = sinon.stub(globalThis, 'fetch');
      registerReviewMessageListener(messageBus());
    });

    afterEach(() => {
      fakeFetch.restore();
    });

    it('registers a listener on the bus it is given', () => {
      assert.equal(listeners.length, 1);
      assert.typeOf(listeners[0], 'function');
    });

    it('posts to the configured review-session endpoint with no payload', async () => {
      fakeFetch.resolves(new Response(null, { status: 200 }));
      const sendResponse = sinon.stub();

      const keepChannelOpen = deliver(
        { type: REVIEW_CLOSE_MESSAGE },
        sendResponse,
      );
      assert.equal(keepChannelOpen, true);

      await settle();

      assert.calledOnce(fakeFetch);
      assert.deepEqual(fakeFetch.args[0], [
        settings.reviewSessionUrl,
        { method: 'POST' },
      ]);
      assert.calledWith(sendResponse, { ok: true, status: 200 });
    });

    it('reports the rejected status when the review service refuses', async () => {
      fakeFetch.resolves(new Response(null, { status: 503 }));
      const sendResponse = sinon.stub();

      deliver({ type: REVIEW_CLOSE_MESSAGE }, sendResponse);
      await settle();

      assert.calledOnce(sendResponse);
      const response = sendResponse.args[0][0];
      assert.equal(response.ok, false);
      assert.equal(response.status, 503);
    });

    it('reports a failure when no review session is listening', async () => {
      fakeFetch.rejects(new TypeError('Failed to fetch'));
      const sendResponse = sinon.stub();

      deliver({ type: REVIEW_CLOSE_MESSAGE }, sendResponse);
      await settle();

      assert.calledOnce(sendResponse);
      const response = sendResponse.args[0][0];
      assert.equal(response.ok, false);
      assert.notOk(response.status);
    });

    [
      { what: 'null', message: null },
      { what: 'undefined', message: undefined },
      { what: 'a bare string', message: REVIEW_CLOSE_MESSAGE },
      { what: 'an object with no discriminator', message: {} },
      { what: 'an object with an unrelated field', message: { payload: 'x' } },
      { what: 'a non-string discriminator', message: { type: 42 } },
    ].forEach(({ what, message }) => {
      it(`rejects a message that is ${what}`, () => {
        const sendResponse = sinon.stub();

        assert.throws(
          () => deliver(message, sendResponse),
          MalformedMessageError,
        );
        assert.notCalled(fakeFetch);
        assert.notCalled(sendResponse);
      });
    });

    it('leaves a well-formed message for the handler that owns it', () => {
      const sendResponse = sinon.stub();

      const result = deliver({ type: 'getConfigForTab' }, sendResponse);

      assert.equal(result, undefined);
      assert.notCalled(fakeFetch);
      assert.notCalled(sendResponse);
    });
  });
});
