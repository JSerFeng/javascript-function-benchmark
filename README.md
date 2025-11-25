# JavaScript Method vs Arrow Function Benchmark

This project measures performance differences between JavaScript object method shorthand definitions `foo() {}` and arrow function properties `foo: () => {}`. It evaluates both definition cost (object creation) and invocation throughput using a large number of iterations to reduce noise.

## Prerequisites

Install dependencies once:

```bash
pnpm install
```

## Run Benchmarks

```bash
pnpm bench
```

The script executes two benchmark suites via `tinybench`:

- **Definition**: repeatedly constructs objects with either method shorthand or arrow functions.
- **Invocation**: reuses large pools of objects to compare call throughput.

Each suite performs warmups followed by 25 measured iterations, printing ops/sec, relative margin of error, sample count, and relative speed difference.

## Result

```
=== Object definition load benchmark ===
Objects per generated module: 500, samples per variant: 200

method shorthand
compile (parse): mean=0.4831 ms, median=0.4733 ms, min=0.4406 ms, max=0.6273 ms, sd=0.0326 ms, se=0.0023 ms (n=200)
instantiate: mean=0.1200 ms, median=0.1192 ms, min=0.1135 ms, max=0.1475 ms, sd=0.0053 ms, se=0.0004 ms (n=200)
total: mean=0.6031 ms, median=0.5941 ms, min=0.5555 ms, max=0.7429 ms, sd=0.0332 ms, se=0.0023 ms (n=200)

arrow property
compile (parse): mean=0.4301 ms, median=0.4260 ms, min=0.3943 ms, max=0.5650 ms, sd=0.0238 ms, se=0.0017 ms (n=200)
instantiate: mean=0.1195 ms, median=0.1191 ms, min=0.1138 ms, max=0.1582 ms, sd=0.0052 ms, se=0.0004 ms (n=200)
total: mean=0.5495 ms, median=0.5463 ms, min=0.5085 ms, max=0.6877 ms, sd=0.0259 ms, se=0.0018 ms (n=200)
```