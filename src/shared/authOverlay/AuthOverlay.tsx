import { Box, Link, Typography } from "@mui/material";
import GenericTextField from "@shared/TextField";
import { FC, useCallback, useState } from "react";
import { styled } from "@mui/material";
import { CreateUserDto, LoginDto, authControllerRegister, authControllerLogin, userControllerGetProfile } from "@api";
import { useForm } from "react-hook-form";
import ImportantButton from "@shared/buttons/ImportantButton";
import { useUser } from "@providers/UserProvider";
import { CustomDialog } from "@shared/dialog/CustomDialog";
import { LocalStorageManager } from "@utils/LocalStorageManager";

interface AuthOverlayProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onClose?: () => void;
}

type ErrorWithBody = { body: { message: string } };

const Title = styled("h2")(({ theme }) => ({
  fontSize: "32px",
  margin: 0,
  fontWeight: "normal",
  padding: theme.spacing(0, 0),
}));

const StyledTitle = styled(Title)(({ theme }) => ({
  marginBottom: theme.spacing(2),
}));

const StyledTextField = styled(GenericTextField)(() => ({
  width: "100%",
  height: "42px",
}));

const FieldContainer = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2.5),
}));

const StyledImportantButton = styled(ImportantButton)(({ theme }) => ({
  marginTop: theme.spacing(5),
  width: "100%",
  height: "56px",
  backgroundColor: theme.palette.red[500]
}));

const Center = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2.5),
  fontSize: 24,
  color: theme.palette.gray[200],
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
}));

const AuthOverlay: FC<AuthOverlayProps> = ({ isOpen, setIsOpen, onClose }) => {
  const [isSignedUp, setIsSignedUp] = useState(true);

  const authText = useCallback((bool: boolean) => {
    return bool ? "Sign up" : "Login";
  }, [isSignedUp]);

  const { setUser } = useUser();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { register, handleSubmit, reset } = useForm<CreateUserDto | LoginDto>({
    defaultValues: isSignedUp
      ? {
        email: "",
        username: "",
        password: "",
        nickname: "",
      }
      : {
        email: "",
        password: "",
      },
  });

  const handleAuth = useCallback(async (data: CreateUserDto | LoginDto) => {
    try {
      setErrorMessage(null);
      let accessToken: string;
      if (isSignedUp) {
        const { email, username, password } = data as CreateUserDto;
        const { data: authResponse } = await authControllerRegister({ body: { email, username, password, nickname: username } });
        accessToken = authResponse!.access_token;
      } else {
        const { email, password } = data as LoginDto;
        const { data: authResponse } = await authControllerLogin({ body: { email, password } });
        accessToken = authResponse!.access_token;
      }

      // FIXME: put the token to httpOnly cookie using the backend
      LocalStorageManager.setToken(accessToken);

      const { data: userRes } = await userControllerGetProfile();
      LocalStorageManager.setUser({
        id: String(userRes!.id),
        email: userRes!.email,
        name: userRes!.username,
      });
      setUser(userRes!);
      reset();
      if (onClose) {
        onClose();
      }
    } catch (error) {
      setErrorMessage((error as ErrorWithBody).body.message);
    }
  }, [isSignedUp, reset, onClose, setUser]);

  return (
    <CustomDialog isOpen={isOpen} setIsOpen={setIsOpen} hideSubmitButton>
      <form onSubmit={handleSubmit(handleAuth)}>
        <StyledTitle>{authText(isSignedUp)}</StyledTitle>

        <FieldContainer>
          <label>Email</label>
          <StyledTextField
            {...register("email")}
            data-cy="email-input" />
        </FieldContainer>

        {isSignedUp && <FieldContainer>
          <label>Username</label>
          <StyledTextField {...register("username")} />
        </FieldContainer>}

        <FieldContainer>
          <label>Password</label>
          <StyledTextField
            type="password"
            {...register("password")}
            data-cy="password-input" />
        </FieldContainer>

        <StyledImportantButton type="submit"
          data-cy="submit-auth">
          {authText(isSignedUp)}
        </StyledImportantButton>

        {errorMessage && <Typography color="error">{errorMessage}</Typography>}

        <Center>
          <Typography>OR</Typography>
          <Typography>{isSignedUp ? "Already have an account ? " : "Don't have an account ? "}
            <Link
              sx={{ cursor: "pointer" }}
              data-cy="toggle-auth-mode"
              onClick={() => { setIsSignedUp(!isSignedUp); }}>{authText(!isSignedUp)}</Link>
          </Typography>
        </Center>
      </form>
    </CustomDialog>
  );
};

export default AuthOverlay;
