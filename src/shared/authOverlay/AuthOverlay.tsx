import { Box, Link, Typography, Divider } from "@mui/material";
import GenericTextField from "@shared/TextField";
import { FC, useCallback, useState } from "react";
import { styled } from "@mui/material";
import { CreateUserDto, LoginDto, authControllerRegister, authControllerLogin, userControllerGetProfile, authControllerLoginWithGoogle, authControllerLoginWithMicrosoft } from "@api";
import { useForm } from "react-hook-form";
import ImportantButton from "@shared/buttons/ImportantButton";
import { useUser } from "@providers/UserProvider";
import { CustomDialog } from "@shared/dialog/CustomDialog";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { useAuthSuccess } from "@hooks/useAuthSuccess";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../../authConfig";

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

const AuthOverlay: FC<AuthOverlayProps> = ({ isOpen, setIsOpen, onClose }): React.JSX.Element => {
  const { instance } = useMsal();
  const [isSignUpMode, setIsSignedUp] = useState(false);

  const authText = useCallback((bool: boolean) => {
    return bool ? "Sign up" : "Login";
  }, [isSignUpMode]);

  const { setUser } = useUser();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { handleAuthSuccess } = useAuthSuccess();
  const { register, handleSubmit, reset } = useForm<CreateUserDto | LoginDto>({
    defaultValues: isSignUpMode
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

  const handleAuth = useCallback(async (data: CreateUserDto | LoginDto): Promise<void> => {
    try {
      setErrorMessage(null);
      let accessToken: string;
      if (isSignUpMode) {
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
  }, [isSignUpMode, reset, onClose, setUser]);

  const handleGoogleAuth = async (credentialResponse: CredentialResponse): Promise<void> => {
    try {
      setErrorMessage(null);
      if (!credentialResponse.credential) {
        throw new Error("Aucun token reçu de Google.");
      }

      const { data: authResponse } = await authControllerLoginWithGoogle({
        body: { token: credentialResponse.credential }
      });

      await handleAuthSuccess(authResponse!.access_token);
    } catch (error) {
      const msg = (error as ErrorWithBody)?.body?.message || "La connexion avec Google a échoué.";
      setErrorMessage(msg);
    }
  };

  const handleGithubLogin = (): void => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_GITHUB_REDIRECT_URI;
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email`;
  };

  const handleMicrosoftLogin = async (): Promise<void> => {
    try {
      setErrorMessage(null);

      const response = await instance.loginPopup(loginRequest);

      if (response && response.idToken) {
        const { data: authResponse } = await authControllerLoginWithMicrosoft({
          body: { token: response.idToken }
        });

        await handleAuthSuccess(authResponse!.access_token);
      }
    } catch (error) {
      console.error("Erreur Microsoft:", error);
      setErrorMessage("La connexion avec Microsoft a échoué ou a été annulée.");
    }
  };

  return (
    <CustomDialog isOpen={isOpen} setIsOpen={setIsOpen} hideSubmitButton>
      <form onSubmit={handleSubmit(handleAuth)}>
        <StyledTitle>{authText(isSignUpMode)}</StyledTitle>

        <FieldContainer>
          <label>Email</label>
          <StyledTextField
            {...register("email")}
            data-cy="email-input" />
        </FieldContainer>

        {isSignUpMode && <FieldContainer>
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
          {authText(isSignUpMode)}
        </StyledImportantButton>

        {errorMessage && <Typography color="error">{errorMessage}</Typography>}

        <Box sx={{ width: "100%", my: 3 }}>
          <Divider>
            <Typography variant="body2" color="textSecondary">OR</Typography>
          </Divider>
        </Box>

        <Box display="flex" flexDirection="column" alignItems="center" gap={2} mb={3}>

          <GoogleLogin
            onSuccess={handleGoogleAuth}
            onError={() => setErrorMessage("La fenêtre Google a été fermée ou une erreur est survenue.")}
            theme="filled_black"
            text={isSignUpMode ? "signup_with" : "signin_with"}
          />

          <ImportantButton
            type="button"
            onClick={handleGithubLogin}
            sx={{ width: "100%", backgroundColor: "#333", "&:hover": { backgroundColor: "#000" } }}
          >
            Continuer avec GitHub
          </ImportantButton>

          <ImportantButton
            type="button"
            onClick={handleMicrosoftLogin}
            sx={{ width: "100%", mt: 2, backgroundColor: "#00a4ef", "&:hover": { backgroundColor: "#008ad2" } }}
          >
            Continuer avec Microsoft
          </ImportantButton>

        </Box>

        <Center>
          <Typography>{isSignUpMode ? "Already have an account ? " : "Don't have an account ? "}
            <Link
              sx={{ cursor: "pointer" }}
              data-cy="toggle-auth-mode"
              onClick={() => { setIsSignedUp(!isSignUpMode); }}>{authText(!isSignUpMode)}</Link>
          </Typography>
        </Center>
      </form>
    </CustomDialog>
  );
};

export default AuthOverlay;
