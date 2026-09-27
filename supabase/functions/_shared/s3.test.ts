// SigV4 against the published AWS examples (S3 docs, "Authenticating Requests").
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { amzDate, EMPTY_SHA256, objectUrl, presign, signHeaders, uriEncode } from './s3.ts';

const cfg = {
  endpoint: 'https://examplebucket.s3.amazonaws.com',
  region: 'us-east-1',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};
const when = new Date('2013-05-24T00:00:00Z');

test('presigned GET matches the AWS example signature', async () => {
  const url = await presign(cfg, {
    method: 'GET',
    url: 'https://examplebucket.s3.amazonaws.com/test.txt',
    expiresIn: 86400,
    now: when,
  });
  assert.match(
    url,
    /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/,
  );
  assert.match(
    url,
    /X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request/,
  );
});

test('header-signed GET with Range matches the AWS example signature', async () => {
  const h = await signHeaders(cfg, {
    method: 'GET',
    url: 'https://examplebucket.s3.amazonaws.com/test.txt',
    headers: { range: 'bytes=0-9' },
    payloadHash: EMPTY_SHA256,
    now: when,
  });
  assert.equal(
    h.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,' +
      'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,' +
      'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
  );
  assert.equal(h['x-amz-date'], '20130524T000000Z');
});

test('upload URLs sign content-type and content-length (SEC-02)', async () => {
  const url = await presign(cfg, {
    method: 'PUT',
    url: objectUrl(cfg, 'onlyswap-media', 'c/1/l/2/a_full.webp'),
    headers: { 'content-type': 'image/webp', 'content-length': '1234' },
    expiresIn: 600,
    now: when,
  });
  assert.match(url, /X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost/);
  assert.ok(
    url.startsWith('https://examplebucket.s3.amazonaws.com/onlyswap-media/c/1/l/2/a_full.webp?'),
  );
});

test('encoding and dates', () => {
  assert.equal(uriEncode('a b/c~d', true), 'a%20b/c~d');
  assert.equal(uriEncode('a/b'), 'a%2Fb');
  assert.equal(amzDate(when), '20130524T000000Z');
});
