import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography, CircularProgress } from "@mui/material";
import { authControllerLoginWithMicrosoft } from "@api";
import { useAuthSuccess } from "@hooks/useAuthSuccess";
import { getPKCE } from "@utils/pkce";

export const MicrosoftOAuthCallback = (): React.JSX.Element => {
  const [searchParams] = useSearchParams();
  const { handleAuthSuccess } = useAuthSuccess();
  const hasCalledAPI = useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      console.error("Microsoft OAuth error:", error, searchParams.get("error_description"));
      window.opener?.postMessage({ error }, "*");
      window.close();
      return;
    }

    if (code && !hasCalledAPI.current) {
      hasCalledAPI.current = true;
      const codeVerifier = getPKCE();

      if (!codeVerifier) {
        console.error("Code verifier not found in localStorage");
        window.opener?.postMessage({ error: "missing_verifier" }, "*");
        window.close();
        return;
      }

      authControllerLoginWithMicrosoft({ body: { token: code, codeVerifier } })
        .then(async ({ data }) => {
          window.opener?.postMessage({
            type: "microsoft_auth_success",
            token: data!.access_token
          }, "*");
          window.close();
        })
        .catch((err: Error) => {
          console.error("Erreur Microsoft:", err);
          window.opener?.postMessage({ error: "microsoft_failed" }, "*");
          window.close();
        });
    } else if (!code && !error) {
      window.close();
    }
  }, [searchParams, handleAuthSuccess]);

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh">
      <CircularProgress size={60} sx={{ mb: 4 }} />
      <Typography variant="h5">Authentification Microsoft en cours...</Typography>
    </Box>
  );
};
