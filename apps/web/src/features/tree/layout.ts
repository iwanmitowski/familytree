import type { Node } from '@xyflow/react';
import type { PersonNodeData } from './types';
import { applyElkPositions, toElkGraph, type ElkGraph, type FlowGraph } from './projection-to-flow';

const WORKER_TIMEOUT_MS = 15_000;
// Turbopack dev rewrites the Worker global and breaks module-worker construction
// (`_Worker is not a constructor`), so the worker path can hang. Main-thread ELK
// is fine for the capped graph sizes here. TODO: re-enable once worker bundling is fixed.
const WORKER_ENABLED = false;

/** Runs ELK in a Web Worker, falling back to the main thread on any failure. */
async function runElk(graph: ElkGraph): Promise<ElkGraph> {
  if (WORKER_ENABLED && typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    try {
      return await layoutInWorker(graph);
    } catch {
      // fall through to the main-thread layout
    }
  }
  const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
  return (await new ELK().layout(graph as never)) as unknown as ElkGraph;
}

function layoutInWorker(graph: ElkGraph): Promise<ElkGraph> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      // Construction can throw synchronously (e.g. Turbopack dev rewrites the
      // Worker global). Catch it here so runElk() can fall back cleanly.
      worker = new Worker(new URL('./elk.worker.ts', import.meta.url));
    } catch (err) {
      reject(err instanceof Error ? err : new Error('ELK worker unavailable'));
      return;
    }
    const done = (fn: () => void) => {
      clearTimeout(timer);
      worker.terminate();
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('ELK worker timeout'))), WORKER_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as { ok: boolean; graph?: ElkGraph; error?: string };
      done(() => (data.ok && data.graph ? resolve(data.graph) : reject(new Error(data.error ?? 'ELK failed'))));
    };
    worker.onerror = () => done(() => reject(new Error('ELK worker error')));
    worker.postMessage(graph);
  });
}

/** Lays out a flow graph and returns positioned nodes. */
export async function layoutFlow(graph: FlowGraph): Promise<Node<PersonNodeData>[]> {
  if (graph.nodes.length === 0) return [];
  const laid = await runElk(toElkGraph(graph));
  return applyElkPositions(graph, laid);
}
