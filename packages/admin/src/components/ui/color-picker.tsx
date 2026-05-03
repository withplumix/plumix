import { useState } from "react";
import { Input } from "@/components/ui/input.js";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.js";
import { cn } from "@/lib/utils";
import { HexColorPicker } from "react-colorful";

// Hex color picker built around `react-colorful` + a Popover trigger.
// Sits above the meta-box-field renderer so dispatching a color field
// stays a one-line component swap. Pairs the visual picker with a
// hex text input for paste-and-go workflows; the trigger swatch and
// the input share the same controlled value via the parent form.
interface ColorPickerProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly name?: string;
  readonly testId?: string;
  readonly placeholder?: string;
}

export function ColorPicker({
  value,
  onChange,
  disabled = false,
  required = false,
  name,
  testId,
  placeholder = "#000000",
}: ColorPickerProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const safeHex = isHex(value) ? value : "#000000";

  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Open color picker"
            data-testid={testId ? `${testId}-swatch` : undefined}
            className={cn(
              "border-input ring-ring/30 size-9 shrink-0 rounded-md border outline-hidden transition-[box-shadow] hover:ring-2 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
            )}
            style={{ backgroundColor: safeHex }}
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-3"
          data-testid={testId ? `${testId}-popover` : undefined}
        >
          <HexColorPicker color={safeHex} onChange={onChange} />
        </PopoverContent>
      </Popover>
      <Input
        type="text"
        value={value}
        name={name}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={7}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        data-testid={testId ? `${testId}-hex` : undefined}
        className="font-mono"
      />
    </div>
  );
}

function isHex(value: unknown): value is string {
  return (
    typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
  );
}
