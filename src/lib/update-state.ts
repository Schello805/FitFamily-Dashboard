export const UPDATE_JOB_KEY = "fitfamily_pending_update";
export const UPDATE_RESULT_KEY = "fitfamily_last_update_status";
export const UPDATE_TIMEOUT = 15 * 60_000;

export function matchesUpdate(
  current: { version: string; commit: string; fullCommit?: string },
  target: { targetVersion?: string; targetCommit?: string }
): boolean {
  const revision = current.fullCommit || current.commit;
  const expected = target.targetCommit;
  return current.version === target.targetVersion && !!expected &&
    /^[a-f0-9]{7,40}$/.test(expected) && /^[a-f0-9]{7,40}$/.test(revision) &&
    (revision.startsWith(expected) || expected.startsWith(revision));
}

export function parseUpdateJob(raw: string | null): { jobId: string; startedAt: number } | null {
  try {
    const job = JSON.parse(raw || "null");
    return job && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(job.jobId) &&
      Number.isFinite(job.startedAt) && job.startedAt > 0 && job.startedAt <= Date.now()
      ? { jobId: job.jobId, startedAt: job.startedAt } : null;
  } catch { return null; }
}
