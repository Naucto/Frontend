// Dispatched on window when an authenticated session expires and can't be
// refreshed. The API client (main.tsx) emits it; UserProvider reacts by logging
// out and showing the "logged out due to inactivity" modal.
export const AUTH_EXPIRED_EVENT = "auth:expired";
