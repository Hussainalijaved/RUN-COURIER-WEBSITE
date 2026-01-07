import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';

interface Prediction {
  description: string;
  placeId: string;
}

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
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipFetchRef = useRef(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchPredictions = useCallback(async (input: string) => {
    if (!input || input.length < 2) {
      setPredictions([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/maps/autocomplete?input=${encodeURIComponent(input)}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.predictions && data.predictions.length > 0) {
          setPredictions(data.predictions.map((p: any) => ({
            description: p.description,
            placeId: p.place_id,
          })));
          setIsOpen(true);
        } else {
          setPredictions([]);
        }
      } else {
        setPredictions([]);
      }
    } catch (error) {
      console.error('Autocomplete error:', error);
      setPredictions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      fetchPredictions(value);
    }, 300);

    return () => clearTimeout(timer);
  }, [value, fetchPredictions]);

  const handleSelect = (prediction: Prediction) => {
    skipFetchRef.current = true;
    const postcodeMatch = prediction.description.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i);
    const postcode = postcodeMatch 
      ? postcodeMatch[0].toUpperCase().replace(/\s+/g, ' ') 
      : prediction.description;
    onChange(postcode, prediction.description);
    setIsOpen(false);
    setPredictions([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onFocus={() => predictions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className={`pl-10 ${className}`}
          data-testid={testId}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {isOpen && predictions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <ul className="max-h-60 overflow-auto py-1">
            {predictions.map((prediction, index) => (
              <li
                key={prediction.placeId || index}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => handleSelect(prediction)}
                data-testid={`prediction-${index}`}
              >
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate">{prediction.description}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
