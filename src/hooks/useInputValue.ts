import { useState, useCallback, useEffect } from "react";

interface UseInputValueReturn {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  reset: () => void;
  setInput: (value: string) => void;
}

export function useInputValue(initialValue: string): UseInputValueReturn {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const onChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    (e) => setValue(e.target.value),
    []
  );

  const setInput = useCallback((newValue: string) => {
    setValue(newValue);
  }, []);

  const reset = useCallback(() => {
    setValue(initialValue);
  }, [initialValue]);

  return { value, onChange, reset, setInput };
}
