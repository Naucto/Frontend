import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authControllerLoginWithGoogleCode } from "@api";
import { useAuthSuccess } from "@hooks/useAuthSuccess";
import { getGooglePKCE } from "@utils/pkce";
import { Box, Typography, CircularProgress } from "@mui/material";

export const GoogleOAuthCallback = (): React.JSX.Element => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleAuthSuccess } = useAuthSuccess();
  const hasCalledAPI = useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      console.error("Google OAuth error:", error);
      navigate("/?error=google_failed");
      return;
    }

    if (!code || hasCalledAPI.current) return;
    hasCalledAPI.current = true;

    const codeVerifier = getGooglePKCE();
    if (!codeVerifier) {
      console.error("Google PKCE verifier not found");
      navigate("/?error=google_failed");
      return;
    }

    authControllerLoginWithGoogleCode({ body: { code, codeVerifier } })
      .then(async ({ data, error: apiError }) => {
        if (apiError) throw new Error(JSON.stringify(apiError));
        await handleAuthSuccess(data!.access_token);
        navigate("/");
      })
      .catch((err: Error) => {
        console.error("Erreur Google:", err.message);
        navigate("/?error=google_failed");
      });
  }, [searchParams, navigate, handleAuthSuccess]);

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh">
      <CircularProgress size={60} sx={{ mb: 4 }} />
      <Typography variant="h5">Authentification Google en cours...</Typography>
    </Box>
  );
};
