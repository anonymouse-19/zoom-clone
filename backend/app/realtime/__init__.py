"""
Live-meeting code: the WebSocket "room" that connects the people in one meeting.

Not business rules (those stay in `services/`) and not plain HTTP (`routers/`): this
package only knows who is connected right now and how to pass messages between them.

- messages.py      every message that can cross the WebSocket, as typed models
- room_manager.py  who is connected to which meeting, and how to send to them
- room_handler.py  what happens from one browser connecting until it leaves
"""
