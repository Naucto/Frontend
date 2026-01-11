import { ReactNode, JSX } from "react";
import InputBase from "@mui/material/InputBase";
import { UseFormRegisterReturn } from "react-hook-form";

type EditableProps<T extends string = string> = {
  editing: boolean;
  value: T;
  children: ReactNode;
  register: UseFormRegisterReturn;
};

export function Editable<T extends string>({
  editing,
  value,
  children,
  register,
}: EditableProps<T>): JSX.Element {

  return editing ? (
    <InputBase
      defaultValue={value}
      {...register}
    />
  ) : (
    <>
      {children}
    </>
  );
}
