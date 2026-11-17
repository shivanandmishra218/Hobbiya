// Runs on every logged-in page. Subscribes to new messages across ALL of the
// user's accepted 1:1 connections AND groups, plays a short quiet beep when
// one arrives (unless the person is already looking at that exact
// conversation), and shows/hides a small unread DOT on the 💬 Messages icon —
// no popup/toast, since that reads as an "alert" rather than a normal app.

(function () {
  let currentUserId = null;

  function playBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.09);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } catch (e) {
      // Some browsers block audio until the user has interacted with the page — fail silently.
    }
  }

  // Just a dot: on/off, no unread count number, so it never looks alert-like.
  function setDot(visible) {
    const badge = document.getElementById('messagesBadge');
    if (!badge) return;
    badge.style.display = visible ? 'inline-block' : 'none';
  }

  async function init() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return; // not logged in — nothing to notify about
    currentUserId = user.id;

    // ---- 1:1 connections ----
    const { data: connections } = await supabaseClient
      .from('connections')
      .select('id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

    const connectionIds = (connections || []).map(c => c.id);

    // ---- Groups ----
    const { data: memberships } = await supabaseClient
      .from('group_members')
      .select('group_id')
      .eq('user_id', currentUserId);

    const groupIds = (memberships || []).map(m => m.group_id);

    if (connectionIds.length === 0 && groupIds.length === 0) return;

    // Prime the dot with however many unread 1:1 messages already exist
    let hasUnread = false;
    if (connectionIds.length) {
      const { count } = await supabaseClient
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('connection_id', connectionIds)
        .neq('sender_id', currentUserId)
        .is('read_at', null);
      if (count) hasUnread = true;
    }

    // For groups: unread if any message is newer than this user's last_read_at for that group
    if (!hasUnread && groupIds.length) {
      const { data: reads } = await supabaseClient
        .from('group_reads')
        .select('group_id, last_read_at')
        .eq('user_id', currentUserId);
      const lastReadByGroup = {};
      (reads || []).forEach(r => { lastReadByGroup[r.group_id] = r.last_read_at; });

      for (const gid of groupIds) {
        const since = lastReadByGroup[gid] || '1970-01-01';
        const { count } = await supabaseClient
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', gid)
          .neq('sender_id', currentUserId)
          .gt('created_at', since);
        if (count) { hasUnread = true; break; }
      }
    }

    setDot(hasUnread);

    // Live updates for 1:1 messages
    if (connectionIds.length) {
      supabaseClient
        .channel('global-message-notifications')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `connection_id=in.(${connectionIds.join(',')})`,
        }, (payload) => handleIncoming(payload.new, 'connection'))
        .subscribe();
    }

    // Live updates for group messages
    if (groupIds.length) {
      supabaseClient
        .channel('global-group-message-notifications')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `group_id=in.(${groupIds.join(',')})`,
        }, (payload) => handleIncoming(payload.new, 'group'))
        .subscribe();
    }

    function handleIncoming(msg, kind) {
      if (msg.sender_id === currentUserId) return; // don't notify on our own messages

      // Receiving this in real time means it has genuinely reached this
      // user's browser — mark it delivered even if they're not in that chat.
      if (kind === 'connection') {
        supabaseClient.rpc('mark_connection_messages_delivered', { p_connection_id: msg.connection_id });
      }

      // If this exact conversation is already open on screen, chat.js handles
      // showing it live — skip the sound/dot so it's not doubled up.
      if (kind === 'connection' && window.__activeChatConnectionId === msg.connection_id) return;
      if (kind === 'group' && window.__activeChatGroupId === msg.group_id) return;

      playBeep();
      setDot(true);
    }
  }

  init();
})();
