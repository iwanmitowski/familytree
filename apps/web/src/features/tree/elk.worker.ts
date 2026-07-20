/// <reference lib="webworker" />
// Runs ELK layout off the main thread so large trees don't freeze the tab
// (idea.md §14). Bundled by Next via `new Worker(new URL('./elk.worker.ts', ...))`.
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

self.onmessage = async (event: MessageEvent) => {
  try {
    const laid = await elk.layout(event.data);
    self.postMessage({ ok: true, graph: laid });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : 'ELK layout failed' });
  }
};
