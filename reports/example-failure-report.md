# Example Failure Report

> Produced during fault-injection testing: the backend age band was deliberately changed from `age < 25` to `age < 24`. Only the two age-24 pricing tests fail, and the failure points straight at the defect.

## ❌ PolicyHub API Test Report

| Total | Passed | Failed | Flaky | Skipped | Pass rate | Duration |
|------:|-------:|-------:|------:|--------:|----------:|---------:|
| 31 | 29 | 2 | 0 | 0 | 93.5% | 2.9s |

### Results by suite

| Suite | Tests | Passed | Failed |
|-------|------:|-------:|-------:|
| `quotes/quotes.spec.js` | 31 | 29 | 2 |

### Coverage by tag

| Tag | Tests |
|-----|------:|
| `@pricing` | 15 |
| `@negative` | 10 |
| `@boundary` | 4 |
| `@smoke` | 1 |
| `@db` | 1 |
| `@regression` | 1 |

### Failures

<details><summary>❌ quotes/quotes.spec.js › premium for AUTO, age 24 matches rating rules</summary>

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 3
+ Received  + 3

  Object {
-   "ageFactor": 1.6,
-   "annualPremium": 7000,
+   "ageFactor": 1,
+   "annualPremium": 4375,
    "baseRate": 0.035,
    "currency": "USD",
    "termFactor": 1,
-   "totalPremium": 7000,
+   "totalPremium": 4375,
  }
```
</details>

<details><summary>❌ quotes/quotes.spec.js › premium for HOME, age 24 matches rating rules</summary>

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 3
+ Received  + 3

  Object {
-   "ageFactor": 1.6,
-   "annualPremium": 2400,
+   "ageFactor": 1,
+   "annualPremium": 1500,
    "baseRate": 0.012,
    "currency": "USD",
    "termFactor": 1,
-   "totalPremium": 2400,
+   "totalPremium": 1500,
  }
```
</details>

