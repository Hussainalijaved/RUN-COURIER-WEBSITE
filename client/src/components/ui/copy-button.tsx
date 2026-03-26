import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface CopyButtonProps {
  value: string;
  className?: string;
  'data-testid'?: string;
}

export function CopyButton({ value, className = '', 'data-testid': testId }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          data-testid={testId}
          className={`inline-flex items-center justify-center rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`}
          aria-label="Copy to clipboard"
        >
          {copied
            ? <Check className="h-3 w-3 text-green-500" />
            : <Copy className="h-3 w-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {copied ? 'Copied!' : 'Copy'}
      </TooltipContent>
    </Tooltip>
  );
}
