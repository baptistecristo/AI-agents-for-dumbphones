'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { messages } = require('./claim-messages.js')
const { NUDGE_MARKER } = require('./claim-logic.js')

test('claimed: names the user and states both thresholds', () => {
  const m = messages.claimed('faizmullaa')
  assert.match(m, /@faizmullaa/)
  assert.match(m, /5 days/)
  assert.match(m, /Quiet for 7/)
  assert.match(m, /\/unclaim/)
})

test('nudge: carries the idempotency marker', () => {
  assert.ok(messages.nudge('faizmullaa').includes(NUDGE_MARKER))
})

test('nudge: no other message carries the marker', () => {
  assert.ok(!messages.claimed('a').includes(NUDGE_MARKER))
  assert.ok(!messages.released(4, 'a').includes(NUDGE_MARKER))
})

test('held: names the holder and the issue', () => {
  const m = messages.held('faizmullaa', 8, 'tarun2684')
  assert.match(m, /@faizmullaa/)
  assert.match(m, /#8/)
  assert.match(m, /@tarun2684/)
})

test('capReached: lists every held issue', () => {
  const m = messages.capReached('faizmullaa', [2, 3])
  assert.match(m, /#2/)
  assert.match(m, /#3/)
})

test('assignFailed: admits the failure and pulls in the maintainer', () => {
  const m = messages.assignFailed('faizmullaa')
  assert.match(m, /@baptistecristo/)
  assert.match(m, /Nothing you did wrong/)
})

test('every message is non-empty', () => {
  assert.ok(messages.alreadyYours('a').length > 0)
  assert.ok(messages.unclaimed(4).length > 0)
  assert.ok(messages.notHolder('a', 4).length > 0)
  assert.ok(messages.released(4, 'a').length > 0)
})
