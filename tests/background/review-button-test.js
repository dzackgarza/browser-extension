import {
  injectReviewButton,
  removeReviewButton,
  reviewSessionRequest,
  $imports,
} from '../../src/background/review-button';

describe('background/review-button', () => {
  afterEach(() => {
    $imports.$restore();
  });

  // hypothesis-review#7: a failed injection must surface to the caller (which puts the
  // tab into the extension's errored state), never be swallowed into a console warning
  // that leaves the review workflow looking available.
  describe('injectReviewButton', () => {
    it('propagates an injection failure to the caller', async () => {
      const boom = new Error('executeScript failed');
      $imports.$mock({
        './chrome-api': { executeFunction: sinon.stub().rejects(boom) },
      });

      let err;
      try {
        await injectReviewButton(1);
      } catch (e) {
        err = e;
      }
      assert.equal(err, boom);
    });
  });

  describe('removeReviewButton', () => {
    it('propagates a removal failure to the caller', async () => {
      const boom = new Error('executeScript failed');
      $imports.$mock({
        './chrome-api': { executeFunction: sinon.stub().rejects(boom) },
      });

      let err;
      try {
        await removeReviewButton(1);
      } catch (e) {
        err = e;
      }
      assert.equal(err, boom);
    });
  });

  describe('reviewSessionRequest', () => {
    it('posts directly to the local review-session close endpoint', () => {
      assert.deepEqual(
        reviewSessionRequest({
          reviewSessionUrl: 'http://127.0.0.1:8902/session/close',
        }),
        {
          url: 'http://127.0.0.1:8902/session/close',
          init: { method: 'POST' },
        },
      );
    });

    it('contains no backend credential or marker annotation payload', () => {
      const request = reviewSessionRequest({
        reviewSessionUrl: 'http://127.0.0.1:8902/session/close',
      });

      assert.notProperty(request.init, 'headers');
      assert.notProperty(request.init, 'body');
    });
  });
});
