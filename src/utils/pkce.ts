export const generatePKCE = async (): Promise<{ codeVerifier: string; codeChallenge: string }> => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);

  const codeVerifier = btoa(String.fromCharCode.apply(null, Array.from(array)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashBase64 = btoa(String.fromCharCode.apply(null, hashArray))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return { codeVerifier, codeChallenge: hashBase64 };
};

export const savePKCE = (codeVerifier: string): void => {
  localStorage.setItem("pkce_verifier", codeVerifier);
};

export const getPKCE = (): string | null => {
  const verifier = localStorage.getItem("pkce_verifier");
  localStorage.removeItem("pkce_verifier");
  return verifier;
};

export const saveGooglePKCE = (codeVerifier: string): void => {
  localStorage.setItem("google_pkce_verifier", codeVerifier);
};

export const getGooglePKCE = (): string | null => {
  const verifier = localStorage.getItem("google_pkce_verifier");
  localStorage.removeItem("google_pkce_verifier");
  return verifier;
};

export const saveGithubState = (state: string): void => {
  localStorage.setItem("github_oauth_state", state);
};

export const getGithubState = (): string | null => {
  const state = localStorage.getItem("github_oauth_state");
  localStorage.removeItem("github_oauth_state");
  return state;
};

export const saveMicrosoftState = (state: string): void => {
  localStorage.setItem("microsoft_oauth_state", state);
};

export const getMicrosoftState = (): string | null => {
  const state = localStorage.getItem("microsoft_oauth_state");
  localStorage.removeItem("microsoft_oauth_state");
  return state;
};

export const saveGoogleState = (state: string): void => {
  localStorage.setItem("google_oauth_state", state);
};

export const getGoogleState = (): string | null => {
  const state = localStorage.getItem("google_oauth_state");
  localStorage.removeItem("google_oauth_state");
  return state;
};
