import prisma from "../config/prisma.js";
import pusher from "../config/pusher.js";
import { createRoom, joinRoom, getRoomState } from "../services/game/roomService.js";
import { startGame } from "../services/game/gameService.js";
import { submitVote } from "../services/game/voteService.js";

// ─── PHASE GUARD MAP ──────────────────────────────────────────────────────────
// Each vote_type is only valid in certain game phases
const VOTE_TYPE_PHASE = {
  DAY_LYNCH: "VOTING",
  MAFIA_TARGET: "NIGHT",
  DOC_SAVE: "NIGHT",
  COP_INVESTIGATE: "NIGHT",
  NURSE_ACTION: "NIGHT",
};

// ─── CREATE ROOM ──────────────────────────────────────────────────────────────

export const handleCreateRoom = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { room_size } = req.body; // "FIVE" | "EIGHT" | "TWELVE"

    if (!["FIVE", "EIGHT", "TWELVE"].includes(room_size)) {
      return res.status(400).json({ error: "room_size must be FIVE, EIGHT, or TWELVE" });
    }

    const code = await createRoom(userId, room_size);

    await pusher.trigger(`room-${code}`, "room-created", {
      roomCode: code,
      hostId: userId,
    });

    return res.status(201).json({ success: true, roomCode: code });
  } catch (err) {
    console.error("[createRoom]", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── JOIN ROOM ────────────────────────────────────────────────────────────────

export const handleJoinRoom = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { room_code } = req.body;

    if (!room_code) return res.status(400).json({ error: "room_code is required" });

    await joinRoom(room_code, userId);

    // Fetch user name for broadcast
    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { full_name: true },
    });

    await pusher.trigger(`room-${room_code}`, "player-joined", {
      userId,
      name: user?.full_name,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[joinRoom]", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── GET ROOM STATE ───────────────────────────────────────────────────────────

export const handleGetRoom = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { code } = req.params;

    const state = await getRoomState(code, userId);
    if (!state) return res.status(404).json({ error: "Room not found" });

    return res.status(200).json(state);
  } catch (err) {
    console.error("[getRoom]", err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ─── START GAME ───────────────────────────────────────────────────────────────

export const handleStartGame = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { room_code } = req.body;

    if (!room_code) return res.status(400).json({ error: "room_code is required" });

    await startGame(room_code, userId);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[startGame]", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── VOTE / NIGHT ACTION ──────────────────────────────────────────────────────

export const handleVote = async (req, res) => {
  try {
    const voterId = req.user.userId;
    const { room_code, target_id, vote_type } = req.body;

    if (!room_code || !vote_type) {
      return res.status(400).json({ error: "room_code and vote_type are required" });
    }

    // Phase guard
    const room = await prisma.gameRoom.findUnique({
      where: { room_code },
      select: { status: true, round: true },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });

    const requiredPhase = VOTE_TYPE_PHASE[vote_type];
    if (!requiredPhase) return res.status(400).json({ error: `Unknown vote_type: ${vote_type}` });
    if (room.status !== requiredPhase) {
      return res.status(409).json({
        error: `${vote_type} is only valid during ${requiredPhase} phase (current: ${room.status})`,
      });
    }

    await submitVote({
      roomCode: room_code,
      round: room.round,
      voterId,
      targetId: target_id ?? null,
      voteType: vote_type,
    });

    // ── Cop gets instant private investigation result ─────────────────────────
    if (vote_type === "COP_INVESTIGATE" && target_id) {
      const targetPlayer = await prisma.gamePlayer.findUnique({
        where: { room_code_user_id: { room_code, user_id: target_id } },
        select: { role: true },
      });
      const isMafia = ["MAFIA", "MAFIA_HELPER"].includes(targetPlayer?.role);
      // Send result privately — only the Cop sees this
      await pusher.trigger(`private-${voterId}`, "investigation-result", {
        roomCode: room_code,
        round: room.round,
        targetUserId: target_id,
        result: isMafia ? "MAFIA" : "INNOCENT",
      });
    }

    // Broadcast that a vote was cast (not who — just that someone did)
    await pusher.trigger(`game-${room_code}`, "vote-updated", {
      voterId,
      voteType: vote_type,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[vote]", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── CHAT ─────────────────────────────────────────────────────────────────────

export const handleChat = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { room_code, message } = req.body;

    if (!room_code || !message?.trim()) {
      return res.status(400).json({ error: "room_code and message are required" });
    }

    const room = await prisma.gameRoom.findUnique({
      where: { room_code },
      select: { status: true },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.status !== "DISCUSSION") {
      return res.status(409).json({ error: "Chat is only allowed during DISCUSSION phase" });
    }

    // Check player is alive
    const player = await prisma.gamePlayer.findUnique({
      where: { room_code_user_id: { room_code, user_id: userId } },
      include: { user: { select: { full_name: true } } },
    });
    if (!player) return res.status(403).json({ error: "Not in this room" });
    if (player.status !== "ALIVE") return res.status(403).json({ error: "Eliminated players cannot chat" });

    await pusher.trigger(`game-${room_code}`, "chat-message", {
      userId,
      name: player.user.full_name,
      message: message.trim(),
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[chat]", err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ─── PUSHER AUTH ──────────────────────────────────────────────────────────────

export const handlePusherAuth = async (req, res) => {
  try {
    const socketId = req.body.socket_id;
    const channel = req.body.channel_name;
    const userId = req.user.userId;

    if (!socketId || !channel) {
      return res.status(400).json({ error: "socket_id and channel_name are required" });
    }

    // Only allow players to auth private-{theirOwnUserId} channels
    if (channel.startsWith("private-") && !channel.includes(userId)) {
      return res.status(403).json({ error: "Cannot subscribe to another player's private channel" });
    }

    const auth = pusher.authorizeChannel(socketId, channel);
    return res.status(200).json(auth);
  } catch (err) {
    console.error("[pusherAuth]", err.message);
    return res.status(500).json({ error: err.message });
  }
};
