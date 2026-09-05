/* ============================================================
   ArcAIde — shared leaderboard configuration
   Loaded by every game BEFORE leaderboard.js.

   These are the *public* Supabase credentials for the "arcaide"
   project. They are safe to publish: RLS allows read-only access,
   and every write goes through submit_score(), which validates the
   game, the player name and the score range, and rate-limits.
   ============================================================ */
window.GAMES_LB_CONFIG = {
  supabaseUrl: 'https://dncpegqhpfrvcpjluffb.supabase.co',
  supabaseKey: 'sb_publishable_gxt1IGpvsTDoo-cqVenyyA_1-7E3u6D',
  hubUrl: 'https://gilmagnum.github.io/games/'
};
