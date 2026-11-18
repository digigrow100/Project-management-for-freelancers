const queue: Array<() => Promise<void>> = [];
let active = false;

export function enqueue(job: () => Promise<void>) {
  if (queue.length >= 20) throw new Error("busy");
  queue.push(job);
  void drain();
}

async function drain() {
  if (active) return;
  active = true;
  while (queue.length) {
    const job = queue.shift();
    if (!job) break;
    try { await job(); } catch { /* the job records its own outcome */ }
  }
  active = false;
}
