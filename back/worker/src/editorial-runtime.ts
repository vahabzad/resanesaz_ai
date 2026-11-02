import { runEditorialWorkerCycle } from "../../src/server/editorial-jobs";

export function startEditorialWorker() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function cycle() {
    try { await runEditorialWorkerCycle(); }
    catch { console.error("editorial worker cycle failed"); }
    finally { if (!stopped) timer = setTimeout(() => void cycle(), 5000); }
  }
  void cycle();
  return { stop() { stopped = true; if (timer) clearTimeout(timer); } };
}
