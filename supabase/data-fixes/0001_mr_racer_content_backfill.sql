-- One-time data fix — NOT a schema migration, run manually (Supabase SQL
-- editor) after migration 0072_game_content_section.sql has been applied.
--
-- "MR RACER - Car Racing" (slug: mr-racer-car-racing) had its entire
-- article — intro, "How to Play MR RACER", "Features", "Controls",
-- "Play MR RACER Online" — typed into the single plain-text `description`
-- field, which is why the game page rendered it as one unbroken paragraph.
-- This splits that same copy across `description` (short intro blurb,
-- also used as the SEO meta-description fallback — kept short and plain)
-- and the new `content` field (sanitized HTML, rendered with real
-- headings/paragraphs/lists by GameContentSection). No new copy was
-- written — every sentence below is unchanged from the original text,
-- just reassigned to the right field and wrapped in the matching tag.
--
-- Safe to re-run: it's a plain UPDATE keyed by slug, not an insert.
-- Adjust or skip this for any other game — it's a worked example of how
-- to move existing wall-of-text descriptions into the new Content field
-- via the admin panel's RichTextEditor going forward, not something that
-- needs to run for every game.

update public.games
set
  description =
    'MR RACER is a fast-paced online racing game where speed, control, and quick decisions are the keys to finishing ahead of your opponents. Jump into exciting races, choose your favorite car, and push your driving skills to the limit as you compete on challenging tracks. The game combines simple controls with competitive racing gameplay, making it easy to start playing while still giving you plenty of room to improve. Avoid crashes, maintain your speed, overtake rival drivers, and try to reach the finish line in first place.',
  content =
    '<h2>How to Play MR RACER</h2>' ||
    '<p>Start a race and take control of your car using the available driving controls. Accelerate through the track, steer around corners, and watch out for other vehicles and obstacles. Timing your overtakes and maintaining control at high speed can make the difference between winning and losing.</p>' ||
    '<p>As you progress, challenge yourself to complete races faster and improve your performance. Each race gives you another opportunity to sharpen your driving skills and become a better racer.</p>' ||
    '<h2>Features</h2>' ||
    '<ul>' ||
    '<li>Fast-paced racing gameplay</li>' ||
    '<li>Multiple challenging tracks</li>' ||
    '<li>Competitive races against other drivers</li>' ||
    '<li>Easy-to-learn driving controls</li>' ||
    '<li>Exciting car racing experience</li>' ||
    '<li>Suitable for desktop and mobile play</li>' ||
    '<li>Play directly in your browser</li>' ||
    '<li>No installation required</li>' ||
    '</ul>' ||
    '<h2>Play MR RACER Online</h2>' ||
    '<p>Ready to hit the road? Start MR RACER directly in your browser and see how quickly you can finish each race. Race against your opponents, master the tracks, and aim for the top position. Whether you enjoy quick racing challenges or competitive driving games, MR RACER offers an entertaining way to put your skills behind the wheel.</p>'
where slug = 'mr-racer-car-racing';
