const SESSION_KEY = "livekit:last_session";

export const saveLastSession = (session) => {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const loadLastSession = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.sessionStorage.getItem(SESSION_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession);
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
};

export const clearLastSession = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(SESSION_KEY);
};
