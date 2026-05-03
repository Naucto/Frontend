import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authControllerLoginWithGithub } from "@api";
import { useAuthSuccess } from "@hooks/useAuthSuccess";
import { Box, Typography, CircularProgress } from "@mui/material";

export const OAuthCallback = (): React.JSX.Element => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleAuthSuccess } = useAuthSuccess();

  const hasCalledAPI = useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");

    if (code && !hasCalledAPI.current) {
      hasCalledAPI.current = true;

      authControllerLoginWithGithub({ body: { code } })
        .then(async ({ data }) => {
          await handleAuthSuccess(data!.access_token);
          navigate("/");
        })
        .catch((err: Error) => {
          console.error("Erreur Github:", err);
          navigate("/?error=github_failed");
        });
    } else if (!code) {
      navigate("/");
    }
  }, [searchParams, navigate, handleAuthSuccess]);

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh">
      <CircularProgress size={60} sx={{ mb: 4 }} />
      <Typography variant="h5">Authentification GitHub en cours...</Typography>
    </Box>
  );
};
