import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authControllerLoginWithGithub } from "@api";
import { useAuthSuccess } from "@hooks/useAuthSuccess";
import { getGithubState } from "@utils/pkce";
import { Box, Typography, CircularProgress } from "@mui/material";

export const OAuthCallback = (): React.JSX.Element => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleAuthSuccess } = useAuthSuccess();

  const hasCalledAPI = useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const returnedState = searchParams.get("state");
    const expectedState = getGithubState();

    if (!code) {
      navigate("/");
      return;
    }

    if (!returnedState || returnedState !== expectedState) {
      console.error("GitHub OAuth state mismatch — possible CSRF attack");
      navigate("/?error=github_failed");
      return;
    }

    if (!hasCalledAPI.current) {
      hasCalledAPI.current = true;

      authControllerLoginWithGithub({ body: { code } })
        .then(async ({ data }) => {
          await handleAuthSuccess(data!.access_token);
          navigate("/");
        })
        .catch((err: Error) => {
          console.error("Github error:", err);
          navigate("/?error=github_failed");
        });
    }
  }, [searchParams, navigate, handleAuthSuccess]);

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh">
      <CircularProgress size={60} sx={{ mb: 4 }} />
      {/* TODO: replace with a proper branded loading screen showing auth progress */}
      <Typography variant="h5">Signing in with GitHub...</Typography>
    </Box>
  );
};
