// Shared block-related helpers, used across browse.js, feed.js, profile-view.js,
// chat.js, and messages.js so blocked people are consistently hidden from each other.

// Returns a combined list of user IDs to exclude from view: people the current
// user blocked, AND people who blocked the current user (mutual invisibility).
async function getBlockedUserIds(currentUserId) {
  const { data } = await supabaseClient
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`);

  const ids = new Set();
  (data || []).forEach(row => {
    ids.add(row.blocker_id === currentUserId ? row.blocked_id : row.blocker_id);
  });
  return Array.from(ids);
}

// Checks whether a block exists in EITHER direction between two specific users.
async function isBlockedEitherWay(userIdA, userIdB) {
  const { data } = await supabaseClient
    .from('blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${userIdA},blocked_id.eq.${userIdB}),and(blocker_id.eq.${userIdB},blocked_id.eq.${userIdA})`)
    .maybeSingle();
  return !!data;
}
