import { Worker } from "node:worker_threads";
import { Bench } from "tinybench";

type MethodKind = "method" | "arrow";

type Stats = {
  samples: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number;
  standardError: number;
  relativeStandardDeviation: number;
};

type LoadStats = {
  label: string;
  compile: Stats;
  instantiate: Stats;
  total: Stats;
};

const DEFAULT_OBJECT_COUNT = 500;
const DEFAULT_LOAD_ITERATIONS = 200;
const DEFAULT_INVOCATION_CYCLES = 200;

const objectCount = getEnvInt("OBJECT_COUNT", DEFAULT_OBJECT_COUNT);
const loadIterations = getEnvInt("LOAD_ITERATIONS", DEFAULT_LOAD_ITERATIONS);
const invocationCycles = getEnvInt(
  "INVOCATION_CYCLES",
  DEFAULT_INVOCATION_CYCLES
);

const loadWorkerSource = `
const { parentPort } = require("node:worker_threads");
const { performance } = require("node:perf_hooks");

if (!parentPort) {
  throw new Error("Expected parentPort");
}

parentPort.on("message", (payload) => {
  const { source, kind, count } = payload;

  try {
    const compileStart = performance.now();
    const factory = new Function(source);
    const compileDuration = performance.now() - compileStart;

    const instantiateStart = performance.now();
    const objects = factory();
    const instantiateDuration = performance.now() - instantiateStart;

    if (!Array.isArray(objects) || objects.length !== count) {
      throw new Error(
        "Generated " + kind + " factory did not return expected objects",
      );
    }

    parentPort.postMessage({
      type: "result",
      compileDuration,
      instantiateDuration,
    });
  } catch (error) {
    parentPort.postMessage({
      type: "error",
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : undefined,
    });
  }
});
` as const;

type LoadWorkerSuccess = {
  type: "result";
  compileDuration: number;
  instantiateDuration: number;
};

type LoadWorkerFailure = {
  type: "error";
  message: string;
  stack?: string;
};

type LoadWorkerResponse = LoadWorkerSuccess | LoadWorkerFailure;

async function main() {
  console.log("=== Object definition load benchmark ===");
  console.log(
    `Objects per generated module: ${objectCount}, samples per variant: ${loadIterations}`
  );

  const loadResults = await Promise.all([
    measureLoad("method", objectCount, loadIterations),
    measureLoad("arrow", objectCount, loadIterations),
  ]);

  for (const result of loadResults) {
    printLoadStats(result);
  }

  console.log("\n=== Invocation benchmark (tinybench) ===");
  console.log(
    `Objects: ${objectCount}, invocation cycles per sample: ${invocationCycles}`
  );

  const invocationResults = await runInvocationBench(
    objectCount,
    invocationCycles
  );

  console.table(invocationResults);
}

async function measureLoad(
  kind: MethodKind,
  count: number,
  iterations: number
): Promise<LoadStats> {
  const compileDurations: number[] = [];
  const instantiateDurations: number[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const source = buildModuleSource(kind, count, iteration);
    const { compileDuration, instantiateDuration } = await executeLoadWorker(
      kind,
      count,
      source,
      iteration
    );

    compileDurations.push(compileDuration);
    instantiateDurations.push(instantiateDuration);
  }

  const compile = computeStats(compileDurations);
  const instantiate = computeStats(instantiateDurations);
  const totalDurations = compileDurations.map(
    (value, index) => value + instantiateDurations[index]!
  );
  const total = computeStats(totalDurations);

  return {
    label: kind === "method" ? "method shorthand" : "arrow property",
    compile,
    instantiate,
    total,
  };
}

