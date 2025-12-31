type SafeResult<T> = 
  | { success: true; result: T; timedOut: false }
  | { success: false; result: null; timedOut: boolean };

export async function safeTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<SafeResult<T>> {
  let didTimeout = false;
  
  const timeoutPromise = new Promise<SafeResult<T>>((resolve) => {
    setTimeout(() => {
      didTimeout = true;
      resolve({ success: false, result: null, timedOut: true });
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      promise.then((r) => ({ success: true as const, result: r, timedOut: false as const })),
      timeoutPromise,
    ]);
    return result;
  } catch (error) {
    if (didTimeout) {
      return { success: false, result: null, timedOut: true };
    }
    console.warn('[SafeTimeout] Promise rejected:', error);
    return { success: false, result: null, timedOut: false };
  }
}

export async function safeCall<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs: number = 10000
): Promise<T> {
  try {
    const result = await safeTimeout(promise, timeoutMs);
    if (result.success) {
      return result.result;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export async function safeLocationPermission(
  permissionFn: () => Promise<{ status: string; granted: boolean }>,
  timeoutMs: number = 5000
): Promise<{ status: string; granted: boolean; timedOut: boolean }> {
  const result = await safeTimeout(permissionFn(), timeoutMs);
  if (result.success) {
    return { ...result.result, timedOut: false };
  }
  return { status: 'undetermined', granted: false, timedOut: true };
}
