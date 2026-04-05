import prisma from "../../config/prisma.js";

// ─── ROLE CONFIGS ─────────────────────────────────────────────────────────────

const ROLE_CONFIG = {
  FIVE: {
    MAFIA: 1,
    DOCTOR: 1,
    COP: 1,
    CITIZEN: 2,
    MAFIA_HELPER: 0,
    NURSE: 0,
  },
  EIGHT: {
    MAFIA: 2,
    MAFIA_HELPER: 1,
    DOCTOR: 1,
    COP: 1,
    CITIZEN: 3,
    NURSE: 0,
  },
  TWELVE: {
    MAFIA: 3,
    MAFIA_HELPER: 2,
    DOCTOR: 1,
    COP: 1,
    NURSE: 1,
    CITIZEN: 4,
  },
};

/**
 * Shuffles an array in-place using Fisher-Yates.
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Assigns roles to all players in a room based on room_size.
 * Returns a map of { playerId → GameRole }.
 * Does NOT write to DB — caller handles the transaction.
 */
export function buildRoleAssignments(players, roomSize) {
  const config = ROLE_CONFIG[roomSize];
  if (!config) throw new Error(`Unknown room size: ${roomSize}`);

  // Build a flat array of roles
  const rolePool = [];
  for (const [role, count] of Object.entries(config)) {
    for (let i = 0; i < count; i++) rolePool.push(role);
  }

  if (rolePool.length !== players.length) {
    throw new Error(
      `Role pool size ${rolePool.length} does not match player count ${players.length}`
    );
  }

  shuffle(rolePool);

  const assignments = {};
  players.forEach((p, idx) => {
    assignments[p.id] = rolePool[idx];
  });

  return assignments;
}

/**
 * Validates that the player count matches the room size enum.
 */
export function validateRoomSize(playerCount) {
  if (playerCount === 5) return "FIVE";
  if (playerCount === 8) return "EIGHT";
  if (playerCount === 12) return "TWELVE";
  return null;
}
