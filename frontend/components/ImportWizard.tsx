import { useState } from "react";
import * as api from "@/lib/tauri";
import type { ProjectScanResult } from "@/lib/tauri";
import { useToast } from "@/components/Toast";

interface Props {
  onClose: () => void;
  onImported: () => void;
}

type Step = "path" | "results" | "done";

interface ScanLine {
  label: string;
  count: number;
  present: boolean;
}

function buildScanLines(result: ProjectScanResult): ScanLine[] {
  const lines: ScanLine[] = [];
  lines.push({
    label: `CLAUDE.md file${result.claudeMdCount !== 1 ? "s" : ""}`,
    count: result.claudeMdCount,
    present: result.hasClaudeMd,
  });
  lines.push({
    label: `Agent${result.agentCount !== 1 ? "s" : ""}`,
    count: result.agentCount,
    present: result.agentCount > 0,
  });
  lines.push({
    label: `Skill${result.skillCount !== 1 ? "s" : ""}`,
    count: result.skillCount,
    present: result.skillCount > 0,
  });
  lines.push({
    label: `Hook${result.hookCount !== 1 ? "s" : ""}`,
    count: result.hookCount,
    present: result.hookCount > 0,
  });
  lines.push({
    label: `MCP server${result.mcpServerCount !== 1 ? "s" : ""}`,
    count: result.mcpServerCount,
    present: result.mcpServerCount > 0,
  });
  lines.push({
    label: "Settings",
    count: result.hasSettings ? 1 : 0,
    present: result.hasSettings,
  });
  lines.push({
    label: `Memory store${result.memoryStoreCount !== 1 ? "s" : ""}`,
    count: result.memoryStoreCount,
    present: result.hasMemory,
  });
  return lines;
}

export function ImportWizard({ onClose, onImported }: Props) {
  const toast = useToast();
  const [step, setStep] = useState<Step>("path");
  const [projectPath, setProjectPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ProjectScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const handleScan = async () => {
    const trimmed = projectPath.trim();
    if (!trimmed) return;

    setScanning(true);
    setScanError(null);
    try {
      const result = await api.scanProjectConfig(trimmed);
      setScanResult(result);
      setStep("results");
    } catch (e) {
      setScanError(String(e));
    } finally {
      setScanning(false);
    }
  };

  const handleRegister = async () => {
    const trimmed = projectPath.trim();
    if (!trimmed) return;

    setRegistering(true);
    try {
      await api.addRepo(trimmed);
      toast.success(`Project registered: ${trimmed}`);
      setStep("done");
      onImported();
    } catch (e) {
      toast.error(`Failed to register project: ${e}`);
    } finally {
      setRegistering(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && projectPath.trim() && !scanning) {
      handleScan();
    }
  };

  const hasAnyConfig = scanResult
    ? scanResult.hasClaudeMd ||
      scanResult.agentCount > 0 ||
      scanResult.skillCount > 0 ||
      scanResult.hookCount > 0 ||
      scanResult.mcpServerCount > 0 ||
      scanResult.hasSettings ||
      scanResult.hasMemory
    : false;

  return (
    <div className="import-wizard-overlay" onClick={onClose}>
      <div className="import-wizard" onClick={(e) => e.stopPropagation()}>
        {step === "path" && (
          <>
            <h3>Import from Existing Project</h3>
            <p className="text-muted" style={{ marginBottom: 16 }}>
              Enter the path to a project that has existing Claude Code
              configuration. We will scan for agents, hooks, skills, MCP
              servers, and memory stores.
            </p>
            <div className="form-group">
              <label htmlFor="import-project-path">Project Path</label>
              <input
                id="import-project-path"
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="/path/to/your/project"
                autoFocus
              />
            </div>
            {scanError && (
              <p className="text-danger" style={{ marginBottom: 12 }}>
                {scanError}
              </p>
            )}
            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={handleScan}
                disabled={scanning || !projectPath.trim()}
              >
                {scanning ? "Scanning..." : "Scan"}
              </button>
              <button className="btn" onClick={onClose} disabled={scanning}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === "results" && scanResult && (
          <>
            <h3>Scan Results</h3>
            <p className="text-muted" style={{ marginBottom: 8 }}>
              The project at <strong>{projectPath}</strong> has these Claude
              Code configurations:
            </p>

            <div className="scan-results">
              {buildScanLines(scanResult).map((line) => (
                <div className="scan-result-item" key={line.label}>
                  <span className="scan-result-check">
                    {line.present ? "\u2713" : "\u2014"}
                  </span>
                  <span className="scan-result-label">{line.label}</span>
                  {line.present && (
                    <span className="scan-result-count">{line.count}</span>
                  )}
                </div>
              ))}
            </div>

            {!hasAnyConfig && (
              <p className="text-muted" style={{ marginBottom: 12 }}>
                No Claude Code configuration was found in this directory.
                You can still register it as a project.
              </p>
            )}

            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={handleRegister}
                disabled={registering}
              >
                {registering ? "Registering..." : "Register Project"}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setStep("path");
                  setScanResult(null);
                }}
                disabled={registering}
              >
                Back
              </button>
              <button className="btn" onClick={onClose} disabled={registering}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <h3>Project Registered</h3>
            <p className="text-muted" style={{ marginBottom: 16 }}>
              The project at <strong>{projectPath}</strong> has been added to
              your repo registry. You can now manage its Claude Code
              configuration from the sidebar.
            </p>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
