import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import { ImportWizard } from "./ImportWizard";

const mockScanProjectConfig = vi.fn();
const mockAddRepo = vi.fn();

vi.mock("@/lib/tauri", () => ({
  scanProjectConfig: (...args: unknown[]) => mockScanProjectConfig(...args),
  addRepo: (...args: unknown[]) => mockAddRepo(...args),
}));

describe("ImportWizard", () => {
  const onClose = vi.fn();
  const onImported = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderWizard() {
    return renderWithProviders(
      <ImportWizard onClose={onClose} onImported={onImported} />
    );
  }

  it("renders path input step initially", () => {
    renderWizard();
    expect(screen.getByText("Import from Existing Project")).toBeInTheDocument();
    expect(screen.getByLabelText("Project Path")).toBeInTheDocument();
    expect(screen.getByText("Scan")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("disables scan button when path is empty", () => {
    renderWizard();
    const scanBtn = screen.getByText("Scan");
    expect(scanBtn).toBeDisabled();
  });

  it("enables scan button when path is entered", () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText("Project Path"), {
      target: { value: "/some/path" },
    });
    expect(screen.getByText("Scan")).not.toBeDisabled();
  });

  it("calls onClose when cancel is clicked", () => {
    renderWizard();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows scan results after successful scan", async () => {
    mockScanProjectConfig.mockResolvedValue({
      hasClaudeMd: true,
      claudeMdCount: 2,
      agentCount: 3,
      skillCount: 1,
      hookCount: 5,
      mcpServerCount: 2,
      hasSettings: true,
      hasMemory: true,
      memoryStoreCount: 1,
    });

    renderWizard();
    fireEvent.change(screen.getByLabelText("Project Path"), {
      target: { value: "/my/project" },
    });
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(screen.getByText("Scan Results")).toBeInTheDocument();
    });

    expect(mockScanProjectConfig).toHaveBeenCalledWith("/my/project");
    // Verify scan results are displayed
    expect(screen.getByText("CLAUDE.md files")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Skill")).toBeInTheDocument();
    expect(screen.getByText("Hooks")).toBeInTheDocument();
    expect(screen.getByText("MCP servers")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Memory store")).toBeInTheDocument();
    // Verify counts are rendered in scan-result-count elements
    const countElements = document.querySelectorAll(".scan-result-count");
    const counts = Array.from(countElements).map((el) => el.textContent);
    expect(counts).toContain("2"); // claude_md_count
    expect(counts).toContain("3"); // agent_count
    expect(counts).toContain("5"); // hook_count
    expect(screen.getByText("Register Project")).toBeInTheDocument();
  });

  it("shows error when scan fails", async () => {
    mockScanProjectConfig.mockRejectedValue(new Error("Directory not found"));

    renderWizard();
    fireEvent.change(screen.getByLabelText("Project Path"), {
      target: { value: "/bad/path" },
    });
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(screen.getByText(/Directory not found/)).toBeInTheDocument();
    });
  });

  it("registers project and shows done step", async () => {
    mockScanProjectConfig.mockResolvedValue({
      hasClaudeMd: true,
      claudeMdCount: 1,
      agentCount: 0,
      skillCount: 0,
      hookCount: 0,
      mcpServerCount: 0,
      hasSettings: false,
      hasMemory: false,
      memoryStoreCount: 0,
    });
    mockAddRepo.mockResolvedValue({
      repo_id: "1",
      name: "project",
      path: "/my/project",
      pinned: false,
      last_opened_at: null,
    });

    renderWizard();
    fireEvent.change(screen.getByLabelText("Project Path"), {
      target: { value: "/my/project" },
    });
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(screen.getByText("Register Project")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Register Project"));

    await waitFor(() => {
      expect(screen.getByText("Project Registered")).toBeInTheDocument();
    });

    expect(mockAddRepo).toHaveBeenCalledWith("/my/project");
    expect(onImported).toHaveBeenCalled();
  });

  it("can go back from results to path step", async () => {
    mockScanProjectConfig.mockResolvedValue({
      hasClaudeMd: false,
      claudeMdCount: 0,
      agentCount: 0,
      skillCount: 0,
      hookCount: 0,
      mcpServerCount: 0,
      hasSettings: false,
      hasMemory: false,
      memoryStoreCount: 0,
    });

    renderWizard();
    fireEvent.change(screen.getByLabelText("Project Path"), {
      target: { value: "/empty/path" },
    });
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(screen.getByText("Scan Results")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Back"));

    expect(screen.getByText("Import from Existing Project")).toBeInTheDocument();
    expect(screen.getByLabelText("Project Path")).toBeInTheDocument();
  });

  it("shows message when no config is found", async () => {
    mockScanProjectConfig.mockResolvedValue({
      hasClaudeMd: false,
      claudeMdCount: 0,
      agentCount: 0,
      skillCount: 0,
      hookCount: 0,
      mcpServerCount: 0,
      hasSettings: false,
      hasMemory: false,
      memoryStoreCount: 0,
    });

    renderWizard();
    fireEvent.change(screen.getByLabelText("Project Path"), {
      target: { value: "/empty" },
    });
    fireEvent.click(screen.getByText("Scan"));

    await waitFor(() => {
      expect(
        screen.getByText(/No Claude Code configuration was found/)
      ).toBeInTheDocument();
    });
  });

  it("closes the wizard when clicking the overlay", () => {
    renderWizard();
    const overlay = screen.getByText("Import from Existing Project").closest(
      ".import-wizard"
    )!.parentElement!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the wizard", () => {
    renderWizard();
    const wizardContent = screen.getByText("Import from Existing Project").closest(
      ".import-wizard"
    )!;
    fireEvent.click(wizardContent);
    expect(onClose).not.toHaveBeenCalled();
  });
});
