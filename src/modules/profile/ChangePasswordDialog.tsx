import { authControllerChangePassword } from "@api";
import { FullWidthTextField } from "@components/ui/FullWidthTextField";
import ImportantButton from "@shared/buttons/ImportantButton";
import { CustomDialog } from "@shared/dialog/CustomDialog";

import { JSX } from "react";

import { Typography } from "@mui/material";
import { isAxiosError } from "axios";
import { useSnackbar } from "notistack";
import { useForm } from "react-hook-form";

interface ChangePasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordDialog = ({ isOpen, onClose }: Props): JSX.Element => {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ChangePasswordFormValues>();
  const { enqueueSnackbar } = useSnackbar();

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const onSubmit = async (data: ChangePasswordFormValues): Promise<void> => {
    try {
      await authControllerChangePassword({
        throwOnError: true,
        body: {
          currentPassword: data.currentPassword || undefined,
          newPassword: data.newPassword,
        },
      });
      enqueueSnackbar("Password updated successfully", { variant: "success" });
      handleClose();
    } catch (error) {
      if (isAxiosError(error)) {
        const message = error.response?.data?.message ?? "An error occurred while updating the password";
        enqueueSnackbar(message, { variant: "error" });
      } else {
        enqueueSnackbar("An unexpected error occurred", { variant: "error" });
      }
    }
  };

  return (
    <CustomDialog isOpen={isOpen} setIsOpen={(open) => { if (!open) handleClose(); }} hideSubmitButton>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Typography variant="h6" sx={{ mb: 1 }}>Change password</Typography>
        <FullWidthTextField
          label="Current password"
          type="password"
          helperText="Leave empty if you signed in with Google, GitHub, or Microsoft"
          {...register("currentPassword")}
        />
        <FullWidthTextField
          label="New password"
          type="password"
          error={!!errors.newPassword}
          helperText={errors.newPassword?.message}
          {...register("newPassword", { required: "New password is required" })}
        />
        <FullWidthTextField
          label="Confirm new password"
          type="password"
          error={!!errors.confirmPassword}
          helperText={errors.confirmPassword?.message}
          {...register("confirmPassword", {
            required: "Please confirm your new password",
            validate: (value, formValues) => value === formValues.newPassword || "Passwords do not match",
          })}
        />
        <ImportantButton type="submit" fullWidth sx={{ mt: 1 }} disabled={isSubmitting}>
          Update password
        </ImportantButton>
      </form>
    </CustomDialog>
  );
};

export default ChangePasswordDialog;
