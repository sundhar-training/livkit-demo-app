import { useMemo, useState } from "react";
import "@livekit/components-styles";
import {
  LiveKitRoom,
  VideoConference,
} from "@livekit/components-react";
import JoinRoomForm from "./components/JoinRoomForm";
import { appConfig } from "./config";
import "./App.css";

function App() {
  const [token, setToken] = useState(null);
  const [joinState, setJoinState] = useState({
    isSubmitting: false,
    error: "",
  });
  const [sessionInfo, setSessionInfo] = useState(null);

  const tokenApiUrl = useMemo(
    () => `${appConfig.backendHttpUrl}/livekit/token`,
    []
  );

  const handleJoin = async (payload) => {
    if (!payload.room_name || !payload.participant_identity || !payload.participant_name) {
      setJoinState({
        isSubmitting: false,
        error: "Room name, participant identity, and participant name are required.",
      });
      return;
    }

    setJoinState({
      isSubmitting: true,
      error: "",
    });

    try {
      const res = await fetch(tokenApiUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(errorBody || `Failed to create token (status ${res.status}).`);
      }

      const data = await res.json();
      setToken(data.token);
      console.log(data)
      setSessionInfo({
        roomName: payload.room_name,
        participantIdentity: payload.participant_identity,
      });
      setJoinState({
        isSubmitting: false,
        error: "",
      });
    } catch (error) {
      setJoinState({
        isSubmitting: false,
        error: error instanceof Error ? error.message : "Unable to join room.",
      });
    }
  };

  if (!token) {
    return (
      <main className="join-page">
        <JoinRoomForm onJoin={handleJoin} isSubmitting={joinState.isSubmitting} />
        {joinState.error ? <p className="join-error">{joinState.error}</p> : null}
      </main>
    );
  }

  return (
    <div className="conference-page">
      <header className="conference-header">
        <span>Room: {sessionInfo?.roomName}</span>
        <span>Identity: {sessionInfo?.participantIdentity}</span>
      </header>
      <LiveKitRoom
        video
        audio
        serverUrl={appConfig.livekitWsUrl}
        token={token}
        connect
        data-lk-theme="default"
        className="conference-room"
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}

export default App;