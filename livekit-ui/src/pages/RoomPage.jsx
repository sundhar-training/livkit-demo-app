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
  useTextStream,
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

const TRANSCRIPT_TOPIC = "lk.transcription";

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

function TranscriptPanel() {
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [translatedEntries, setTranslatedEntries] = useState({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [localTranscriptEntries, setLocalTranscriptEntries] = useState([]);
  const [speechStatus, setSpeechStatus] = useState(() => {
    if (typeof window === "undefined") {
      return "unsupported";
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return SpeechRecognition ? "idle" : "unsupported";
  });
  const { textStreams } = useTextStream(TRANSCRIPT_TOPIC);

  const transcriptApiUrl = useMemo(
    () => `${appConfig.backendHttpUrl}/livekit/translate`,
    []
  );

  const participantLabelByIdentity = useMemo(() => {
    return new Map(
      participants.map((participant) => [
        participant.identity,
        participant.name || participant.identity,
      ])
    );
  }, [participants]);

  const transcriptItems = useMemo(() => {
    const sharedItems = textStreams.map((item, index) => {
      const rawText = item?.text ?? String(item ?? "");
      const speakerIdentity = item?.participantInfo?.identity ?? "Speaker";
      const speaker =
        participantLabelByIdentity.get(speakerIdentity) || speakerIdentity || "Speaker";
      const timestampValue = item?.streamInfo?.timestamp ?? index;

      return {
        id: item?.id ?? item?.sid ?? `${index}-${timestampValue}-${rawText}`,
        text: String(rawText).trim(),
        speaker: String(speaker),
        timestamp: timestampValue,
        source: "shared-text-stream",
        order: index,
      };
    });

    const localItems = localTranscriptEntries.map((item, index) => ({
      ...item,
      source: "local-echo",
      order: sharedItems.length + index,
    }));

    return [...sharedItems, ...localItems];
  }, [localTranscriptEntries, participantLabelByIdentity, textStreams]);

  const displayedTranscriptText = useMemo(() => {
    return transcriptItems
      .map((entry) => {
        const lineText = targetLanguage === "en" ? entry.text : translatedEntries[entry.id] || entry.text;
        const timeLabel = new Date(entry.timestamp).toLocaleTimeString();

        return `[${timeLabel}] ${entry.speaker}: ${lineText}`;
      })
      .join("\n");
  }, [transcriptItems, targetLanguage, translatedEntries]);

  const handleDownloadTranscript = () => {
    if (!transcriptItems.length) {
      return;
    }

    const downloadContent = displayedTranscriptText;

    const blob = new Blob([downloadContent], { type: "text/plain;charset=utf-8" });
    const downloadUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `livekit-transcript-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    anchor.click();
    window.URL.revokeObjectURL(downloadUrl);
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setSpeechStatus("listening");
    recognition.onerror = () => setSpeechStatus("error");
    recognition.onend = () => setSpeechStatus("stopped");
    recognition.onresult = async (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result.isFinal) {
          continue;
        }

        const transcriptText = result[0]?.transcript?.trim();
        if (!transcriptText) {
          continue;
        }

        try {
          await localParticipant.sendText(transcriptText, { topic: TRANSCRIPT_TOPIC });
          setLocalTranscriptEntries((previousEntries) => [
            ...previousEntries,
            {
              id: `${Date.now()}-${previousEntries.length}`,
              text: transcriptText,
              speaker: localParticipant.name || localParticipant.identity || "You",
              timestamp: Date.now(),
            },
          ]);
        } catch (error) {
          setSpeechStatus("error");
          setTranslationError(
            error instanceof Error ? error.message : "Failed to publish transcript to the room."
          );
          return;
        }
      }
    };

    try {
      recognition.start();
    } catch {
      return undefined;
    }

    return () => {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      try {
        recognition.stop();
      } catch {
        // ignore stop errors from browser speech recognition
      }
    };
  }, [localParticipant]);

  useEffect(() => {
    const translateEntries = async () => {
      if (!transcriptItems.length) {
        setTranslatedEntries({});
        return;
      }

      if (targetLanguage === "en") {
        setTranslatedEntries({});
        setTranslationError("");
        return;
      }

      setIsTranslating(true);
      setTranslationError("");

      try {
        const translations = await Promise.all(
          transcriptItems.map(async (entry) => {
            if (!entry.text) {
              return [entry.id, ""];
            }

            const response = await fetch(transcriptApiUrl, {
              method: "POST",
              headers: {
                accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                text: entry.text,
                target_language: targetLanguage,
              }),
            });

            if (!response.ok) {
              const errorBody = await response.text();
              throw new Error(errorBody || `Translation failed (${response.status})`);
            }

            const data = await response.json();
            return [entry.id, data.translated_text || entry.text];
          })
        );

        setTranslatedEntries(Object.fromEntries(translations));
      } catch (error) {
        setTranslationError(error instanceof Error ? error.message : "Translation failed.");
      } finally {
        setIsTranslating(false);
      }
    };

    translateEntries();
  }, [targetLanguage, transcriptItems, transcriptApiUrl]);

  return (
    <section className="conference-side-panel transcript-panel">
      <div className="transcript-header">
        <div>
          <h2>Transcript</h2>
          <p>Live captions and translated text for the current room.</p>
        </div>

        <div className="transcript-controls">
          <label>
            Translate to
            <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="hi">Hindi</option>
            </select>
          </label>

          <button
            type="button"
            className="secondary-btn transcript-download-btn"
            onClick={handleDownloadTranscript}
            disabled={!transcriptItems.length}
          >
            Download TXT
          </button>
        </div>
      </div>

      <div className="transcript-status-row">
        <span>
          {isTranslating
            ? "Translating…"
            : `${transcriptItems.length} transcript line(s)`}
        </span>
        <span className="transcript-source-state">
          {speechStatus === "unsupported"
            ? "Browser captions unavailable; shared room transcript still plays back"
            : speechStatus === "listening"
              ? "Capturing microphone and publishing to the room"
              : speechStatus === "error"
                ? "Transcript capture paused"
                : "Ready to capture and publish shared captions"}
        </span>
        {translationError ? <span className="transcript-error">{translationError}</span> : null}
      </div>

      <div className="transcript-list">
        {transcriptItems.length ? (
          transcriptItems.map((entry) => (
            <article className="transcript-item" key={entry.id}>
              <div className="transcript-meta">
                <strong>{entry.speaker}</strong>
                <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
              </div>
              <p>
                {targetLanguage === "en"
                  ? entry.text
                  : translatedEntries[entry.id] || entry.text}
              </p>
            </article>
          ))
        ) : (
          <p className="transcript-empty">Transcript will appear here as the room receives shared text-stream updates.</p>
        )}
      </div>
    </section>
  );
}

function CustomConferenceLayout({ meetingView, panelMode, insightsMode }) {
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
  const effectivePanelMode = isChatOpen ? "chat" : panelMode;
  const sidePanelMode =
    effectivePanelMode === "chat"
      ? "chat"
      : effectivePanelMode === "transcript"
        ? "transcript"
        : shouldShowInsights
          ? insightsMode
          : "hidden";

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
            {sidePanelMode === "chat" ? (
              <Chat className="conference-side-chat" />
            ) : sidePanelMode === "transcript" ? (
              <TranscriptPanel />
            ) : (
              <RoomInsightsPanel />
            )}
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
  const [panelMode, setPanelMode] = useState("insights");
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
              Panel
              <select value={panelMode} onChange={(event) => setPanelMode(event.target.value)}>
                <option value="insights">Insights</option>
                <option value="transcript">Transcript</option>
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

          <CustomConferenceLayout meetingView={meetingView} panelMode={panelMode} insightsMode={insightsMode} />
          <ConnectionStateToast />
          <RoomAudioRenderer />
        </div>
      </LiveKitRoom>
    </div>
  );
}

export default RoomPage;
