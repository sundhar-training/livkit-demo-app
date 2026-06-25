import { useEffect, useMemo, useState } from "react";
import "@livekit/components-styles";
import {
  CarouselLayout,
  Chat,
  ConnectionState,
  ConnectionStateToast,
  ControlBar,
  DisconnectButton,
  FocusLayout,
  FocusLayoutContainer,
  GridLayout,
  LayoutContextProvider,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useCreateLayoutContext,
  useLocalParticipant,
  useParticipants,
  usePinnedTracks,
  useSpeakingParticipants,
  useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { appConfig } from "../config";
import {
  clearLastSession,
  loadLastSession,
  saveLastSession,
} from "../sessionStorage";

function RoomInsightsPanel() {
  const participants = useParticipants();
  const speakingParticipants = useSpeakingParticipants();
  const { isMicrophoneEnabled, isCameraEnabled, localParticipant } = useLocalParticipant();

  return (
    <section className="room-insights">
      <h2>Room Insights</h2>

      <div className="insights-grid">
        <div className="insight-item">
          <span className="insight-label">Participants</span>
          <strong>{participants.length}</strong>
        </div>
        <div className="insight-item">
          <span className="insight-label">Speaking now</span>
          <strong>{speakingParticipants.length}</strong>
        </div>
      </div>

      <div className="insights-chip-row">
        <span className="insight-chip">Mic: {isMicrophoneEnabled ? "On" : "Off"}</span>
        <span className="insight-chip">Camera: {isCameraEnabled ? "On" : "Off"}</span>
      </div>

      <div className="participants-list-wrap">
        <p className="insight-label">People in room</p>
        <ul className="participants-list">
          {participants.map((participant) => (
            <li key={participant.sid}>
              <span>{participant.name || participant.identity}</span>
              {participant.identity === localParticipant.identity ? (
                <small>You</small>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CustomConferenceLayout({ meetingView, insightsMode }) {
  const [widgetState, setWidgetState] = useState({
    showChat: false,
    unreadMessages: 0,
    showSettings: false,
  });
  const layoutContext = useCreateLayoutContext();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false }
  );
  const focusTrack = usePinnedTracks(layoutContext)?.[0];
  const fallbackFocusTrack = tracks.find((track) => track?.source === Track.Source.Camera);

  const screenShareTracks = tracks.filter(
    (track) =>
      track?.source === Track.Source.ScreenShare &&
      track?.publication?.isSubscribed
  );

  const isSameTrack = (firstTrack, secondTrack) => {
    const firstSid = firstTrack?.publication?.trackSid;
    const secondSid = secondTrack?.publication?.trackSid;
    if (firstSid && secondSid) {
      return firstSid === secondSid;
    }

    return (
      firstTrack?.participant?.identity === secondTrack?.participant?.identity &&
      firstTrack?.source === secondTrack?.source
    );
  };

  const activeFocusTrack = focusTrack || fallbackFocusTrack;
  const carouselTracks = tracks.filter((track) => !isSameTrack(track, activeFocusTrack));
  const shouldShowFocusLayout =
    meetingView === "focus"
      ? Boolean(activeFocusTrack)
      : meetingView === "auto"
        ? Boolean(focusTrack)
        : false;

  useEffect(() => {
    if (!focusTrack && screenShareTracks.length > 0) {
      layoutContext.pin.dispatch?.({
        msg: "set_pin",
        trackReference: screenShareTracks[0],
      });
    }
  }, [focusTrack, screenShareTracks, layoutContext]);

  const isChatOpen = widgetState.showChat;
  const shouldShowInsights = insightsMode !== "hidden";
  const sidePanelMode = isChatOpen ? "chat" : shouldShowInsights ? insightsMode : "hidden";

  return (
    <LayoutContextProvider value={layoutContext} onWidgetChange={setWidgetState}>
      <div
        className={`conference-content conference-content-inner side-panel-${sidePanelMode} ${
          isChatOpen ? "chat-active" : ""
        }`}
      >
        <div className="layout-stage">
          <div className="custom-conference-layout">
            {!shouldShowFocusLayout ? (
              <div className="lk-grid-layout-wrapper">
                <GridLayout tracks={tracks}>
                  <ParticipantTile />
                </GridLayout>
              </div>
            ) : (
              <div className="lk-focus-layout-wrapper">
                <FocusLayoutContainer>
                  <CarouselLayout tracks={carouselTracks}>
                    <ParticipantTile />
                  </CarouselLayout>
                  {activeFocusTrack ? <FocusLayout trackRef={activeFocusTrack} /> : null}
                </FocusLayoutContainer>
              </div>
            )}

            <ControlBar controls={{ chat: true, settings: false }} />
          </div>
        </div>

        {sidePanelMode !== "hidden" ? (
          <aside className={`conference-side-panel conference-side-panel-${sidePanelMode}`}>
            {isChatOpen ? <Chat className="conference-side-chat" /> : <RoomInsightsPanel />}
          </aside>
        ) : null}
      </div>
    </LayoutContextProvider>
  );
}

function RoomPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomName: roomNameParam } = useParams();

  const routeRoomName = roomNameParam ? decodeURIComponent(roomNameParam) : "";
  const tokenApiUrl = useMemo(
    () => `${appConfig.backendHttpUrl}/livekit/token`,
    []
  );
  const [recoveredSession, setRecoveredSession] = useState(null);
  const sessionInfo = location.state?.token ? location.state : recoveredSession;
  const [recoveryState, setRecoveryState] = useState({
    isLoading: !location.state?.token,
    error: "",
  });
  const [meetingView, setMeetingView] = useState("auto");
  const [insightsMode, setInsightsMode] = useState("expanded");

  useEffect(() => {
    if (location.state?.token) {
      saveLastSession({
        roomName: location.state.roomName || routeRoomName,
        participantIdentity: location.state.participantIdentity,
        participantName: location.state.participantName,
      });
      return;
    }

    const recoverSession = async () => {
      setRecoveryState({ isLoading: true, error: "" });

      try {
        const storedSession = loadLastSession();
        if (!storedSession?.participantIdentity || !storedSession?.participantName) {
          setRecoveryState({
            isLoading: false,
            error: "Session missing. Please join again.",
          });
          return;
        }

        const currentRoomName = routeRoomName || storedSession.roomName;
        if (!currentRoomName) {
          setRecoveryState({
            isLoading: false,
            error: "Room name missing. Please join again.",
          });
          return;
        }

        const response = await fetch(tokenApiUrl, {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            room_name: currentRoomName,
            participant_identity: storedSession.participantIdentity,
            participant_name: storedSession.participantName,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(errorBody || `Unable to recover session (${response.status})`);
        }

        const data = await response.json();
        const recoveredSession = {
          token: data.token,
          roomName: currentRoomName,
          participantIdentity: storedSession.participantIdentity,
          participantName: storedSession.participantName,
        };

        setRecoveredSession(recoveredSession);
        saveLastSession({
          roomName: currentRoomName,
          participantIdentity: storedSession.participantIdentity,
          participantName: storedSession.participantName,
        });
        setRecoveryState({ isLoading: false, error: "" });
      } catch (error) {
        setRecoveryState({
          isLoading: false,
          error: error instanceof Error ? error.message : "Unable to recover session.",
        });
      }
    };

    recoverSession();
  }, [location.state, routeRoomName, tokenApiUrl]);

  const currentRoomName = sessionInfo.roomName || routeRoomName;

  const handleLeave = () => {
    clearLastSession();
    navigate("/join", { replace: true });
  };

  if (recoveryState.isLoading) {
    return (
      <main className="join-page">
        <section className="join-form room-status-card">
          <h1>Reconnecting...</h1>
          <p>Recovering your room session from this browser tab.</p>
        </section>
      </main>
    );
  }

  if (!sessionInfo?.token) {
    return (
      <main className="join-page">
        <section className="join-form room-status-card">
          <h1>Unable to resume session</h1>
          <p>{recoveryState.error || "Please join the room again."}</p>
          <button type="button" onClick={() => navigate("/join", { replace: true })}>
            Back to Join
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="conference-page teams-surface">
      <LiveKitRoom
        video
        audio
        serverUrl={appConfig.livekitWsUrl}
        token={sessionInfo.token}
        connect
        data-lk-theme="default"
        className="conference-room"
      >
        <div className="conference-shell">
          <header className="conference-header">
            <span>Room: {currentRoomName}</span>
            <span>Identity: {sessionInfo.participantIdentity}</span>
            <ConnectionState className="connection-badge" />
            <DisconnectButton className="leave-button" onClick={handleLeave}>
              Leave Room
            </DisconnectButton>
          </header>

          <section className="meeting-ribbon" aria-label="Meeting controls">
            <label>
              View
              <select value={meetingView} onChange={(event) => setMeetingView(event.target.value)}>
                <option value="auto">Auto</option>
                <option value="grid">Gallery</option>
                <option value="focus">Presenter</option>
              </select>
            </label>

            <label>
              Insights
              <select value={insightsMode} onChange={(event) => setInsightsMode(event.target.value)}>
                <option value="expanded">Expanded</option>
                <option value="compact">Compact</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
          </section>

          <CustomConferenceLayout meetingView={meetingView} insightsMode={insightsMode} />
          <ConnectionStateToast />
          <RoomAudioRenderer />
        </div>
      </LiveKitRoom>
    </div>
  );
}

export default RoomPage;
