import { file, serve, type ServerWebSocket } from "bun";

interface Player {
  playerId: string;
  currentRoom: string;
}

const rooms: Record<string, Player[]> = {
  main: [],
  sala1: [],
  sala2: []
};

interface CustomServerWebSocket extends ServerWebSocket {
  id: string;
  currentRoom: string;
}

const uuidV4 = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    let r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const app = serve({
  websocket: {
    open: (ws: CustomServerWebSocket) => {
      ws.id = uuidV4();
      ws.currentRoom = "main";

      rooms["main"].push({
        playerId: ws.id,
        currentRoom: "main",
      });

      ws.subscribe("main");
      ws.send(JSON.stringify({ type: "userId", id: ws.id }));
      ws.send(JSON.stringify({ type: "currentPlayers", players: rooms["main"] }));
      ws.send(JSON.stringify({ type: "currentRoom", room: "main" }));
      ws.publish("main", JSON.stringify({ type: "newPlayer", newPlayer: ws.id }));

      console.log(`${ws.id} connected`);
    },
    message: (ws: CustomServerWebSocket, message: any) => {
      const { type, room, body } = JSON.parse(message);
      switch (type) {
        case "message":
          const targetRoom = room || ws.currentRoom;
          ws.publish(targetRoom, JSON.stringify({ id: ws.id, type: "message", body }));
          break;

        case "joinRoom":
          if (ws.currentRoom !== room) {
            // Remove player from current room
            rooms[ws.currentRoom] = rooms[ws.currentRoom].filter(p => p.playerId !== ws.id);
            app.publish(ws.currentRoom, JSON.stringify({ type: "currentPlayers", players: rooms[ws.currentRoom] }));
            app.publish(ws.currentRoom, JSON.stringify({ type: "playerLeft", player: ws.id }));
            ws.unsubscribe(ws.currentRoom);

            // Add player to the new room
            if (!rooms[room]) {
              rooms[room] = [];
            }
            rooms[room].push({
              playerId: ws.id,
              currentRoom: room,
            });

            ws.currentRoom = room;
            ws.subscribe(room);
            ws.send(JSON.stringify({ type: "currentPlayers", players: rooms[room] }));
            ws.send(JSON.stringify({ type: "currentRoom", room: room }));
            ws.publish(room, JSON.stringify({ type: "newPlayer", newPlayer: ws.id }));

            console.log(`${ws.id} has joined the room ${room}`);
          }
          break;

        case "leaveRoom":
          if (ws.currentRoom !== "main") {
            // Remove player from the current room
            rooms[ws.currentRoom] = rooms[ws.currentRoom].filter(p => p.playerId !== ws.id);
            app.publish(ws.currentRoom, JSON.stringify({ type: "currentPlayers", players: rooms[ws.currentRoom] }));
            app.publish(ws.currentRoom, JSON.stringify({ type: "playerLeft", player: ws.id }));
            ws.unsubscribe(ws.currentRoom);

            // Join main room
            rooms["main"].push({
              playerId: ws.id,
              currentRoom: "main",
            });

            ws.currentRoom = "main";
            ws.subscribe("main");
            ws.send(JSON.stringify({ type: "currentPlayers", players: rooms["main"] }));
            ws.send(JSON.stringify({ type: "currentRoom", room: "main" }));
            ws.publish("main", JSON.stringify({ type: "newPlayer", newPlayer: ws.id }));

            console.log(`${ws.id} returned to the main room`);
          }
          break;
      }
    },
    close: (ws: CustomServerWebSocket) => {
      for (const room in rooms) {
        rooms[room] = rooms[room].filter(player => player.playerId !== ws.id);
        app.publish(room, JSON.stringify({ type: "currentPlayers", players: rooms[room] }));
        if (room !== "main" && rooms[room].length === 0) {
          delete rooms[room];
        }
      }

      if (ws.currentRoom !== "main") {
        app.publish(ws.currentRoom, JSON.stringify({ type: "playerLeft", player: ws.id }));
      }

      console.log(`${ws.id} disconnected`);
    },
  },
  fetch(req, server) {
    const { url, method } = req;
    const { pathname } = new URL(url);

    const html = file("index.html");
    if (pathname === "/" && method == "GET") {
      server.upgrade(req);
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      });
    }
    return new Response("Hello World");
  },
});

console.log(app.port);
