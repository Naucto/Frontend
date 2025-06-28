import { useState, useEffect, useCallback } from "react";

type useAsyncReturnType<T> = {
  loading: boolean,
  error: Error | undefined,
  value: T | undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAsync<T>(asyncFunction: () => Promise<T>, dependencies: any[] = []): useAsyncReturnType<T> {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [value, setValue] = useState<T | undefined>();

  const callback = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setValue(undefined);

    asyncFunction()
      .then(setValue)
      .catch(setError)
      .finally(() => setLoading(false));
  }, dependencies);

  useEffect(() => {
    callback();
  }, [callback]);

  return { loading, error, value };
}
