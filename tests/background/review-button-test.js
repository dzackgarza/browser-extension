import { reviewSessionRequest } from '../../src/background/review-button';

describe('background/review-button', () => {
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
