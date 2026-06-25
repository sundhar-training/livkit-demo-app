const trimTrailingSlash = (value) => value.replace(/\/$/, "");

const backendHttpUrl = trimTrailingSlash(
  import.meta.env.VITE_BACKEND_HTTP_URL || "http://localhost:8000"
);

export const appConfig = {
  backendHttpUrl,
  livekitWsUrl: import.meta.env.VITE_LIVEKIT_WS_URL || "ws://localhost:7880",
};
