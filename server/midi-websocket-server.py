import asyncio
import json
import mido
from aiohttp import web
import aiohttp_cors

# Global variables
selected_midi_device = None
websocket_clients = set()
message_queue = asyncio.Queue()
main_loop = None  # 🚀 Store the main event loop globally

async def broadcast_messages():
    """Continuously broadcast messages from the queue to all WebSocket clients."""
    print("🚀 MIDI broadcasting task STARTED!")  # Confirm task starts!
    while True:
        message = await message_queue.get()
        print(f"📤 Broadcasting MIDI: {message}")  # Confirm messages are dequeued

        if websocket_clients:
            for ws in list(websocket_clients):
                if not ws.closed:
                    try:
                        await ws.send_str(message)
                        print(f"✅ Sent MIDI to WebSocket: {message}")
                    except Exception as e:
                        print(f"⚠️ WebSocket error: {e}")
        else:
            print(f"❌ No clients to broadcast: {message}")

def midi_callback(message):
    """🚀 Ensure the event loop is accessible and put messages in the queue."""
    global main_loop
    print(message)
    message_str = str(message)
    print(f"🎹 Received MIDI: {message_str}")

    if main_loop is not None and main_loop.is_running():
        main_loop.call_soon_threadsafe(message_queue.put_nowait, message_str)
    else:
        print("❌ ERROR: Event loop is not running! MIDI message dropped!")

async def list_midi_devices(request):
    """Return a JSON list of available MIDI input devices."""
    devices = mido.get_input_names()
    return web.json_response({"devices": devices})

async def select_midi_device(request):
    """Select a MIDI device and attach the callback."""
    global selected_midi_device
    data = await request.json()
    device_name = data.get("device")
    print(mido.get_input_names())

    if device_name not in mido.get_input_names():
        return web.json_response({"error": "Device not found"}, status=400)

    if selected_midi_device:
        selected_midi_device.close()

    selected_midi_device = mido.open_input(device_name, callback=midi_callback)
    print(f"✅ Connected to MIDI device: {device_name}")

    return web.json_response({"message": f"Connected to {device_name}"})

async def midi_websocket_handler(request):
    """Handles WebSocket connections."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    websocket_clients.add(ws)
    print(f"🔗 WebSocket client connected ({len(websocket_clients)} total)")

    try:
        async for _ in ws:
            pass
    except Exception as e:
        print(f"⚠️ WebSocket error: {e}")
    finally:
        websocket_clients.discard(ws)
        print(f"❌ WebSocket client disconnected ({len(websocket_clients)} remaining)")
        await ws.close()

    return ws

# 🚀 Create Web Application
app = web.Application()

# Enable CORS
cors = aiohttp_cors.setup(app, defaults={
    "*": aiohttp_cors.ResourceOptions(
        allow_credentials=True,
        expose_headers="*",
        allow_headers="*",
    )
})

# Define Routes
routes = [
    web.get('/midi/devices', list_midi_devices),
    web.post('/midi/select', select_midi_device),
    web.get('/midi/stream', midi_websocket_handler),
]

# Apply CORS to Routes
for route in routes:
    cors.add(app.router.add_route(route.method, route.path, route.handler))

async def on_startup(app):
    """🚀 Ensure the main event loop is stored properly."""
    global main_loop
    main_loop = asyncio.get_running_loop()  # ✅ Store the main event loop
    print("🚀 Main event loop stored!")

    # Start MIDI broadcasting
    asyncio.create_task(broadcast_messages())

app.on_startup.append(on_startup)

# 🚀 Start the Server
if __name__ == '__main__':
    print("🚀 Server running on port 8080...")
    web.run_app(app, port=8080)
