import { reviewAnnotationRequest } from '../../src/background/review-button';

describe('background/review-button', () => {
  describe('reviewAnnotationRequest', () => {
    it('targets the real h annotations endpoint even when apiUrl already includes /api', () => {
      const { url } = reviewAnnotationRequest({
        apiUrl: 'http://localhost:5000/api',
        reviewGroup: 'nJ6PVQia',
        agentToken: 'tok',
      });
      // Not a doubled http://localhost:5000/api/api/annotations.
      assert.equal(url, 'http://localhost:5000/api/annotations');
    });

    it('tolerates a trailing slash on apiUrl', () => {
      const { url } = reviewAnnotationRequest({
        apiUrl: 'http://localhost:5000/api/',
        reviewGroup: 'nJ6PVQia',
        agentToken: 'tok',
      });
      assert.equal(url, 'http://localhost:5000/api/annotations');
    });

    it('sends the bearer token and marker payload', () => {
      const { headers, body } = reviewAnnotationRequest({
        apiUrl: 'http://localhost:5000/api',
        reviewGroup: 'nJ6PVQia',
        agentToken: 'secret',
      });
      assert.equal(headers.Authorization, 'Bearer secret');
      assert.equal(headers['Content-Type'], 'application/json');
      assert.deepEqual(body, {
        uri: 'urn:annotate:marker',
        group: 'nJ6PVQia',
        text: 'review:send',
        tags: ['review:send'],
      });
    });
  });
});
