import { useEffect, useMemo, useRef, useState } from "react";
import "@livekit/components-styles";
import {
  CarouselLayout,
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
  useChat,
  useCreateLayoutContext,
  useLocalParticipant,
  useParticipants,
  usePinnedTracks,
  useTextStream,
  useTranscriptions,
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
const CHAT_HISTORY_LIMIT = 250;
const TRANSCRIPT_HISTORY_LIMIT = 500;

const toStorageSafeSegment = (value) => encodeURIComponent(String(value || "unknown"));

const getChatStorageKey = (roomName, participantIdentity) =>
  `livkit:chat:${toStorageSafeSegment(roomName)}:${toStorageSafeSegment(participantIdentity)}`;

const getTranscriptStorageKey = (roomName, participantIdentity) =>
  `livkit:transcript:${toStorageSafeSegment(roomName)}:${toStorageSafeSegment(participantIdentity)}`;

const readPersistedList = (storageKey) => {
  if (typeof window === "undefined" || !storageKey) {
    return [];
  }

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writePersistedList = (storageKey, listValue) => {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(listValue));
  } catch {
    // ignore session storage write failures
  }
};

const clearPersistedList = (storageKey) => {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }

  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // ignore session storage clear failures
  }
};

function ChatPanel({ roomName, participantIdentity }) {
  const { localParticipant } = useLocalParticipant();
  const { chatMessages, send, isSending } = useChat();
  const [draftMessage, setDraftMessage] = useState("");
  const [sendError, setSendError] = useState("");
  const [lastReadMessageIndex, setLastReadMessageIndex] = useState(-1);
  const scrollContainerRef = useRef(null);
  const draftInputRef = useRef(null);

  const chatStorageKey = useMemo(
    () => getChatStorageKey(roomName, participantIdentity),
    [roomName, participantIdentity]
  );

  const [persistedMessages] = useState(() => readPersistedList(chatStorageKey));

  const mergedMessages = useMemo(() => {
    const normalizedIncomingMessages = chatMessages.map((message, index) => ({
      id: message.id || `${message.timestamp}-${message.message}`,
      message: message.message || "",
      timestamp: Number(message.timestamp ?? index),
      fromIdentity: message.from?.identity || "unknown",
      fromName: message.from?.name || message.from?.identity || "Participant",
    }));

    const messageMap = new Map(persistedMessages.map((entry) => [entry.id, entry]));
    for (const messageEntry of normalizedIncomingMessages) {
      messageMap.set(messageEntry.id, messageEntry);
    }

    return Array.from(messageMap.values())
      .sort((firstMessage, secondMessage) => firstMessage.timestamp - secondMessage.timestamp)
      .slice(-CHAT_HISTORY_LIMIT);
  }, [chatMessages, persistedMessages]);

  const mentionTerms = useMemo(() => {
    const terms = [
      localParticipant.identity,
      localParticipant.name,
      participantIdentity,
      "you",
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);

    return Array.from(new Set(terms));
  }, [localParticipant.identity, localParticipant.name, participantIdentity]);

  const messagesWithMentionState = useMemo(() => {
    return mergedMessages.map((messageEntry) => {
      const lowerMessage = String(messageEntry.message || "").toLowerCase();
      const isMentioned = mentionTerms.some((term) => {
        if (!term || term.length < 2) {
          return false;
        }

        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const mentionPattern = new RegExp(`(^|\\s|[@#])${escapedTerm}(\\b|\\s|$)`, "i");
        return mentionPattern.test(lowerMessage);
      });

      return {
        ...messageEntry,
        isMentioned,
      };
    });
  }, [mentionTerms, mergedMessages]);

  useEffect(() => {
    if (!mergedMessages.length) {
      clearPersistedList(chatStorageKey);
      return;
    }

    writePersistedList(chatStorageKey, mergedMessages);
  }, [chatStorageKey, mergedMessages]);

  const unreadCount = useMemo(() => {
    if (!messagesWithMentionState.length) {
      return 0;
    }

    let count = 0;
    for (let index = lastReadMessageIndex + 1; index < messagesWithMentionState.length; index += 1) {
      const messageEntry = messagesWithMentionState[index];
      if (messageEntry.fromIdentity !== localParticipant.identity) {
        count += 1;
      }
    }
    return count;
  }, [lastReadMessageIndex, localParticipant.identity, messagesWithMentionState]);

  useEffect(() => {
    const containerElement = scrollContainerRef.current;
    if (!containerElement) {
      return;
    }

    containerElement.scrollTop = containerElement.scrollHeight;
    setLastReadMessageIndex(messagesWithMentionState.length - 1);
  }, [messagesWithMentionState.length]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmedDraft = draftMessage.trim();
    if (!trimmedDraft) {
      return;
    }

    setSendError("");
    try {
      await send(trimmedDraft);
      setDraftMessage("");
      setLastReadMessageIndex(messagesWithMentionState.length);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Unable to send message.");
    }
  };

  const resizeDraftInput = () => {
    const inputElement = draftInputRef.current;
    if (!inputElement) {
      return;
    }

    inputElement.style.height = "auto";
    inputElement.style.height = `${Math.min(inputElement.scrollHeight, 180)}px`;
  };

  const handleDraftChange = (event) => {
    setDraftMessage(event.target.value);
    resizeDraftInput();
  };

  const handleDraftKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isSending && draftMessage.trim()) {
        event.currentTarget.form?.requestSubmit();
      }
    }
  };

  useEffect(() => {
    resizeDraftInput();
  }, [draftMessage]);

  return (
    <section className="conference-side-panel chat-panel">
      <div className="chat-panel-header">
        <div className="chat-panel-title-row">
          <h2>Chat</h2>
          {unreadCount > 0 ? <span className="chat-unread-badge">{unreadCount}</span> : null}
        </div>
        <p>Messages are kept in this tab until you leave the room.</p>
      </div>

      <div className="chat-panel-list" ref={scrollContainerRef}>
        {messagesWithMentionState.length ? (
          messagesWithMentionState.map((messageEntry) => {
            const isOwnMessage = messageEntry.fromIdentity === localParticipant.identity;
            return (
              <article
                className={`chat-panel-entry ${isOwnMessage ? "is-own" : "is-remote"} ${
                  messageEntry.isMentioned && !isOwnMessage ? "is-mention" : ""
                }`}
                key={messageEntry.id}
              >
                <div className="chat-panel-entry-meta">
                  <strong>{isOwnMessage ? "You" : messageEntry.fromName}</strong>
                  <span>{new Date(messageEntry.timestamp).toLocaleTimeString()}</span>
                </div>
                <p>{messageEntry.message}</p>
                {messageEntry.isMentioned && !isOwnMessage ? (
                  <span className="chat-mention-chip">Mention</span>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="chat-panel-empty">No messages yet. Start the conversation.</p>
        )}
      </div>

      <form className="chat-panel-form" onSubmit={handleSubmit}>
        <label htmlFor="chat-draft-input">Message</label>
        <textarea
          ref={draftInputRef}
          id="chat-draft-input"
          value={draftMessage}
          onChange={handleDraftChange}
          onKeyDown={handleDraftKeyDown}
          placeholder="Type a message"
          rows={2}
        />
        <div className="chat-panel-form-actions">
          <button type="submit" className="secondary-btn" disabled={isSending || !draftMessage.trim()}>
            {isSending ? "Sending..." : "Send"}
          </button>
          {sendError ? <span className="chat-panel-error">{sendError}</span> : null}
        </div>
      </form>
    </section>
  );
}

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

function TranscriptPanel({ roomName, participantIdentity }) {
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const transcriptions = useTranscriptions();
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [translatedEntries, setTranslatedEntries] = useState({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [localTranscriptEntries, setLocalTranscriptEntries] = useState([]);
  const [speechStatus, setSpeechStatus] = useState(() => {
    if (typeof window === "undefined") {
      return "unsupported";
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return SpeechRecognition ? "idle" : "unsupported";
  });
  const { textStreams } = useTextStream(TRANSCRIPT_TOPIC);
  const transcriptStorageKey = useMemo(
    () => getTranscriptStorageKey(roomName, participantIdentity),
    [roomName, participantIdentity]
  );
  const [persistedTranscriptHistory] = useState(() => readPersistedList(transcriptStorageKey));

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
    const streamItems = textStreams.map((item, index) => {
      const rawText = item?.text ?? String(item ?? "");
      const speakerIdentity = item?.participantInfo?.identity ?? "Speaker";
      const speaker =
        participantLabelByIdentity.get(speakerIdentity) || speakerIdentity || "Speaker";
      const timestampValue = Number(item?.streamInfo?.timestamp ?? index);
      const streamId = item?.streamInfo?.id ?? "stream";
      const stableId = `${streamId}:${speakerIdentity}:${timestampValue}:${rawText}`;

      return {
        id: item?.id ?? item?.sid ?? stableId,
        text: String(rawText).trim(),
        speaker: String(speaker),
        timestamp: timestampValue,
        source: "shared-text-stream",
        fromIdentity: speakerIdentity,
      };
    });

    const hookItems = transcriptions.map((item, index) => {
      const rawText =
        item?.text ?? item?.transcript ?? item?.message ?? item?.content ?? String(item ?? "");
      const speakerIdentity =
        item?.participantInfo?.identity ??
        item?.participantIdentity ??
        item?.participant?.identity ??
        item?.identity ??
        "Speaker";
      const speaker =
        participantLabelByIdentity.get(speakerIdentity) || speakerIdentity || "Speaker";
      const timestampValue = Number(
        item?.streamInfo?.timestamp ?? item?.timestamp ?? item?.time ?? index
      );

      return {
        id: item?.id ?? item?.sid ?? `hook-${speakerIdentity}-${timestampValue}-${rawText}`,
        text: String(rawText).trim(),
        speaker: String(speaker),
        timestamp: timestampValue,
        source: "use-transcriptions",
        fromIdentity: speakerIdentity,
      };
    });

    const combinedItems = [...streamItems, ...hookItems, ...localTranscriptEntries].filter(
      (entry) => entry.text
    );

    const dedupedMap = new Map();
    for (const entry of combinedItems) {
      const dedupeKey = `${entry.source}:${entry.fromIdentity}:${entry.timestamp}:${entry.text}`;
      if (!dedupedMap.has(dedupeKey)) {
        dedupedMap.set(dedupeKey, entry);
      }
    }

    return Array.from(dedupedMap.values()).sort(
      (firstEntry, secondEntry) => firstEntry.timestamp - secondEntry.timestamp
    );
  }, [localTranscriptEntries, participantLabelByIdentity, textStreams, transcriptions]);

  const transcriptHistory = useMemo(() => {
    const transcriptMap = new Map(persistedTranscriptHistory.map((entry) => [entry.id, entry]));
    for (const transcriptEntry of transcriptItems) {
      transcriptMap.set(transcriptEntry.id, transcriptEntry);
    }

    return Array.from(transcriptMap.values())
      .sort((firstEntry, secondEntry) => firstEntry.timestamp - secondEntry.timestamp)
      .slice(-TRANSCRIPT_HISTORY_LIMIT);
  }, [persistedTranscriptHistory, transcriptItems]);

  useEffect(() => {
    if (!transcriptHistory.length) {
      clearPersistedList(transcriptStorageKey);
      return;
    }

    writePersistedList(transcriptStorageKey, transcriptHistory);
  }, [transcriptHistory, transcriptStorageKey]);

  const displayedTranscriptText = useMemo(() => {
    return transcriptHistory
      .map((entry) => {
        const lineText = targetLanguage === "en" ? entry.text : translatedEntries[entry.id] || entry.text;
        const timeLabel = new Date(entry.timestamp).toLocaleTimeString();

        return `[${timeLabel}] ${entry.speaker}: ${lineText}`;
      })
      .join("\n");
  }, [targetLanguage, transcriptHistory, translatedEntries]);

  const handleDownloadTranscript = () => {
    if (!transcriptHistory.length) {
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

    let isMounted = true;
    let restartTimer = null;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setSpeechStatus("listening");
    recognition.onerror = (event) => {
      setSpeechStatus("error");
      setCaptureError(event?.error ? `Speech capture error: ${event.error}` : "Speech capture failed.");
    };
    recognition.onend = () => {
      if (!isMounted) {
        setSpeechStatus("stopped");
        return;
      }

      setSpeechStatus("restarting");
      restartTimer = window.setTimeout(() => {
        try {
          recognition.start();
        } catch {
          setSpeechStatus("error");
        }
      }, 350);
    };
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

        const capturedAt = Date.now();
        setLocalTranscriptEntries((previousEntries) => {
          const nextEntries = [
            ...previousEntries,
            {
              id: `local-${localParticipant.identity}-${capturedAt}-${index}`,
              text: transcriptText,
              speaker: localParticipant.name || localParticipant.identity || "You",
              timestamp: capturedAt,
              source: "local-caption",
              fromIdentity: localParticipant.identity,
            },
          ];

          return nextEntries.slice(-TRANSCRIPT_HISTORY_LIMIT);
        });

        try {
          await localParticipant.sendText(transcriptText, { topic: TRANSCRIPT_TOPIC });
          setCaptureError("");
        } catch (error) {
          setSpeechStatus("error");
          setCaptureError(
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
      isMounted = false;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      if (restartTimer) {
        window.clearTimeout(restartTimer);
      }
      try {
        recognition.stop();
      } catch {
        // ignore stop errors from browser speech recognition
      }
    };
  }, [localParticipant]);

  useEffect(() => {
    const translateEntries = async () => {
      if (!transcriptHistory.length) {
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
          transcriptHistory.map(async (entry) => {
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
  }, [targetLanguage, transcriptApiUrl, transcriptHistory]);

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
            disabled={!transcriptHistory.length}
          >
            Download TXT
          </button>
        </div>
      </div>

      <div className="transcript-status-row">
        <span>
          {isTranslating
            ? "Translating…"
            : `${transcriptHistory.length} transcript line(s)`}
        </span>
        <span className="transcript-source-state">
          {speechStatus === "unsupported"
            ? "Browser captions unavailable; shared room transcript still plays back"
            : speechStatus === "listening"
              ? "Capturing microphone and publishing to the room"
              : speechStatus === "restarting"
                ? "Reconnecting speech capture"
              : speechStatus === "error"
                ? "Transcript capture paused"
                : "Ready to capture and publish shared captions"}
        </span>
        {translationError ? <span className="transcript-error">{translationError}</span> : null}
        {captureError ? <span className="transcript-error">{captureError}</span> : null}
      </div>

      <div className="transcript-list">
        {transcriptHistory.length ? (
          transcriptHistory.map((entry) => (
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

function CustomConferenceLayout({ meetingView, panelMode, insightsMode, roomName, participantIdentity }) {
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
              <ChatPanel
                key={`chat-${roomName}-${participantIdentity}`}
                roomName={roomName}
                participantIdentity={participantIdentity}
              />
            ) : sidePanelMode === "transcript" ? (
              <TranscriptPanel
                key={`transcript-${roomName}-${participantIdentity}`}
                roomName={roomName}
                participantIdentity={participantIdentity}
              />
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
  const participantIdentity = sessionInfo.participantIdentity;

  const handleLeave = () => {
    clearPersistedList(getChatStorageKey(currentRoomName, participantIdentity));
    clearPersistedList(getTranscriptStorageKey(currentRoomName, participantIdentity));
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

          <CustomConferenceLayout
            meetingView={meetingView}
            panelMode={panelMode}
            insightsMode={insightsMode}
            roomName={currentRoomName}
            participantIdentity={participantIdentity}
          />
          <ConnectionStateToast />
          <RoomAudioRenderer />
        </div>
      </LiveKitRoom>
    </div>
  );
}

export default RoomPage;
