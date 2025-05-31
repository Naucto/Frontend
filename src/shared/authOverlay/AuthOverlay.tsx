import { Backdrop, Box, Link, Typography } from "@mui/material";
import GenericTextField from "@shared/TextField";
import React, { FC, ReactNode, useCallback, useMemo, useState } from "react";
import { styled } from "@mui/material";
import { CreateUserDto, LoginDto } from "src/api";
import { Form, useForm } from "react-hook-form";
import ImportantButton from "@shared/buttons/ImportantButton";
import { AuthService } from "src/api/services/AuthService";
import { c } from "node_modules/vite/dist/node/moduleRunnerTransport.d-CXw_Ws6P";
import { useUser } from "src/providers/UserProvider";
import { CustomDialog } from "@shared/dialog/CustomDialog";

interface AuthOverlayProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onClose?: () => void;
}

const Title = styled("h2")(({ theme }) => ({
  fontSize: 32,
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
}));

const Center = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2.5),
  fontSize: 24,
  color: theme.palette.grey1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
}));

const AuthOverlay: FC<AuthOverlayProps> = ({ isOpen, setIsOpen, onClose }) => {
  const [isSignUp, setIsSignUp] = useState(true);

  const authText = useCallback((bool: boolean) => {
    return bool ? "Sign up" : "Login";
  }, [isSignUp]);

  const { user, setUser } = useUser();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { register, handleSubmit, reset } = useForm<CreateUserDto | LoginDto>({
    defaultValues: isSignUp
      ? {
        email: "",
        username: "",
        password: "",
        firstName: "",
        lastName: "",
        roles: [],
      }
      : {
        email: "",
        password: "",
      },
  });

  const handleAuth = useCallback(async (data: CreateUserDto | LoginDto) => {
    try {
      setErrorMessage(null);
      if (isSignUp) {
        const { email, username, password, firstName, lastName } = data as CreateUserDto;
        await AuthService.authControllerRegister({ email, username, password, firstName, lastName });
      } else {
        const { email, password } = data as LoginDto;
        const res = await AuthService.authControllerLogin({ email, password });
        setUser({
          id: res.user.id,
          email: res.user.email,
          name: res.user.username,
        });
        localStorage.setItem("token", res.access_token); // temporary
        localStorage.setItem("user", JSON.stringify(res.user));
      }
      reset();
      if (onClose) {
        onClose();
      }
    } catch (error: any) {
      setErrorMessage(error?.body?.message || "Error");
    }
  }, [isSignUp, reset, onClose, setUser, user,]);

  return (
    <form onSubmit={handleSubmit(handleAuth)}>
      <CustomDialog isOpen={isOpen} setIsOpen={setIsOpen} hideSubmitButton>
        <StyledTitle>{authText(isSignUp)}</StyledTitle>

        <FieldContainer>
          <label>Email</label>
          <StyledTextField {...register("email")} />
        </FieldContainer>

        {isSignUp && <FieldContainer>
          <label>Username</label>
          <StyledTextField {...register("username")} />
        </FieldContainer>}

        <FieldContainer>
          <label>Password</label>
          <StyledTextField type="password" {...register("password")} />
        </FieldContainer>

        <StyledImportantButton type="submit">{authText(isSignUp)}</StyledImportantButton>

        {errorMessage && <Typography color="error">{errorMessage}</Typography>}

        <Center>
          <Typography>OR</Typography>
          <Typography>{isSignUp ? "Already have an account ? " : "Don't have an account ? "}
            <Link sx={{ cursor: "pointer" }} onClick={() => { setIsSignUp(!isSignUp); }}>{authText(!isSignUp)}</Link>
          </Typography>
        </Center>
      </CustomDialog>
    </form >
  );
};

export default AuthOverlay;
