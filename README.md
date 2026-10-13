# 🚀 TOEFL Sprint

A fun web app to practise B2 grammar and vocabulary in short 10-question sessions.
All questions are original, written around the grammar topics and vocabulary of *Open World B2 First*.

**Modes**
- **Grammar**: 28 topics (Starter to Unit 14), about 21 questions each. Choose a topic or mix them all.
- **Vocabulary**: 251 words and phrases from the book's units and phrasal verb bank. Choose a unit, then *Choose the meaning* or *Type the word*.
- **Correct the Mistake**: 101 sentences with one mistake. Edit the sentence to correct it.
- **Word Formation**: 77 sentences. Change the word in capitals so it fits the gap.
- **Review Mistakes**: practise again the questions you got wrong.

Each session picks 10 random questions from the chosen bank. Progress (best scores, streak and mistakes) is saved in the browser with `localStorage`.

## Run it on your computer

Requirements: [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000

## Project structure

```
toefl-sprint/
├── package.json         # project info, scripts and the only dependency (Express)
├── server.js            # Express server: serves /public and the API
├── data/
│   ├── grammar.json     # grammar topics and their questions
│   ├── vocab.json       # vocabulary by unit
│   ├── correct.json     # "Correct the Mistake" sentences
│   └── wordform.json    # "Word Formation" sentences
└── public/
    ├── index.html       # page structure: home, topics, quiz and results screens
    ├── style.css        # colours, layout, animations, responsive design
    └── script.js        # app logic: sessions, answers, feedback, progress
```

## Adding questions

Edit the JSON files in `data/` and keep every `id` unique. Restart the server afterwards (Ctrl + C, then `npm start`).

- **grammar.json**: inside a topic's `questions`: `sentence` (use `___` for the gap), `options`, `answer` (exact text of the correct option), `explanation`
- **vocab.json**: inside a unit's `words`: `word`, `definition`, `example`
- **correct.json**: `sentence` (with one mistake), `answers` (list of accepted corrected sentences), `explanation`
- **wordform.json**: `sentence` (with `___`), `root` (word in capitals), `answers` (accepted forms), `explanation`

Typed answers ignore capital letters, punctuation and contractions (*can't* = *cannot*).

## Deploy (GitHub + Render)

1. Push this folder to a GitHub repository (keep the same folder structure).
2. On [render.com](https://render.com), create a **Web Service** and connect the repository.
3. Settings: Runtime **Node**, Build command `npm install`, Start command `npm start`, Instance type **Free**.
4. Every `git push` to the main branch redeploys the app automatically.

Note: free Render services sleep after ~15 minutes without visits, so the first load afterwards can take 30–60 seconds.
