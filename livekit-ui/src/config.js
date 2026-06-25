const trimTrailingSlash = (value) => value.replace(/\/$/, "");

const backendHttpUrl = trimTrailingSlash(
  import.meta.env.VITE_BACKEND_HTTP_URL || "http://192.168.11.132:8000"
);

export const appConfig = {
  backendHttpUrl,
  livekitWsUrl: import.meta.env.VITE_LIVEKIT_WS_URL || "ws://192.168.11.132:7880",
};
