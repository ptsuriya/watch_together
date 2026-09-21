// A hidden extension page inside the YouTube embed. It exists only because a worker has to come from the extension's
// own origin to load the model and the GPU runtime; the content script cannot start one on YouTube's page.
let started = false;

window.addEventListener("message", (event) => {
  if (started || event.source !== window.parent) return;
  const data = event.data;
  if (!data || data.source !== "kuma-karaoke-key" || data.type !== "start" || event.ports.length !== 2) return;
  started = true;
  const worker = new Worker("worker.js", { type: "module" });
  worker.addEventListener("error", (error) => {
    event.ports[1].postMessage({ type: "failed", reason: "worker", detail: String(error.message || "worker error") });
  });
  worker.postMessage({ type: "ports", amount: data.amount }, [...event.ports]);
});
