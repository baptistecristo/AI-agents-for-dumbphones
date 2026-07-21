# Third-party notices

`openclaw-sms-ovh` is licensed Apache-2.0. It also contains work derived from
the project listed below, whose licence terms are reproduced in full.

## Sift

- Project: Sift
- Author: Ed Leeman
- Source: https://github.com/edleeman17/sift
- Licence: MIT

The notification filter cascade and the rule schema in this plugin are derived
from Sift. The following files carry that derivation:

- `src/filter/rules.ts` (rule schema, condition set, precedence order)
- `src/filter/classifier.ts` (cost-aware classifier prompt design)
- `src/filter/rate-limit.ts` (cooldown, per-sender cap, duplicate suppression)
- `src/filter/urgency.ts` (the batched second look at dropped messages)

The code is a TypeScript reimplementation rather than a copy, and it diverges
where SMS billing differs from Sift's assumptions: per-segment cost instead of
a flat per-message price, and daily budget ceilings, which Sift does not have.

Upstream's `LICENSE` file names no copyright holder; its copyright line reads
`Copyright (c) 2024` with no name after the year. It is reproduced here exactly
as published rather than completed with a guess.

```
MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
