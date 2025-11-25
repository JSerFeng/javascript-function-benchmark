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
