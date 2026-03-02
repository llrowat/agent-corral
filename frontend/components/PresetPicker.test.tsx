import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PresetPicker } from "./PresetPicker";

const mockPresets = [
  {
    id: "preset-a",
    label: "Preset A",
    description: "Description for A",
    data: "a",
  },
  {
    id: "preset-b",
    label: "Preset B",
    description: "Description for B",
    data: "b",
  },
  {
    id: "preset-c",
    label: "Preset C",
    description: "Description for C",
    data: "c",
  },
];

describe("PresetPicker", () => {
  it("renders title", () => {
    render(
      <PresetPicker
        title="Pick a Template"
        presets={mockPresets}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Pick a Template")).toBeInTheDocument();
  });

  it("renders all presets with labels and descriptions", () => {
    render(
      <PresetPicker
        title="Pick"
        presets={mockPresets}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Preset A")).toBeInTheDocument();
    expect(screen.getByText("Description for A")).toBeInTheDocument();
    expect(screen.getByText("Preset B")).toBeInTheDocument();
    expect(screen.getByText("Preset C")).toBeInTheDocument();
  });

  it("calls onSelect and onClose when a preset is clicked", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <PresetPicker
        title="Pick"
        presets={mockPresets}
        onSelect={onSelect}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText("Preset B"));
    expect(onSelect).toHaveBeenCalledWith(mockPresets[1]);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <PresetPicker
        title="Pick"
        presets={mockPresets}
        onSelect={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when overlay is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <PresetPicker
        title="Pick"
        presets={mockPresets}
        onSelect={vi.fn()}
        onClose={onClose}
      />
    );
    const overlay = container.querySelector(".modal-overlay")!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when clicking inside modal content", () => {
    const onClose = vi.fn();
    render(
      <PresetPicker
        title="Pick"
        presets={mockPresets}
        onSelect={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText("Pick a preset to start with. You can customize it after."));
    expect(onClose).not.toHaveBeenCalled();
  });
});
