import { Input } from '@/components/ui/input';
import { MapPin } from 'lucide-react';

interface PostcodeAutocompleteProps {
  value: string;
  onChange: (value: string, fullAddress?: string) => void;
  placeholder?: string;
  className?: string;
  'data-testid'?: string;
}

export function PostcodeAutocomplete({
  value,
  onChange,
  placeholder = "Enter postcode",
  className = "",
  'data-testid': testId,
}: PostcodeAutocompleteProps) {
  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder={placeholder}
        className={`pl-10 ${className}`}
        data-testid={testId}
      />
    </div>
  );
}
