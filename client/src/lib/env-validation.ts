import { isBrowser } from './browser';

type EnvValidationResult = {
  isValid: boolean;
  missingVars: string[];
  warnings: string[];
};

const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const;

const OPTIONAL_ENV_VARS = [
  'VITE_GOOGLE_MAPS_API_KEY',
] as const;

let validationRun = false;

export function validateEnvironment(): EnvValidationResult {
  const missingVars: string[] = [];
  const warnings: string[] = [];

  if (!isBrowser) {
    return { isValid: true, missingVars: [], warnings: [] };
  }

  for (const envVar of REQUIRED_ENV_VARS) {
    const value = import.meta.env[envVar];
    if (!value || value.includes('placeholder')) {
      missingVars.push(envVar);
    }
  }

  for (const envVar of OPTIONAL_ENV_VARS) {
    const value = import.meta.env[envVar];
    if (!value) {
      warnings.push(`${envVar} is not configured. Related features will be disabled.`);
    }
  }

  return {
    isValid: missingVars.length === 0,
    missingVars,
    warnings,
  };
}

export function logEnvironmentStatus(): void {
  if (!isBrowser || validationRun) {
    return;
  }
  validationRun = true;

  const result = validateEnvironment();

  if (!result.isValid) {
    console.warn(
      `%c[WARNING] Missing environment variables:\n${result.missingVars.map(v => `  - ${v}`).join('\n')}\n\nSome features may be limited.`,
      'color: #ffaa00; font-weight: bold;'
    );
  }

  if (result.warnings.length > 0) {
    console.warn(
      `%c[INFO] Environment notes:\n${result.warnings.map(w => `  - ${w}`).join('\n')}`,
      'color: #6699cc;'
    );
  }

  if (result.isValid && result.warnings.length === 0) {
    console.log('%c[OK] Environment validated successfully', 'color: #22c55e;');
  }
}

export function isGoogleMapsConfigured(): boolean {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return !!(apiKey && apiKey.length > 10);
}

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return !!(url && key && !url.includes('placeholder'));
}
