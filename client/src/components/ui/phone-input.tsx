import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PhoneInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
  name?: string;
  onBlur?: () => void;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(({ 
  value = "", 
  onChange, 
  placeholder = "7XXX XXX XXX",
  className,
  "data-testid": testId,
  name,
  onBlur
}, ref) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;
    inputValue = inputValue.replace(/[^\d\s]/g, '');
    if (onChange) {
      onChange("+44 " + inputValue);
    }
  };

  const displayValue = value.startsWith("+44") 
    ? value.replace(/^\+44\s*/, '') 
    : value.replace(/^\+/, '');

  return (
    <div className={cn("flex", className)}>
      <div className="flex items-center justify-center px-3 border border-r-0 rounded-l-md bg-muted text-muted-foreground text-sm font-medium min-w-[52px]">
        +44
      </div>
      <Input
        ref={ref}
        type="tel"
        name={name}
        value={displayValue}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        className="rounded-l-none"
        data-testid={testId}
      />
    </div>
  );
});

PhoneInput.displayName = "PhoneInput";
