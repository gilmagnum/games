-- =============================================================
--  Game registry seed / upsert
--  Run after schema.sql. Re-runnable — adding a new game means
--  adding one row here and one object in ../games.json.
--
--  score_order: 'desc' = higher is better, 'asc' = lower is better.
--  max_score   : anything above this is rejected by submit_score().
-- =============================================================

insert into public.games
  (slug, title, subtitle, emoji, url, score_label, score_order, max_score, sort_order)
values
  ('area-conquer',
   'סוגר שטחים',
   'כבשו 75% מהלוח בלי שהכדורים יפגעו בקו',
   '🟪',
   'https://gilmagnum.github.io/area-conquer/',
   'נקודות', 'desc', 10000000, 10),

  ('catchit-easy',
   'תפוס''תו! · קל',
   '40 שניות לתפוס כמה שיותר',
   '🟢',
   'https://gilmagnum.github.io/catchit-/',
   'נקודות', 'desc', 100000, 21),

  ('catchit-normal',
   'תפוס''תו! · רגיל',
   '30 שניות לתפוס כמה שיותר',
   '🟡',
   'https://gilmagnum.github.io/catchit-/',
   'נקודות', 'desc', 100000, 22),

  ('catchit-hard',
   'תפוס''תו! · קשה',
   '20 שניות, יותר קופים ופחות מטרות',
   '🔴',
   'https://gilmagnum.github.io/catchit-/',
   'נקודות', 'desc', 100000, 23),

  ('snake-memory',
   'שביל הנחש',
   'לזכור את התבנית ולשחזר אותה באצבע',
   '🐍',
   'https://gilmagnum.github.io/Snake-memory/',
   'נקודות', 'desc', 1000000, 30),

  ('pizza-chef',
   'פיצה ארקייד',
   'כמה מגשים תספיקו להרכיב לפי הסדר',
   '🍕',
   'https://gilmagnum.github.io/Pizza-Chef/',
   'מגשים', 'desc', 100000, 35),

  ('find-the-ace',
   'אס־פרס קזינו',
   'למצוא את 4 האסים בכמה שפחות קלפים',
   '🃏',
   'https://gilmagnum.github.io/Find-the-Ace/',
   'קלפים', 'asc', 52, 40)

on conflict (slug) do update set
  title       = excluded.title,
  subtitle    = excluded.subtitle,
  emoji       = excluded.emoji,
  url         = excluded.url,
  score_label = excluded.score_label,
  score_order = excluded.score_order,
  max_score   = excluded.max_score,
  sort_order  = excluded.sort_order;
