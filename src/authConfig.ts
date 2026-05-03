import { Configuration, PopupRequest, LogLevel } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_MICROSOFT_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_MICROSOFT_REDIRECT_URI
  },
  cache: {
    cacheLocation: "localStorage",
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error: console.error(message); return;
          case LogLevel.Info: console.info(message); return;
        }
      }
    },
  }
};

export const loginRequest: PopupRequest = {
  scopes: ["User.Read"],
};
