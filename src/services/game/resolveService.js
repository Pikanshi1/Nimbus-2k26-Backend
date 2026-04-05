import prisma from "../../config/prisma.js";
import pusher from "../../config/pusher.js";
import {
  getMafiaTarget,
  getDoctorSave,
  getNurseAction,
  tallyDayVotes,
  findLynchTarget,
} from "./voteService.js";

// ─── PHASE DURATIONS (ms) ─────────────────────────────────────────────────────
export const PHASE_DURATION = {
  NIGHT: 15_000,
  DISCUSSION: 30_000,
  VOTING: 10_000,
  REVEAL: 3_000,
};

// ─── WIN CHECK ────────────────────────────────────────────────────────────────

/**
 * Checks whether the game has ended after a kill.
 * Returns "MAFIA" | "CITIZENS" | null.
 */
async function checkWinCondition(roomCode) {
  const alive = await prisma.gamePlayer.findMany({
    where: { room_code: roomCode, status: "ALIVE" },
    select: { role: true },
  });

  const aliveMafia = alive.filter((p) =>
    ["MAFIA", "MAFIA_HELPER"].includes(p.role)
  ).length;
  const aliveOthers = alive.length - aliveMafia;

  if (aliveMafia === 0) return "CITIZENS";
  if (aliveMafia >= aliveOthers) return "MAFIA";
  return null;
}

// ─── NIGHT RESOLUTION ────────────────────────────────────────────────────────

/**
 * Resolves NIGHT phase:
 *   1. Mafia picks a target
 *   2. Doctor can save that target
 *   3. Nurse can assist the doctor (backup save)
 *   4. Mark kill or skip
 * Transitions to DISCUSSION.
 */
async function resolveNight(room) {
  const { room_code, round } = room;

  const mafiaTargetId = await getMafiaTarget(room_code, round);
  const doctorSaveId = await getDoctorSave(room_code, round);
  const nurseActionId = await getNurseAction(room_code, round);

  let killed = null;

  if (mafiaTargetId) {
    const saved = mafiaTargetId === doctorSaveId || mafiaTargetId === nurseActionId;
    if (!saved) {
      // Kill the target
      await prisma.gamePlayer.update({
        where: { id: mafiaTargetId },
        data: { status: "ELIMINATED" },
      });
      killed = mafiaTargetId;
    }
  }

  // Check win before transitioning
  const winner = await checkWinCondition(room_code);
  if (winner) {
    await endGame(room_code, winner);
    return;
  }

  // Advance to DISCUSSION
  const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.DISCUSSION);
  await prisma.gameRoom.update({
    where: { room_code },
    data: { status: "DISCUSSION", phase_ends_at: phaseEndsAt },
  });

  await pusher.trigger(`game-${room_code}`, "phase-resolved", {
    phase: "DISCUSSION",
    round,
    killedPlayerId: killed,
    phaseEndsAt: phaseEndsAt.toISOString(),
  });
}

// ─── DISCUSSION → VOTING ──────────────────────────────────────────────────────

async function resolveDiscussion(room) {
  const { room_code, round } = room;

  const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.VOTING);
  await prisma.gameRoom.update({
    where: { room_code },
    data: { status: "VOTING", phase_ends_at: phaseEndsAt },
  });

  await pusher.trigger(`game-${room_code}`, "phase-resolved", {
    phase: "VOTING",
    round,
    phaseEndsAt: phaseEndsAt.toISOString(),
  });
}

// ─── VOTING RESOLUTION ────────────────────────────────────────────────────────

async function resolveVoting(room) {
  const { room_code, round } = room;

  const tally = await tallyDayVotes(room_code, round);
  const lynchTargetId = findLynchTarget(tally);

  let eliminated = null;
  if (lynchTargetId) {
    await prisma.gamePlayer.update({
      where: { id: lynchTargetId },
      data: { status: "ELIMINATED" },
    });
    eliminated = lynchTargetId;

    // Set eliminated_this_round for reveal screen
    await prisma.gameRoom.update({
      where: { room_code },
      data: { eliminated_this_round: lynchTargetId },
    });
  }

  // Check win
  const winner = await checkWinCondition(room_code);
  if (winner) {
    // Short REVEAL then END
    const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.REVEAL);
    await prisma.gameRoom.update({
      where: { room_code },
      data: { status: "REVEAL", phase_ends_at: phaseEndsAt },
    });
    await pusher.trigger(`game-${room_code}`, "phase-resolved", {
      phase: "REVEAL",
      round,
      eliminatedPlayerId: eliminated,
      phaseEndsAt: phaseEndsAt.toISOString(),
    });
    // Will call endGame on next heartbeat tick when REVEAL expires
    setTimeout(() => endGame(room_code, winner), PHASE_DURATION.REVEAL);
    return;
  }

  if (eliminated) {
    // Show reveal for 3s then start next NIGHT
    const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.REVEAL);
    await prisma.gameRoom.update({
      where: { room_code },
      data: { status: "REVEAL", phase_ends_at: phaseEndsAt },
    });
    await pusher.trigger(`game-${room_code}`, "phase-resolved", {
      phase: "REVEAL",
      round,
      eliminatedPlayerId: eliminated,
      phaseEndsAt: phaseEndsAt.toISOString(),
    });
    setTimeout(() => advanceToNight(room_code, round + 1), PHASE_DURATION.REVEAL);
  } else {
    // No elimination (tie) → go straight to next NIGHT
    await advanceToNight(room_code, round + 1);
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function advanceToNight(roomCode, nextRound) {
  const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.NIGHT);
  await prisma.gameRoom.update({
    where: { room_code: roomCode },
    data: {
      status: "NIGHT",
      round: nextRound,
      phase_ends_at: phaseEndsAt,
      eliminated_this_round: null,
    },
  });

  await pusher.trigger(`game-${roomCode}`, "phase-resolved", {
    phase: "NIGHT",
    round: nextRound,
    phaseEndsAt: phaseEndsAt.toISOString(),
  });
}

async function endGame(roomCode, winner) {
  // Fetch all players with roles for the reveal
  const allPlayers = await prisma.gamePlayer.findMany({
    where: { room_code: roomCode },
    include: { user: { select: { full_name: true } } },
  });

  await prisma.gameRoom.update({
    where: { room_code: roomCode },
    data: { status: "ENDED", winner },
  });

  await pusher.trigger(`game-${roomCode}`, "game-ended", {
    winner,
    players: allPlayers.map((p) => ({
      userId: p.user_id,
      name: p.user.full_name,
      role: p.role,
      status: p.status,
    })),
  });
}

// ─── HEARTBEAT DISPATCHER ─────────────────────────────────────────────────────

/**
 * Called every second from the server heartbeat.
 * Finds all rooms whose phase timer has expired and resolves them.
 */
export async function resolveExpiredRooms() {
  const expiredRooms = await prisma.gameRoom.findMany({
    where: {
      status: { in: ["NIGHT", "DISCUSSION", "VOTING"] },
      phase_ends_at: { lte: new Date() },
    },
  });

  for (const room of expiredRooms) {
    try {
      // Lock the room by clearing phase_ends_at first to prevent double-processing
      await prisma.gameRoom.update({
        where: { room_code: room.room_code },
        data: { phase_ends_at: null },
      });

      if (room.status === "NIGHT") await resolveNight(room);
      else if (room.status === "DISCUSSION") await resolveDiscussion(room);
      else if (room.status === "VOTING") await resolveVoting(room);
    } catch (err) {
      console.error(`[heartbeat] Failed to resolve room ${room.room_code}:`, err.message);
    }
  }
}
