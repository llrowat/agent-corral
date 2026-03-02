import { suggestSlugFix } from "@/lib/presets";

export interface ValidationError {
  field: string;
  message: string;
  autoFix?: { label: string; value: string };
}

export function validateAgentId(value: string): ValidationError | null {
  if (!value.trim()) {
    return { field: "agentId", message: "Agent ID is required." };
  }
  if (!/^[a-z0-9-]+$/.test(value)) {
    const fix = suggestSlugFix(value);
    return {
      field: "agentId",
      message:
        "Must be lowercase letters, numbers, and hyphens only (e.g., \"my-agent\").",
      autoFix: fix ? { label: `Use "${fix}"`, value: fix } : undefined,
    };
  }
  return null;
}

export function validateSkillId(value: string): ValidationError | null {
  if (!value.trim()) {
    return { field: "skillId", message: "Skill ID is required." };
  }
  if (!/^[a-z0-9-]+$/.test(value)) {
    const fix = suggestSlugFix(value);
    return {
      field: "skillId",
      message:
        "Must be lowercase letters, numbers, and hyphens only (e.g., \"my-skill\").",
      autoFix: fix ? { label: `Use "${fix}"`, value: fix } : undefined,
    };
  }
  return null;
}

export function validateServerId(value: string): ValidationError | null {
  if (!value.trim()) {
    return { field: "serverId", message: "Server ID is required." };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    const fix = suggestSlugFix(value);
    return {
      field: "serverId",
      message:
        "Must be letters, numbers, hyphens, and underscores only (e.g., \"my-server\").",
      autoFix: fix ? { label: `Use "${fix}"`, value: fix } : undefined,
    };
  }
  return null;
}

export function validateRequired(
  field: string,
  value: string,
  label: string
): ValidationError | null {
  if (!value.trim()) {
    return { field, message: `${label} is required.` };
  }
  return null;
}

interface FieldErrorProps {
  error: ValidationError | null;
  onAutoFix?: (value: string) => void;
}

export function FieldError({ error, onAutoFix }: FieldErrorProps) {
  if (!error) return null;

  return (
    <div className="field-error">
      <span className="field-error-message">{error.message}</span>
      {error.autoFix && onAutoFix && (
        <button
          className="field-error-fix"
          onClick={() => onAutoFix(error.autoFix!.value)}
          type="button"
        >
          {error.autoFix.label}
        </button>
      )}
    </div>
  );
}
