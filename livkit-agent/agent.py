import os
from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli, llm
from livekit.plugins import aws

load_dotenv()

LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")
AGENT_NAME = os.getenv("AGENT_NAME", "demo-voice-agent")
AGENT_IDENTITY = os.getenv("AGENT_IDENTITY", "demo-voice-agent")
AGENT_PROMPT = os.getenv(
    "AGENT_PROMPT",
    "You are a helpful voice assistant for a LiveKit demo room. Keep replies short and friendly.",
)


class DemoVoiceAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=AGENT_PROMPT)


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    session = AgentSession(
        stt=aws.stt.STT(region=os.getenv("AWS_REGION", "us-east-1")),
        llm=aws.llm.LLM(
            model=os.getenv("AWS_BEDROCK_MODEL_ID", "amazon.nova-sonic-v1:0"),
            region=os.getenv("AWS_REGION", "us-east-1"),
        ),
        tts=aws.tts.TTS(
            voice=os.getenv("AWS_TTS_VOICE", "Ruth"),
            region=os.getenv("AWS_REGION", "us-east-1"),
        ),
    )

    agent = DemoVoiceAgent()
    await session.start(
        agent=agent,
        room=ctx.room,
        room_input_options=llm.RoomInputOptions(),
    )

    await ctx.room.local_participant.set_attributes({"agent_name": AGENT_NAME})
    await session.generate_reply(
        "Hello! I am your LiveKit voice assistant. Ask me anything about this demo room."
    )


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            ws_url=LIVEKIT_URL,
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET,
            agent_name=AGENT_NAME,
            agent_id=AGENT_IDENTITY,
        )
    )
