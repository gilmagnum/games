<div dir="rtl" align="right">

# 🕹️ ArcAIde — הארקייד של גיל

דף בית אחד לכל משחקי הדפדפן, עם **טבלת שיאים גלובלית** לכל משחק.

🔗 **[gilmagnum.github.io/games](https://gilmagnum.github.io/games/)**

---

## מה יש כאן

```
games/
├── index.html          דף הבית — קורא את games.json ומציג כרטיס לכל משחק
├── games.json          רישום המשחקים (מקור האמת לדף הבית)
├── config.js         כתובת ומפתח Supabase (ציבוריים, בטוחים לפרסום)
│   ├── config.js       כתובת ומפתח Supabase (ציבוריים, בטוחים לפרסום)
│   └── leaderboard.js  הליברייה המשותפת — טבלת שיאים + הזנת שם
├── supabase/
│   ├── schema.sql      טבלאות, RLS ופונקציות
│   └── seed.sql        רישום המשחקים בצד השרת
└── test.html           עמוד בדיקה מקומי לליברייה
```

---

## הקמה חד-פעמית

### 1. פרויקט Supabase

1. פותחים פרויקט חדש ב־[supabase.com](https://supabase.com) (למשל `gil-arcade`).
2. **SQL Editor** ← מדביקים ומריצים את `supabase/schema.sql`.
3. מריצים את `supabase/seed.sql`.
4. **Project Settings → API** — מעתיקים את `Project URL` ואת מפתח ה־`anon public`.
5. מעדכנים אותם ב־`lib/config.js`.

> המפתח ה־anon בטוח לפרסום: ה־RLS מאפשר **קריאה בלבד**, וכל כתיבה עוברת דרך
> `submit_score()` שמאמתת שם, טווח ניקוד, קיום המשחק ומגבילה קצב (15 שמירות ל-10 דקות).

### 2. GitHub Pages

`Settings → Pages → Deploy from a branch → main / (root)`

---

## הוספת משחק חדש

שלושה שלבים, שתי דקות:

**א. `games.json`** — מוסיפים אובייקט:

```json
{
  "slug": "snake-path",
  "title": "נתיב הנחש",
  "subtitle": "לזכור את המסלול ולחזור עליו",
  "emoji": "🐍",
  "url": "https://gilmagnum.github.io/snake-path/",
  "scoreLabel": "שלבים",
  "accent": "#3ddc97",
  "accent2": "#1fa87a",
  "tags": ["זיכרון", "מובייל"]
}
```

**ב. `supabase/seed.sql`** — מוסיפים שורה מקבילה ומריצים.
ה־`slug` חייב להיות **זהה** בשני המקומות.

**ג. במשחק עצמו** — שתי שורות סקריפט וקריאה אחת (ראו למטה).

---

## חיבור טבלת שיאים למשחק

בתוך ה־`<head>` של המשחק:

```html
<script src="https://gilmagnum.github.io/games/config.js"></script>
<script src="https://gilmagnum.github.io/games/leaderboard.js"></script>
```

אתחול פעם אחת:

```js
Leaderboard.init({
  game: 'area-conquer',   // חייב להיות זהה ל-slug ב-Supabase
  title: 'סוגר שטחים',
  scoreLabel: 'נקודות'
});
```

בסוף כל סיבוב:

```js
Leaderboard.gameOver(score, { level: currentLevel });
```

זה כל מה שצריך. הליברייה בודקת אם הניקוד נכנס לעשירייה הראשונה,
ואם כן — פותחת חלונית להזנת שם (עם השם הקודם ממולא מראש), שומרת,
ומציגה את הטבלה המעודכנת עם הדגשה על השורה שלך.

### API מלא

| קריאה | מה עושה |
|---|---|
| `Leaderboard.init(opts)` | אתחול. חובה: `game`. אופציונלי: `title`, `scoreLabel`, `scoreOrder`, `limit`, `formatScore`, `onClose` |
| `Leaderboard.gameOver(score, meta?)` | הזרימה המלאה בסוף סיבוב. לא זורק שגיאות אל תוך המשחק |
| `Leaderboard.show()` | פותח את הטבלה בלבד (לכפתור "שיאים") |
| `Leaderboard.top(limit?)` | מחזיר Promise עם השורות המובילות |
| `Leaderboard.submit(name, score, meta?)` | שמירה ישירה בלי UI |
| `Leaderboard.personalBest()` | השיא האישי מ-localStorage (עובד גם בלי רשת) |
| `Leaderboard.playerName()` | השם השמור של השחקן |
| `Leaderboard.close()` | סוגר את החלונית |

**משחק שבו נמוך = טוב יותר** (זמן, מספר מהלכים):

```js
Leaderboard.init({
  game: 'memory-rush',
  scoreOrder: 'asc',
  scoreLabel: 'שניות',
  formatScore: function (ms) { return (ms / 1000).toFixed(2); }
});
```

---

## הערות

- הליברייה חיה כולה ב־Shadow DOM — ה־CSS שלה לא יכול להתנגש עם המשחק.
- כל המשחקים יושבים תחת `gilmagnum.github.io`, כלומר אותו origin —
  אין בעיות CORS והשם השמור של השחקן משותף בין כל המשחקים.
- אין תלויות, אין build. קובץ אחד, ~11KB.
- בלי רשת: המשחק ממשיך לעבוד, השיא האישי נשמר מקומית, והחלונית מציגה הודעה מנומסת.

</div>
