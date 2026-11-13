// A job_run row around one run of a nightly job: running -> ok / failed / skipped, with a summary of
// counts and ids only.
import { job_run } from "@Database/Table/Oxxy/job_run";

export type JobKind = "crm_reconciliation" | "data_retention";

export interface JobOutcome {
  status: "ok" | "skipped";
  summary: Record<string, unknown>;
}

export async function runJob(
  kind: JobKind,
  triggeredBy: string | null,
  work: () => Promise<JobOutcome>,
): Promise<job_run> {
  const row = await job_run.save(
    job_run.create({ kind, job_status: "running", started_at: new Date(), triggered_by_id: triggeredBy } as any),
  );
  try {
    const out = await work();
    row.job_status = out.status;
    row.summary = out.summary;
  } catch (e) {
    row.job_status = "failed";
    row.summary = { error: String((e as Error).message ?? e).slice(0, 300) };
  }
  row.finished_at = new Date();
  return await row.save();
}
