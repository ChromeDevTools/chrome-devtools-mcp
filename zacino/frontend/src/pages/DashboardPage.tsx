import { useState } from "react";
import { Job } from "../api";

const statusOptions: Job["status"][] = ["queued", "running", "completed", "failed"];

type DashboardPageProps = {
  jobs: Job[];
  onCreateJob: (name: string, description: string) => void;
  onUpdateJob: (jobId: string, status: Job["status"], score: number) => void;
  onDeleteJob: (jobId: string) => void;
  onLogout: () => void;
};

function DashboardPage({ jobs, onCreateJob, onUpdateJob, onDeleteJob, onLogout }: DashboardPageProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const canSubmit = name.trim().length >= 3;

  return (
    <section>
      <div className="card">
        <h2>Meta Core Feature: Optimization Command Queue</h2>
        <p>
          Schedule, monitor, and adjust high-performance optimization workflows for enterprise
          delivery.
        </p>
        <div className="form-grid">
          <label>
            Job name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </label>
          <button
            onClick={() => {
              onCreateJob(name, description);
              setName("");
              setDescription("");
            }}
            disabled={!canSubmit}
          >
            Queue optimization job
          </button>
        </div>
      </div>

      <div className="card">
        <div className="job-row">
          <h3>Active jobs</h3>
          <button className="secondary" onClick={onLogout}>
            Log out
          </button>
        </div>
        {jobs.length === 0 ? (
          <p>No jobs yet. Start by queuing an optimization request.</p>
        ) : (
          <div className="job-list">
            {jobs.map((job) => (
              <div key={job.id} className="card">
                <div className="job-row">
                  <div>
                    <h4>{job.name}</h4>
                    <p>{job.description || "No description provided."}</p>
                  </div>
                  <div className="job-meta">
                    <span className="badge">{job.status}</span>
                    <span className="badge">Score: {job.score.toFixed(1)}</span>
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    Status
                    <select
                      value={job.status}
                      onChange={(event) => onUpdateJob(job.id, event.target.value as Job["status"], job.score)}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Score (0-100)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={job.score}
                      onChange={(event) =>
                        onUpdateJob(job.id, job.status, Number(event.target.value))
                      }
                    />
                  </label>
                  <button className="secondary" onClick={() => onDeleteJob(job.id)}>
                    Remove job
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default DashboardPage;
