-- =====================================================================
-- 桜打 — SAKURA TYPE v1.3.0  ゲームの短縮コースを標準の約半分に
--
--  * 新しい短縮コースの物語（物語の版 sakurada-stories-v2）を private.game_stories に追加します。
--  * 既存の行（sakurada-stories-v1 の標準版3本・旧短縮版3本）と、過去の記録は変更しません。
--    旧短縮版（*-intro、約50打鍵）の記録はそのまま残り、新しい短縮版とは物語の ID・版が違うため比べられません。
-- =====================================================================
insert into private.game_stories (story_set_version, story_id, course_id, total_reading_characters) values
  ('sakurada-stories-v2', 'inherited-dream-short', 'short', 503),
  ('sakurada-stories-v2', 'gaudi-and-nature-short', 'short', 517),
  ('sakurada-stories-v2', 'visit-barcelona-short', 'short', 507);
