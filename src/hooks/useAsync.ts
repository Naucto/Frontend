import { useState, useEffect, useCallback, DependencyList } from "react";

type useAsyncReturnType<T> = {
  loading: boolean,
  error: Maybe<Error>
  value: Maybe<T>
}

export function useAsync<T>(asyncFunction: () => Promise<T>, dependencies: DependencyList[] = []): useAsyncReturnType<T> {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Maybe<Error>>();
  const [value, setValue] = useState<Maybe<T>>();

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
