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
