import { AlertTriangle, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { AppIcon } from "../AppIcon";
import type { Diagnostic } from "../../core/model";
import { MAX_DISPLAYED_RECENT_PROJECTS, type RecentProjectDirectory } from "../../core/recentProject";
import type { ProjectLoadProgress } from "../../core/projectIO";

interface ProjectDirectoryGateProps {
  diagnostics: Diagnostic[];
  restoring: boolean;
  loading?: ProjectLoadProgress | null;
  recentProjects: RecentProjectDirectory[];
  onOpenDirectory: () => void;
  onOpenRecent: (project: RecentProjectDirectory) => void;
  onRemoveRecent?: (project: RecentProjectDirectory) => void;
}

export function ProjectDirectoryGate({
  diagnostics,
  restoring,
  loading,
  recentProjects,
  onOpenDirectory,
  onOpenRecent,
  onRemoveRecent,
}: ProjectDirectoryGateProps) {
  const isLoading = Boolean(loading);
  const displayedProjects = recentProjects.slice(0, MAX_DISPLAYED_RECENT_PROJECTS);

  return (
    <main className="project-start-screen">
      <section
        className="project-directory-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="directory-gate-title"
      >
        <div className="directory-gate-mark">
          <AppIcon size={72} />
        </div>
        <span className="eyebrow">VELA WATCH FACE EDITOR</span>
        <h1 id="directory-gate-title">
          {restoring ? "正在读取最近项目" : "Vela 表盘编辑器"}
        </h1>
        {restoring ? <p>正在读取最近使用过的项目目录。</p> : null}

        <div className="directory-gate-actions">
          {restoring ? (
            <button className="primary-button directory-gate-button is-wide" disabled>
              <Loader2 size={18} className="directory-progress-spinner" />正在读取
            </button>
          ) : (
            <button
              className="primary-button directory-gate-button is-wide"
              onClick={onOpenDirectory}
              disabled={isLoading}
            >
              <FolderOpen size={18} />打开项目
            </button>
          )}
        </div>

        {loading ? (
          <div className="directory-gate-progress-card" role="status" aria-live="polite">
            <div className="directory-progress-header">
              <div className="directory-progress-label">
                <Loader2 size={16} className="directory-progress-spinner" />
                <span>{loading.message}</span>
              </div>
              {loading.percent !== undefined ? (
                <span className="directory-progress-percent">{loading.percent}%</span>
              ) : null}
            </div>
            <div className="directory-progress-track">
              <div
                className="directory-progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, loading.percent ?? 0))}%` }}
              />
            </div>
            {loading.detail ? (
              <div className="directory-progress-detail" title={loading.detail}>
                {loading.detail}
              </div>
            ) : null}
          </div>
        ) : null}

        {!restoring ? (
          <section className="recent-projects" aria-labelledby="recent-projects-title">
            <h2 id="recent-projects-title">最近的项目</h2>
            {displayedProjects.length ? (
              <div className="recent-project-list">
                {displayedProjects.map((project, index) => (
                  <div className="recent-project-row" key={`${project.projectPath}-${index}`}>
                    <button
                      type="button"
                      className="recent-project-main-btn"
                      onClick={() => onOpenRecent(project)}
                      disabled={isLoading}
                      title={`打开项目: ${project.projectName}&#10;路径: ${project.projectPath}`}
                    >
                      <strong>{project.projectName}</strong>
                      <span>{project.projectPath}</span>
                    </button>
                    {onRemoveRecent ? (
                      <button
                        type="button"
                        className="recent-project-remove-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveRecent(project);
                        }}
                        disabled={isLoading}
                        title="从最近列表中移除"
                        aria-label={`从最近列表中移除 ${project.projectName}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="recent-projects-empty">暂无最近项目</div>
            )}
          </section>
        ) : null}

        {diagnostics.length ? (
          <div className="directory-gate-diagnostics">
            {diagnostics.map((entry) => (
              <div key={entry.id}>
                <AlertTriangle size={15} />
                <span>{entry.message}</span>
                <code>{entry.location}</code>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
