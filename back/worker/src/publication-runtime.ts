import { runWebPublicationCycle } from "../../src/server/web-publications";
import { runPublicationRulesCycle } from "../../src/server/publication-rules";

export function startPublicationWorker() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function cycle() {
    try { await runPublicationRulesCycle(); await runWebPublicationCycle(); }
    catch { console.error("publication worker cycle failed"); }
    finally { if (!stopped) timer = setTimeout(() => void cycle(), 5000); }
  }
  void cycle();
  return { stop() { stopped = true; if (timer) clearTimeout(timer); } };
}
