import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import JoinRoomForm from "../components/JoinRoomForm";
import { appConfig } from "../config";
import { saveLastSession } from "../sessionStorage";

function JoinPage() {
  const navigate = useNavigate();
  const [joinState, setJoinState] = useState({
    isSubmitting: false,
    error: "",
  });
  const [roomsState, setRoomsState] = useState({
    rooms: [],
    isLoading: false,
    isCreating: false,
    error: "",
  });

  const tokenApiUrl = useMemo(
    () => `${appConfig.backendHttpUrl}/livekit/token`,
    []
  );
  const roomsApiUrl = useMemo(
    () => `${appConfig.backendHttpUrl}/livekit/rooms`,
    []
  );

  const normalizeRooms = (rawResponse) => {
    const payload = rawResponse?.rooms;
    const roomItems = Array.isArray(payload?.rooms)
      ? payload.rooms
      : Array.isArray(payload)
        ? payload
        : [];

    return Array.from(
      new Set(
        roomItems
          .map((room) => {
            if (typeof room === "string") {
              return room.trim();
            }

            if (room && typeof room === "object") {
              return String(room.name || room.room || "").trim();
            }

            return "";
          })
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  };

  const fetchRooms = async () => {
    setRoomsState((previous) => ({
      ...previous,
      isLoading: true,
      error: "",
    }));

    try {
      const res = await fetch(roomsApiUrl, {
        headers: {
          accept: "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Unable to fetch rooms (${res.status})`);
      }

      const data = await res.json();
      setRoomsState((previous) => ({
        ...previous,
        isLoading: false,
        rooms: normalizeRooms(data),
        error: "",
      }));
    } catch (error) {
      setRoomsState((previous) => ({
        ...previous,
        isLoading: false,
        error: error instanceof Error ? error.message : "Unable to fetch rooms.",
      }));
    }
  };

  const createRoom = async (roomName) => {
    if (!roomName) {
      return;
    }

    setRoomsState((previous) => ({
      ...previous,
      isCreating: true,
      error: "",
    }));

    try {
      const res = await fetch(roomsApiUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ room_name: roomName }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(errorBody || `Unable to create room (${res.status})`);
      }

      await fetchRooms();
      setRoomsState((previous) => ({
        ...previous,
        isCreating: false,
      }));
      setJoinState((previous) => ({
        ...previous,
        error: "",
      }));
    } catch (error) {
      setRoomsState((previous) => ({
        ...previous,
        isCreating: false,
        error: error instanceof Error ? error.message : "Unable to create room.",
      }));
    }
  };

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
      const roomName = payload.room_name.trim();
      const participantIdentity = payload.participant_identity.trim();
      const participantName = payload.participant_name.trim();

      const roomExists = roomsState.rooms.includes(roomName);
      if (!roomExists) {
        await createRoom(roomName);
      }

      const res = await fetch(tokenApiUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room_name: roomName,
          participant_identity: participantIdentity,
          participant_name: participantName,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(errorBody || `Failed to create token (status ${res.status}).`);
      }

      const data = await res.json();
      saveLastSession({
        roomName,
        participantIdentity,
        participantName,
      });
      navigate(`/room/${encodeURIComponent(roomName)}`, {
        state: {
          token: data.token,
          roomName,
          participantIdentity,
          participantName,
        },
      });
    } catch (error) {
      setJoinState({
        isSubmitting: false,
        error: error instanceof Error ? error.message : "Unable to join room.",
      });
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  return (
    <main className="join-page">
      <JoinRoomForm
        onJoin={handleJoin}
        onRefreshRooms={fetchRooms}
        onCreateRoom={createRoom}
        rooms={roomsState.rooms}
        isRoomsLoading={roomsState.isLoading}
        isCreatingRoom={roomsState.isCreating}
        isSubmitting={joinState.isSubmitting}
      />
      {joinState.error ? <p className="join-error">{joinState.error}</p> : null}
      {roomsState.error ? <p className="join-error">{roomsState.error}</p> : null}
    </main>
  );
}

export default JoinPage;
