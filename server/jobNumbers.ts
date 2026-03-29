export const stableJobNumberCache = new Map<string, string>();
export let jobNumberCacheInitialized = false;
const jobNumberPersistQueue = new Set<string>();

export async function persistJobNumber(jobId: string, jobNumber: string): Promise<void> {
  if (jobNumberPersistQueue.has(jobId)) return;
  jobNumberPersistQueue.add(jobId);
  try {
    const { supabaseAdmin } = await import("./supabaseAdmin");
    if (supabaseAdmin) {
      await supabaseAdmin.from('jobs').update({ job_number: jobNumber }).eq('id', jobId);
    }
  } catch (err) {
  } finally {
    jobNumberPersistQueue.delete(jobId);
  }
}

export function ensureJobNumber(job: any): any {
  if (!job) return job;
  if (job.jobNumber) {
    stableJobNumberCache.set(String(job.id), job.jobNumber);
    return job;
  }
  const cached = stableJobNumberCache.get(String(job.id));
  if (cached) return { ...job, jobNumber: cached };
  let newJobNumber: string;
  const usedNumbers = new Set(stableJobNumberCache.values());
  do {
    newJobNumber = String(Math.floor(100000 + Math.random() * 900000));
  } while (usedNumbers.has(newJobNumber));
  stableJobNumberCache.set(String(job.id), newJobNumber);
  persistJobNumber(String(job.id), newJobNumber);
  return { ...job, jobNumber: newJobNumber };
}

export function assignStableJobNumbers(jobs: any[]): any[] {
  if (!jobNumberCacheInitialized && jobs.length > 0) {
    const sorted = [...jobs].sort((a, b) => Number(a.id) - Number(b.id));
    const usedNumbers = new Set<string>();
    sorted.forEach((job) => {
      if (job.jobNumber) {
        stableJobNumberCache.set(String(job.id), job.jobNumber);
        usedNumbers.add(job.jobNumber);
      }
    });
    sorted.forEach((job) => {
      if (!job.jobNumber && !stableJobNumberCache.has(String(job.id))) {
        let num: string;
        do {
          num = String(Math.floor(100000 + Math.random() * 900000));
        } while (usedNumbers.has(num));
        usedNumbers.add(num);
        stableJobNumberCache.set(String(job.id), num);
        persistJobNumber(String(job.id), num);
      }
    });
    jobNumberCacheInitialized = true;
  }

  return jobs.map(job => {
    if (job.jobNumber) {
      stableJobNumberCache.set(String(job.id), job.jobNumber);
      return job;
    }
    const cached = stableJobNumberCache.get(String(job.id));
    if (cached) return { ...job, jobNumber: cached };
    let newJobNumber: string;
    const usedNumbers = new Set(stableJobNumberCache.values());
    do {
      newJobNumber = String(Math.floor(100000 + Math.random() * 900000));
    } while (usedNumbers.has(newJobNumber));
    stableJobNumberCache.set(String(job.id), newJobNumber);
    persistJobNumber(String(job.id), newJobNumber);
    return { ...job, jobNumber: newJobNumber };
  });
}

export async function generateJobNumber(): Promise<string> {
  const usedNumbers = new Set<string>();
  for (const num of stableJobNumberCache.values()) {
    usedNumbers.add(num);
  }

  let jobNumber: string;
  let attempts = 0;
  do {
    const num = Math.floor(100000 + Math.random() * 900000);
    jobNumber = String(num);
    attempts++;
    if (attempts > 100) break;
  } while (usedNumbers.has(jobNumber));

  return jobNumber;
}
