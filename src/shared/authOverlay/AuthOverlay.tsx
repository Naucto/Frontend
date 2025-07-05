import { Box, Link, Typography } from "@mui/material";
import GenericTextField from "@shared/TextField";
import React, { FC, useCallback, useState } from "react";
import { styled } from "@mui/material";
import { CreateUserDto, LoginDto, UsersService } from "src/api";
import { useForm } from "react-hook-form";
import ImportantButton from "@shared/buttons/ImportantButton";
import { AuthService } from "src/api/services/AuthService";
import { useUser } from "src/providers/UserProvider";
import { CustomDialog } from "@shared/dialog/CustomDialog";

interface AuthOverlayProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onClose?: () => void;
}

const Title = styled("h2")(({ theme }) => ({
  fontSize: "32px",
  margin: 0,
  fontWeight: "normal",
  padding: theme.spacing(0, 0),
}));

const StyledTitle = styled(Title)(({ theme }) => ({
  marginBottom: theme.spacing(2),
}));

const StyledTextField = styled(GenericTextField)(({ theme }) => ({
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

  const { user, setUser } = useUser();
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
      let authResponse;
      if (isSignedUp) {
        const { email, username, password } = data as CreateUserDto;
        authResponse = await AuthService.authControllerRegister({ email, username, password, nickname: username });
      } else {
        const { email, password } = data as LoginDto;
        authResponse = await AuthService.authControllerLogin({ email, password });
      }

      // FIXME: put the token to httpOnly cookie using the backend
      localStorage.setItem("token_access", authResponse.access_token);

      const userRes = await UsersService.userControllerGetProfile();
      localStorage.setItem("user", JSON.stringify(userRes));
      setUser({
        id: String(userRes.id),
        email: userRes.email,
        name: userRes.username,
      });
      reset();
      if (onClose) {
        onClose();
      }
    } catch (error: any) {
      setErrorMessage(error?.body?.message || "Error");
    }
  }, [isSignedUp, reset, onClose, setUser, user,]);

  return (
    <form onSubmit={handleSubmit(handleAuth)}>
      <CustomDialog isOpen={isOpen} setIsOpen={setIsOpen} hideSubmitButton>
        <StyledTitle>{authText(isSignedUp)}</StyledTitle>

        <FieldContainer>
          <label>Email</label>
          <StyledTextField {...register("email")} />
        </FieldContainer>

        {isSignedUp && <FieldContainer>
          <label>Username</label>
          <StyledTextField {...register("username")} />
        </FieldContainer>}

        <FieldContainer>
          <label>Password</label>
          <StyledTextField type="password" {...register("password")} />
        </FieldContainer>

        <StyledImportantButton type="submit">{authText(isSignedUp)}</StyledImportantButton>

        {errorMessage && <Typography color="error">{errorMessage}</Typography>}

        <Center>
          <Typography>OR</Typography>
          <Typography>{isSignedUp ? "Already have an account ? " : "Don't have an account ? "}
            <Link sx={{ cursor: "pointer" }} onClick={() => { setIsSignedUp(!isSignedUp); }}>{authText(!isSignedUp)}</Link>
          </Typography>
        </Center>
      </CustomDialog>
    </form>
  );
};

export default AuthOverlay;
