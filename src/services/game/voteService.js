import prisma from "../../config/prisma.js";

// ─── VOTE SUBMISSION ──────────────────────────────────────────────────────────

/**
 * Upserts a vote for a player in a given round.
 * Enforces:
 *   - voter must be ALIVE
 *   - vote_type must match current phase
 *   - target must be ALIVE (if target is required for this vote type)
 */
export async function submitVote({ roomCode, round, voterId, targetId, voteType }) {
  // Validate voter is alive in this room
  const voter = await prisma.gamePlayer.findUnique({
    where: { room_code_user_id: { room_code: roomCode, user_id: voterId } },
    select: { id: true, status: true },
  });
  if (!voter) throw Object.assign(new Error("Player not in room"), { status: 404 });
  if (voter.status !== "ALIVE") throw Object.assign(new Error("Eliminated players cannot vote"), { status: 403 });

  // Validate target exists and is alive (skip for actions like COP_INVESTIGATE where target is always required)
  if (targetId) {
    const target = await prisma.gamePlayer.findUnique({
      where: { room_code_user_id: { room_code: roomCode, user_id: targetId } },
      select: { id: true, status: true },
    });
    if (!target) throw Object.assign(new Error("Target not in room"), { status: 404 });
    if (target.status !== "ALIVE") throw Object.assign(new Error("Cannot target an eliminated player"), { status: 400 });

    await prisma.gameVote.upsert({
      where: {
        room_code_round_voter_id_vote_type: {
          room_code: roomCode,
          round,
          voter_id: voter.id,
          vote_type: voteType,
        },
      },
      create: {
        room_code: roomCode,
        round,
        voter_id: voter.id,
        target_id: target.id,
        vote_type: voteType,
      },
      update: { target_id: target.id },
    });
  } else {
    // Skip/pass vote with no target
    await prisma.gameVote.upsert({
      where: {
        room_code_round_voter_id_vote_type: {
          room_code: roomCode,
          round,
          voter_id: voter.id,
          vote_type: voteType,
        },
      },
      create: {
        room_code: roomCode,
        round,
        voter_id: voter.id,
        target_id: null,
        vote_type: voteType,
      },
      update: { target_id: null },
    });
  }
}

// ─── VOTE TALLYING ────────────────────────────────────────────────────────────

/**
 * Returns tally of DAY_LYNCH votes as { playerId → count }.
 */
export async function tallyDayVotes(roomCode, round) {
  const votes = await prisma.gameVote.findMany({
    where: { room_code: roomCode, round, vote_type: "DAY_LYNCH", target_id: { not: null } },
    select: { target_id: true },
  });

  const tally = {};
  for (const { target_id } of votes) {
    tally[target_id] = (tally[target_id] || 0) + 1;
  }
  return tally;
}

/**
 * Returns the player id with the most DAY_LYNCH votes.
 * Returns null on a tie (no elimination).
 */
export function findLynchTarget(tally) {
  const entries = Object.entries(tally);
  if (entries.length === 0) return null;

  entries.sort(([, a], [, b]) => b - a);
  const [topId, topCount] = entries[0];
  const isTie = entries.length > 1 && entries[1][1] === topCount;
  return isTie ? null : topId;
}

/**
 * Returns the MAFIA_TARGET player id for this night (majority or first pick).
 */
export async function getMafiaTarget(roomCode, round) {
  const votes = await prisma.gameVote.findMany({
    where: { room_code: roomCode, round, vote_type: "MAFIA_TARGET", target_id: { not: null } },
    select: { target_id: true },
  });

  if (votes.length === 0) return null;

  const tally = {};
  for (const { target_id } of votes) {
    tally[target_id] = (tally[target_id] || 0) + 1;
  }
  const sorted = Object.entries(tally).sort(([, a], [, b]) => b - a);
  return sorted[0]?.[0] ?? null;
}

/**
 * Returns the player id chosen by DOC_SAVE.
 */
export async function getDoctorSave(roomCode, round) {
  const vote = await prisma.gameVote.findFirst({
    where: { room_code: roomCode, round, vote_type: "DOC_SAVE", target_id: { not: null } },
    select: { target_id: true },
  });
  return vote?.target_id ?? null;
}

/**
 * Returns the player id chosen by NURSE_ACTION.
 */
export async function getNurseAction(roomCode, round) {
  const vote = await prisma.gameVote.findFirst({
    where: { room_code: roomCode, round, vote_type: "NURSE_ACTION", target_id: { not: null } },
    select: { target_id: true },
  });
  return vote?.target_id ?? null;
}
