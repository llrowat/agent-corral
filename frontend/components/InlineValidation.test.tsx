import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  validateAgentId,
  validateSkillId,
  validateServerId,
  validateRequired,
  FieldError,
} from "./InlineValidation";

describe("validateAgentId", () => {
  it("returns null for a valid slug", () => {
    expect(validateAgentId("my-agent")).toBeNull();
    expect(validateAgentId("code-reviewer")).toBeNull();
    expect(validateAgentId("test123")).toBeNull();
  });

  it("returns error for empty string", () => {
    const result = validateAgentId("");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("required");
  });

  it("returns error for whitespace-only string", () => {
    const result = validateAgentId("   ");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("required");
  });

  it("returns error with auto-fix for uppercase input", () => {
    const result = validateAgentId("My Agent");
    expect(result).not.toBeNull();
    expect(result!.autoFix).toBeDefined();
    expect(result!.autoFix!.value).toBe("my-agent");
  });

  it("returns error with auto-fix for underscores", () => {
    const result = validateAgentId("my_agent");
    expect(result).not.toBeNull();
    expect(result!.autoFix).toBeDefined();
    expect(result!.autoFix!.value).toBe("my-agent");
  });

  it("returns error with auto-fix for special chars", () => {
    const result = validateAgentId("code review!");
    expect(result).not.toBeNull();
    expect(result!.autoFix!.value).toBe("code-review");
  });
});

describe("validateSkillId", () => {
  it("returns null for valid skill ID", () => {
    expect(validateSkillId("generate-tests")).toBeNull();
  });

  it("returns error for empty", () => {
    const result = validateSkillId("");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("required");
  });

  it("returns error with auto-fix for invalid ID", () => {
    const result = validateSkillId("Generate Tests");
    expect(result).not.toBeNull();
    expect(result!.autoFix!.value).toBe("generate-tests");
  });
});

describe("validateServerId", () => {
  it("returns null for valid server IDs", () => {
    expect(validateServerId("my-server")).toBeNull();
    expect(validateServerId("server_1")).toBeNull();
    expect(validateServerId("MyServer")).toBeNull();
  });

  it("returns error for empty", () => {
    const result = validateServerId("");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("required");
  });

  it("returns error for spaces", () => {
    const result = validateServerId("my server");
    expect(result).not.toBeNull();
    expect(result!.autoFix).toBeDefined();
  });
});

describe("validateRequired", () => {
  it("returns null for non-empty value", () => {
    expect(validateRequired("name", "test", "Name")).toBeNull();
  });

  it("returns error for empty value", () => {
    const result = validateRequired("name", "", "Name");
    expect(result).not.toBeNull();
    expect(result!.message).toBe("Name is required.");
  });

  it("returns error for whitespace-only value", () => {
    const result = validateRequired("name", "   ", "Name");
    expect(result).not.toBeNull();
  });
});

describe("FieldError component", () => {
  it("renders nothing when error is null", () => {
    const { container } = render(<FieldError error={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders error message", () => {
    const error = { field: "test", message: "This is an error" };
    render(<FieldError error={error} />);
    expect(screen.getByText("This is an error")).toBeInTheDocument();
  });

  it("renders auto-fix button when available", () => {
    const error = {
      field: "test",
      message: "Invalid",
      autoFix: { label: 'Use "fixed"', value: "fixed" },
    };
    const onAutoFix = vi.fn();
    render(<FieldError error={error} onAutoFix={onAutoFix} />);
    const fixButton = screen.getByText('Use "fixed"');
    expect(fixButton).toBeInTheDocument();
  });

  it("calls onAutoFix when fix button is clicked", () => {
    const error = {
      field: "test",
      message: "Invalid",
      autoFix: { label: "Fix it", value: "fixed-value" },
    };
    const onAutoFix = vi.fn();
    render(<FieldError error={error} onAutoFix={onAutoFix} />);
    fireEvent.click(screen.getByText("Fix it"));
    expect(onAutoFix).toHaveBeenCalledWith("fixed-value");
  });

  it("does not render fix button when onAutoFix is not provided", () => {
    const error = {
      field: "test",
      message: "Invalid",
      autoFix: { label: "Fix it", value: "fixed-value" },
    };
    render(<FieldError error={error} />);
    expect(screen.queryByText("Fix it")).not.toBeInTheDocument();
  });
});
