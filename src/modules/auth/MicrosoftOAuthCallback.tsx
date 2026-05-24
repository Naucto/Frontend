import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography, CircularProgress } from "@mui/material";
import { authControllerLoginWithMicrosoft } from "@api";
import { getPKCE, getMicrosoftState } from "@utils/pkce";

interface MicrosoftTokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export const MicrosoftOAuthCallback = (): React.JSX.Element => {
  const [searchParams] = useSearchParams();
  const hasCalledAPI = useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const returnedState = searchParams.get("state");
    const expectedState = getMicrosoftState();

    if (error) {
      console.error("Microsoft OAuth error:", error, searchParams.get("error_description"));
      window.opener?.postMessage({ type: "microsoft_auth_error", error }, window.location.origin);
      window.close();
      return;
    }

    if (!returnedState || returnedState !== expectedState) {
      console.error("Microsoft OAuth state mismatch — possible CSRF attack");
      window.opener?.postMessage({ type: "microsoft_auth_error", error: "state_mismatch" }, window.location.origin);
      window.close();
      return;
    }

    if (!code || hasCalledAPI.current) return;
    hasCalledAPI.current = true;

    const codeVerifier = getPKCE();
    if (!codeVerifier) {
      console.error("Code verifier not found in localStorage");
      window.opener?.postMessage({ type: "microsoft_auth_error", error: "missing_verifier" }, window.location.origin);
      window.close();
      return;
    }

    const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
    const tenantId = import.meta.env.VITE_MICROSOFT_TENANT_ID;
    const redirectUri = import.meta.env.VITE_MICROSOFT_REDIRECT_URI || `${window.location.origin}/oauth/microsoft/callback`;

    // Exchange the code directly from the browser — avoids Docker network restrictions.
    // Requires the redirect URI to be registered as "Single-page application" in Azure Portal.
    fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: "openid profile email",
      }),
    })
      .then(res => res.json() as Promise<MicrosoftTokenResponse>)
      .then(async tokens => {
        if (tokens.error) {
          throw new Error(tokens.error_description ?? tokens.error);
        }
        if (!tokens.id_token) {
          throw new Error("No id_token in Microsoft response");
        }
        const response = await authControllerLoginWithMicrosoft({ body: { token: tokens.id_token, codeVerifier } });
        if (response.error) {
          throw new Error(JSON.stringify(response.error));
        }
        window.opener?.postMessage({ type: "microsoft_auth_success", token: response.data!.access_token }, window.location.origin);
        window.close();
      })
      .catch((err: Error) => {
        console.error("Microsoft error:", err.message);
        window.opener?.postMessage({ type: "microsoft_auth_error", error: err.message }, window.location.origin);
        window.close();
      });
  }, [searchParams]);

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh">
      <CircularProgress size={60} sx={{ mb: 4 }} />
      {/* TODO: replace with a proper branded loading screen showing auth progress */}
      <Typography variant="h5">Signing in with Microsoft...</Typography>
    </Box>
  );
};
