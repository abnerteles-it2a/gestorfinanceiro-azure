import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advisorCacheKeys } from './advisorSession';

test('personal Advisor caches cannot be reused by another signed-in user', () => {
  assert.notEqual(advisorCacheKeys('user-a', 'personal').data, advisorCacheKeys('user-b', 'personal').data);
});
