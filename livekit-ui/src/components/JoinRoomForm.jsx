import { useState } from "react";

function JoinRoomForm({
  onJoin,
  onRefreshRooms,
  onCreateRoom,
  rooms,
  isRoomsLoading,
  isCreatingRoom,
  isSubmitting,
}) {
  const [roomName, setRoomName] = useState("hello");
  const [participantIdentity, setParticipantIdentity] = useState("user");
  const [participantName, setParticipantName] = useState("sundhar");

  const handleSubmit = (event) => {
    event.preventDefault();

    onJoin({
      room_name: roomName.trim(),
      participant_identity: participantIdentity.trim(),
      participant_name: participantName.trim(),
    });
  };

  return (
    <form className="join-form" onSubmit={handleSubmit}>
      <h1>Join LiveKit Room</h1>

      <label htmlFor="room-name">Room name</label>
      <input
        id="room-name"
        type="text"
        list="room-name-suggestions"
        value={roomName}
        onChange={(event) => setRoomName(event.target.value)}
        required
      />
      <datalist id="room-name-suggestions">
        {rooms.map((room) => (
          <option value={room} key={room} />
        ))}
      </datalist>

      <div className="join-actions-row">
        <button
          type="button"
          className="secondary-btn"
          onClick={onRefreshRooms}
          disabled={isRoomsLoading || isSubmitting}
        >
          {isRoomsLoading ? "Refreshing..." : "Refresh rooms"}
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => onCreateRoom(roomName.trim())}
          disabled={!roomName.trim() || isCreatingRoom || isSubmitting}
        >
          {isCreatingRoom ? "Creating..." : "Create room"}
        </button>
      </div>

      <label htmlFor="participant-identity">Participant identity</label>
      <input
        id="participant-identity"
        type="text"
        value={participantIdentity}
        onChange={(event) => setParticipantIdentity(event.target.value)}
        required
      />

      <label htmlFor="participant-name">Participant name</label>
      <input
        id="participant-name"
        type="text"
        value={participantName}
        onChange={(event) => setParticipantName(event.target.value)}
        required
      />

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Joining..." : "Join Room"}
      </button>

      <p className="rooms-hint">
        Available rooms: {rooms.length ? rooms.join(", ") : "none yet"}
      </p>
    </form>
  );
}

export default JoinRoomForm;
