# openclaw-sms-ovh

An OpenClaw channel plugin that carries two-way SMS over an OVHcloud dedicated
number, plus a cost-aware notification filter.

The point is to give a basic phone one text-based window onto a self-hosted
agent, including notifications from the messaging apps that phone cannot run.

## Why this exists

OpenClaw's official SMS channel is Twilio-only. Twilio sells only mobile
numbers in France, and 06/07 mobile is the one tier French regulation gives no
automated-messaging derogation to. So the channel that could reach a basic
phone is exactly the one that cannot legally be used for it here.

OVHcloud's Time2Chat sells a dedicated 09 3x number, which sits in the tier
that does have an unconditional derogation, and which a recipient can reply to.

## Design decisions worth knowing

**It polls; it does not use OVH's webhook.** OVH's inbound callback carries no
signature, no shared secret, and no published source IP range, so anything that
could reach the URL could inject a message appearing to come from the user's
phone. Its wire format is also undocumented, with the request to document it
open on `ovh/docs` since 2021. Polling is authenticated by the same signature as
every other call and its response shape is in the published schema.

A side benefit: the plugin needs no public ingress at all. A gateway on a
laptop or a home server receives messages without a tunnel, a hostname or a
certificate.

**Nobody holds anyone else's gateway credentials.** OpenClaw's own security
documentation is explicit that any credential able to inject a message into a
gateway is a full operator secret for that gateway. So this is built as a plugin
the user installs beside their own agent, talking to their own OVH account. No
relay sits in the middle, and no service holds operator access to anyone's
machine.

**Chunking is priced, not just readable.** OpenClaw's Twilio channel defaults to
1500-character chunks, which is about ten SMS segments. That is right when
someone else absorbs the per-segment cost. Here the default is 153, one
concatenated GSM-7 segment, so split points line up with what is billed.

**A reply has a spend ceiling.** An agent that answers a one-line question at
chat length is a familiar failure; here the user pays for it by the segment. One
turn may spend `maxReplySegments`, six by default, about 0.72 EUR at Time2Chat's
rate. Past that the plugin drops the rest and marks the last message with
`[...]`, so someone waiting on a phone can tell the answer was cut rather than
never sent.

**One character can double the bill.** Anything outside GSM 03.38 re-encodes the
whole message as UCS-2 and drops capacity from 160 characters to 70. In French
that means `ê î ô û â ë ï ç` and every emoji. `é è à ù ì ò` are free. `toGsm7`
offers a lossy rewrite, off by default because it turns "prêt" into "pret".

## The notification filter

Four stages, each able only to make the outcome quieter, except stage 3.

1. **Rules** — free and instant, default-drop allow-lists. Absorbs most traffic
   so the paid stages never see it.
2. **Classifier** — one LLM call per ambiguous message. The prompt states what
   *this* message costs, computed from its real segment count. A model asked
   "is this important?" says yes to nearly everything; asked "is this worth 0.12
   EUR?" it behaves like someone spending its own money.
3. **Urgency** — one batched call over everything dropped so far, looking only
   for genuine distress. This is the only stage that can move a decision back
   toward sending, because the expensive mistake is forwarding noise and the
   unacceptable one is silencing an emergency.
4. **Spend** — cooldown, per-sender cap, duplicate suppression, and two budget
   ceilings. The soft one yields to a critical message; the hard one does not,
   for the failure where something escalates everything to critical.

Stages 1 to 4 and the rule schema follow [Sift](https://github.com/edleeman17/sift)
by Ed Leeman (MIT), which solves the same problem for an iPhone-to-dumbphone
bridge. The budget ceilings and the per-message cost model are additions.

## Status

**This has never sent or received a real SMS.** It has no OVH account behind it
yet.

Verified:

- 212 tests pass
- typechecks against the real `openclaw` SDK with no casts or `any`
- builds, and the built module loads with a working `register` function, a
  `gateway.startAccount` hook and the segment-aligned chunk limit
- inbound is wired end to end: the poll loop hands each message to
  `inbound.run`, which routes it to an agent and sends the reply back through
  the delivery adapter. TypeScript checks the turn against the SDK's
  `AssembledChannelTurn` and the adapter against `ChannelEventDeliveryAdapter`.
  I broke each one on purpose to confirm the compiler catches it.
- the OVH request signature is implemented against reference vectors computed
  independently from OVH's published formula, including a case proving the
  escaped and unescaped request bodies hash differently

Not verified, and needing a real account:

- every OVH call. The client is written from the published JSON schema, not
  from observed traffic.
- whether a Time2Chat 09 number appears under `/virtualNumbers`, which decides
  which of the two send routes is correct. One `GET /sms/{service}/senders/{sender}`
  after provisioning settles it.
- **the inbound path has never carried a real message.** The tests drive it with
  a fake runtime that calls the adapter the way OpenClaw does. No live gateway
  has run it.

Known gap:

- **`dmPolicy: "pairing"` behaves as `closed`.** The allow-list is the whole
  gate, with no pairing-code exchange. Real pairing needs the SDK's ingress
  resolver and pairing adapter.

## Blockers outside the code

- **Can a *particulier* order Time2Chat?** OVH's v5.0 contract dropped "Personne
  physique ou morale" from its Client definition. Worth settling in writing
  before relying on this.
- **Time2Chat's launch phase is restricted** to customers who already hold a
  06/07 virtual long number, and a VLN cannot be added to an existing SMS
  account. Ordering may therefore mean a second SMS account.
- **Time2Chat bills two credits per SMS sent**, not one. Any budget built on the
  standard rate is out by half. The cost model here already accounts for it.

## Configuration

```jsonc
{
  "channels": {
    "sms-ovh": {
      "applicationKey": "...",
      "applicationSecret": "...",
      "consumerKey": "...",
      "serviceName": "sms-ab12345-1",
      "virtualNumber": "+33937000000",
      "allowFrom": ["+33612345678"],
      "pollIntervalSeconds": 20,
      "textChunkLimit": 153,
      "maxReplySegments": 6
    }
  }
}
```

The default account also reads `OVH_APPLICATION_KEY`, `OVH_APPLICATION_SECRET`,
`OVH_CONSUMER_KEY`, `OVH_SMS_SERVICE_NAME` and `OVH_SMS_VIRTUAL_NUMBER`. Named
accounts deliberately do not, so a second number cannot silently inherit the
first one's credentials.

`virtualNumber` is required. An alphanumeric sender cannot be replied to at all,
which would defeat the entire purpose.

## Licence

Apache-2.0. The filter design is adapted from Sift, MIT, by Ed Leeman.
