import { Box, Link, Typography, Divider, useTheme } from "@mui/material";
import GenericTextField from "@shared/TextField";
import { FC, useCallback, useState } from "react";
import { styled } from "@mui/material";
import { CreateUserDto, LoginDto, authControllerRegister, authControllerLogin, userControllerGetProfile, authControllerLoginWithGoogle } from "@api";
import { useForm } from "react-hook-form";
import ImportantButton from "@shared/buttons/ImportantButton";
import { useUser } from "@providers/UserProvider";
import { CustomDialog } from "@shared/dialog/CustomDialog";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { CredentialResponse, GoogleLogin } from "@react-oauth/google";
import { useAuthSuccess } from "@hooks/useAuthSuccess";
import { generatePKCE, savePKCE } from "@utils/pkce";

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
  marginBottom: theme.spacing(1),
}));

const StyledTextField = styled(GenericTextField)(() => ({
  width: "100%",
  height: "42px",
}));

const FieldContainer = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2.5),
}));

const StyledImportantButton = styled(ImportantButton)(({ theme }) => ({
  marginTop: theme.spacing(4),
  width: "100%",
  height: "48px",
  backgroundColor: theme.palette.red[500]
}));

const OAuthButtonsContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: theme.spacing(1.5),
  marginBottom: theme.spacing(3),
  width: "100%"
}));

const OAuthButton = styled(ImportantButton)(() => ({
  width: "100%",
  height: "40px",
  fontSize: "14px",
  fontWeight: 500
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
  const theme = useTheme();
  const [isSignUpMode, setIsSignedUp] = useState(false);

  const authText = useCallback((bool: boolean) => {
    return bool ? "Sign up" : "Login";
  }, []);

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
      let msg = "Une erreur est survenue";
      if (error instanceof Error) {
        const errorWithBody = error as unknown as ErrorWithBody;
        msg = errorWithBody?.body?.message || error.message;
      }
      setErrorMessage(msg);
    }
  }, [isSignUpMode, reset, onClose, setUser]);

  const handleGoogleAuthCallback = useCallback(async (credentialResponse: CredentialResponse): Promise<void> => {
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
      let msg = "La connexion avec Google a échoué.";
      if (error instanceof Error) {
        const errorWithBody = error as unknown as ErrorWithBody;
        msg = errorWithBody?.body?.message || error.message;
      }
      setErrorMessage(msg);
    }
  }, [handleAuthSuccess]);

  const handleGoogleAuth = useCallback((): void => {
    // Trigger the hidden GoogleLogin button
    const googleButton = document.querySelector<HTMLButtonElement>(".google-button-wrapper button");
    googleButton?.click();
  }, []);

  const handleGithubLogin = useCallback((): void => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_GITHUB_REDIRECT_URI;
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email`;
  }, []);

  const handleMicrosoftLogin = useCallback(async (): Promise<void> => {
    try {
      setErrorMessage(null);
      const { codeVerifier, codeChallenge } = await generatePKCE();
      savePKCE(codeVerifier);

      const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
      const tenantId = import.meta.env.VITE_MICROSOFT_TENANT_ID;
      const redirectUri = import.meta.env.VITE_MICROSOFT_REDIRECT_URI || `${window.location.origin}/oauth/microsoft/callback`;
      const state = btoa(JSON.stringify({ timestamp: Date.now() }));

      const authorizationUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        "&response_type=code" +
        "&scope=openid%20profile%20email" +
        `&code_challenge=${codeChallenge}` +
        "&code_challenge_method=S256" +
        `&state=${state}` +
        "&response_mode=query";

      window.open(authorizationUrl, "microsoft_login", "width=500,height=700");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erreur lors de l'initialisation de la connexion Microsoft.";
      setErrorMessage(msg);
    }
  }, []);

  return (
    <CustomDialog isOpen={isOpen} setIsOpen={setIsOpen} hideSubmitButton>
      <form onSubmit={handleSubmit(handleAuth)}>
        <StyledTitle>{authText(isSignUpMode)}</StyledTitle>

        <FieldContainer>
          <label htmlFor="email-input">Email</label>
          <StyledTextField
            id="email-input"
            {...register("email")}
            data-cy="email-input" />
        </FieldContainer>

        {isSignUpMode && <FieldContainer>
          <label htmlFor="username-input">Username</label>
          <StyledTextField
            id="username-input"
            {...register("username")} />
        </FieldContainer>}

        <FieldContainer>
          <label htmlFor="password-input">Password</label>
          <StyledTextField
            id="password-input"
            type="password"
            {...register("password")}
            data-cy="password-input" />
        </FieldContainer>

        <StyledImportantButton type="submit"
          data-cy="submit-auth">
          {authText(isSignUpMode)}
        </StyledImportantButton>

        {errorMessage && <Typography color="error">{errorMessage}</Typography>}

        <Box sx={{ width: "100%", my: 2 }}>
          <Divider>
            <Typography variant="body2" color="textSecondary">OR</Typography>
          </Divider>
        </Box>

        <OAuthButtonsContainer>

          <Box className="google-button-wrapper" sx={{ display: "none" }}>
            <GoogleLogin
              onSuccess={handleGoogleAuthCallback}
              onError={() => setErrorMessage("La fenêtre Google a été fermée ou une erreur est survenue.")}
            />
          </Box>

          <OAuthButton
            type="button"
            onClick={handleGoogleAuth}
          >
            Continuer avec Google
          </OAuthButton>

          <OAuthButton
            type="button"
            onClick={handleGithubLogin}
          >
            Continuer avec GitHub
          </OAuthButton>

          <OAuthButton
            type="button"
            onClick={handleMicrosoftLogin}
          >
            Continuer avec Microsoft
          </OAuthButton>

        </OAuthButtonsContainer>

        <Center sx={{ marginTop: isSignUpMode ? theme.spacing(-1) : theme.spacing(3) }}>
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