function executeLoadWorker(
  kind: MethodKind,
  count: number,
  source: string,
  iteration: number
): Promise<LoadWorkerSuccess> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(loadWorkerSource, { eval: true });

    const handleError = (error: Error) => {
      void worker.terminate();
      reject(error);
    };

    worker.once("error", handleError);
    worker.once("message", (message: LoadWorkerResponse) => {
      void worker.terminate();
      if (message.type === "error") {
        reject(
          new Error(
            `Load worker error [${kind} iteration ${iteration}]: ${
              message.message
            }${message.stack ? `\n${message.stack}` : ""}`
          )
        );
        return;
      }

      resolve(message);
    });

    worker.postMessage({ source, kind, count });
  });
}

function runInvocationBench(count: number, cycles: number) {
  const methodObjects = createMethodObjects(count);
  const arrowObjects = createArrowObjects(count);

  const expectedChecksum = computeExpectedChecksum(methodObjects, cycles);

  const bench = new Bench({
    iterations: 0,
    time: 1_000,
    warmupIterations: 5,
  });

  bench
    .add("method shorthand", () => {
      const checksum = invokeObjects(methodObjects, cycles);
      if (checksum !== expectedChecksum) {
        throw new Error("Unexpected checksum for method shorthand run");
      }
    })
    .add("arrow property", () => {
      const checksum = invokeObjects(arrowObjects, cycles);
      if (checksum !== expectedChecksum) {
        throw new Error("Unexpected checksum for arrow property run");
      }
    });

  return bench.run().then(() => bench.table());
}

function createMethodObjects(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    value: index,
    foo() {
      return this.value;
    },
  }));
}

function createArrowObjects(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const value = index;
    return {
      value,
      foo: () => value,
    };
  });
}

function computeExpectedChecksum(
  objects: Array<{ value: number }>,
  cycles: number
) {
  const baseSum = objects.reduce(
    (accumulator, { value }) => accumulator + value,
    0
  );
  return baseSum * cycles;
}

function invokeObjects(objects: Array<{ foo: () => number }>, cycles: number) {
  let checksum = 0;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (let index = 0; index < objects.length; index += 1) {
      checksum += objects[index]!.foo();
    }
  }
  return checksum;
}

function buildModuleSource(
  kind: MethodKind,
  count: number,
  iteration: number
): string {
  const entries = Array.from({ length: count }, (_, index) => {
    const header = `  { value: ${index},`;
    if (kind === "method") {
      return `${header} foo() { return this.value; } }`;
    }
    return `${header} foo: () => ${index} }`;
  }).join(",\n");

  return `"use strict";\n// iteration ${iteration}\nconst objects = [\n${entries}\n];\nreturn objects;`;
}

function computeStats(samples: number[]): Stats {
  if (samples.length === 0) {
    throw new Error("Cannot compute stats for empty samples");
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((accumulator, value) => accumulator + value, 0);
  const mean = sum / samples.length;
  const median = sorted[Math.floor(samples.length / 2)] as number;
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const variance =
    samples.reduce((accumulator, value) => {
      const delta = value - mean;
      return accumulator + delta * delta;
    }, 0) / samples.length;
  const standardDeviation = Math.sqrt(variance);
  const standardError = standardDeviation / Math.sqrt(samples.length);
  const relativeStandardDeviation = standardDeviation / mean;

  return {
    samples: samples.length,
    mean,
    median,
    min,
    max,
    standardDeviation,
    standardError,
    relativeStandardDeviation,
  };
}

function printLoadStats(result: LoadStats) {
  console.log(`\n${result.label}`);
  console.log(formatLoadStats("compile (parse)", result.compile));
  console.log(formatLoadStats("instantiate", result.instantiate));
  console.log(formatLoadStats("total", result.total));
}

function formatLoadStats(label: string, stats: Stats) {
  return `${label}: mean=${formatMs(stats.mean)} ms, median=${formatMs(
    stats.median
  )} ms, min=${formatMs(stats.min)} ms, max=${formatMs(
    stats.max
  )} ms, sd=${formatMs(stats.standardDeviation)} ms, se=${formatMs(
    stats.standardError
  )} ms (n=${stats.samples})`;
}

function formatMs(value: number) {
  return value.toFixed(4);
}

function getEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }
  return parsed;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
