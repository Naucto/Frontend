import { Box, Link, Typography, Divider, useTheme } from "@mui/material";
import { FC, useCallback, useState } from "react";
import { useForm } from "react-hook-form";

import { CreateUserDto, LoginDto, authControllerRegister, authControllerLogin, userControllerGetProfile } from "@api";
import { useUser } from "@providers/UserProvider";
import { CustomDialog } from "@shared/dialog/CustomDialog";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { generatePKCE, savePKCE, saveGooglePKCE } from "@utils/pkce";

import * as S from "./AuthOverlay.styles";
import GitHubPixelLogo from "@assets/GithubLogo.png";
import GooglePixelLogo from "@assets/GoogleLogo.png";
import MicrosoftPixelLogo from "@assets/MicrosoftLogo.png";

interface AuthOverlayProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onClose?: () => void;
}


const AuthOverlay: FC<AuthOverlayProps> = ({ isOpen, setIsOpen, onClose }): React.JSX.Element => {
  const theme = useTheme();
  const [isSignUpMode, setIsSignUpMode] = useState(false);

  const authText = useCallback((bool: boolean) => {
    return bool ? "Sign up" : "Login";
  }, []);

  const { setUser } = useUser();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
        const { data: authResponse, error } = await authControllerRegister({ body: { email, username, password, nickname: username } });
        if (error) throw new Error((error as { message?: string })?.message ?? "Registration failed");
        accessToken = authResponse!.access_token;
      } else {
        const { email, password } = data as LoginDto;
        const { data: authResponse, error } = await authControllerLogin({ body: { email, password } });
        if (error) throw new Error((error as { message?: string })?.message ?? "Login failed");
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
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [isSignUpMode, reset, onClose, setUser]);

  const handleGoogleLogin = useCallback(async (): Promise<void> => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI;
    const { codeVerifier, codeChallenge } = await generatePKCE();
    saveGooglePKCE(codeVerifier);
    window.location.href =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      "&response_type=code" +
      "&scope=openid%20email%20profile" +
      `&code_challenge=${codeChallenge}` +
      "&code_challenge_method=S256";
  }, []);

  const handleGithubLogin = useCallback((): void => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_GITHUB_REDIRECT_URI;
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email`;
  }, []);

  const handleMicrosoftLogin = useCallback(async (): Promise<void> => {
    try {
      setErrorMessage(null);
      const popup = window.open("about:blank", "microsoft_login", "width=500,height=700");
      if (!popup) {
        setErrorMessage("Le popup a été bloqué. Autorisez les popups pour ce site.");
        return;
      }

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

      popup.location.href = authorizationUrl;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erreur lors de l'initialisation de la connexion Microsoft.";
      setErrorMessage(msg);
    }
  }, []);

  return (
    <CustomDialog isOpen={isOpen} setIsOpen={setIsOpen} hideSubmitButton>
      <form onSubmit={handleSubmit(handleAuth)}>
        <S.StyledTitle>{authText(isSignUpMode)}</S.StyledTitle>

        <S.FieldContainer>
          <label htmlFor="email-input">Email</label>
          <S.StyledTextField id="email-input" {...register("email")} data-cy="email-input" />
        </S.FieldContainer>

        {isSignUpMode && (
          <S.FieldContainer>
            <label htmlFor="username-input">Username</label>
            <S.StyledTextField id="username-input" {...register("username")} />
          </S.FieldContainer>
        )}

        <S.FieldContainer>
          <label htmlFor="password-input">Password</label>
          <S.StyledTextField id="password-input" type="password" {...register("password")} data-cy="password-input" />
        </S.FieldContainer>

        <S.StyledImportantButton type="submit" data-cy="submit-auth">
          {authText(isSignUpMode)}
        </S.StyledImportantButton>

        {errorMessage && <Typography color="error">{errorMessage}</Typography>}

        <Box sx={{ width: "100%", my: 2 }}>
          <Divider><Typography variant="body2" color="textSecondary">OR</Typography></Divider>
        </Box>

        <S.OAuthButtonsContainer>
          <S.OAuthButton type="button" bgColor="#ffffff" textColor="#3c4043" onClick={handleGoogleLogin}>
            <S.PixelIcon src={GooglePixelLogo} alt="Google" /> Google
          </S.OAuthButton>

          <S.OAuthButton type="button" bgColor="#24292e" onClick={handleGithubLogin}>
            <S.PixelIcon src={GitHubPixelLogo} alt="GitHub" /> GitHub
          </S.OAuthButton>

          <S.OAuthButton type="button" bgColor="#ffffff" textColor="#3c4043" onClick={handleMicrosoftLogin}>
            <S.PixelIcon src={MicrosoftPixelLogo} alt="Microsoft" /> Microsoft
          </S.OAuthButton>
        </S.OAuthButtonsContainer>

        <S.Center sx={{ marginTop: isSignUpMode ? theme.spacing(-1) : theme.spacing(3) }}>
          <Typography>
            {isSignUpMode ? "Already have an account ? " : "Don't have an account ? "}
            <Link sx={{ cursor: "pointer" }} data-cy="toggle-auth-mode" onClick={() => setIsSignUpMode(!isSignUpMode)}>
              {authText(!isSignUpMode)}
            </Link>
          </Typography>
        </S.Center>
      </form>
    </CustomDialog>
  );
};

export default AuthOverlay;
