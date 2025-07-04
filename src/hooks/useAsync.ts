import { useState, useEffect, useCallback, DependencyList } from "react";

type useAsyncReturnType<T> = {
  loading: boolean,
  error: Error | undefined,
  value: T | undefined
}
export function useAsync<T>(asyncFunction: () => Promise<T>, dependencies: DependencyList[] = []): useAsyncReturnType<T> {
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
