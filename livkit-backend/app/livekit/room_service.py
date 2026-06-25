from livekit import api
from google.protobuf.json_format import MessageToDict
from google.protobuf.message import Message
 
from app.core.config import settings
 
 
def _create_livekit_api_client() -> api.LiveKitAPI:
    return api.LiveKitAPI(
        url=settings.LIVEKIT_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    )
 
 
def _protobuf_to_dict(value):
    if isinstance(value, Message):
        return MessageToDict(
            value,
            preserving_proto_field_name=True,
        )
 
    if isinstance(value, list):
        return [_protobuf_to_dict(item) for item in value]
 
    if isinstance(value, dict):
        return {key: _protobuf_to_dict(item) for key, item in value.items()}
 
    return value
 
 
async def create_livekit_room(room_name: str):
    """
    Create a LiveKit room.
    """
 
    lkapi = _create_livekit_api_client()
 
    try:
        room = await lkapi.room.create_room(
            api.CreateRoomRequest(
                name=room_name,
                max_participants=5,
            )
        )
        return _protobuf_to_dict(room)
    finally:
        await lkapi.aclose()
 
 
async def list_livekit_rooms():
    """
    List all LiveKit rooms.
    """
 
    lkapi = _create_livekit_api_client()
 
    try:
        rooms = await lkapi.room.list_rooms(
            api.ListRoomsRequest()
        )
        serialized = _protobuf_to_dict(rooms)
        if isinstance(serialized, dict):
            return serialized.get("rooms", [])
 
        return serialized
    finally:
        await lkapi.aclose()
 
 
async def delete_livekit_room(room_name: str):
    """
    Delete a LiveKit room.
    """
 
    lkapi = _create_livekit_api_client()
 
    try:
        response = await lkapi.room.delete_room(
            api.DeleteRoomRequest(
                room=room_name,
            )
        )
        return _protobuf_to_dict(response)
    finally:
        await lkapi.aclose()