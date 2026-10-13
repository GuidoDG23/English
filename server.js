const express = require('express');
const path = require('path');

// Question banks (edit these JSON files to add or change content)
const grammar = require('./data/grammar.json');
const vocab = require('./data/vocab.json');
const correct = require('./data/correct.json');
const wordform = require('./data/wordform.json');

const app = express();
const PORT = process.env.PORT || 3000; // Render (and most hosts) set PORT for you
const SESSION_SIZE = 10;

// Flat lists with a "type" field, so any question can be found by its id
const ALL_GRAMMAR = grammar.topics.flatMap((t) =>
  t.questions.map((q) => ({ ...q, type: 'grammar', topic: t.title }))
);
const ALL_VOCAB = vocab.units.flatMap((u) =>
  u.words.map((w) => ({ ...w, type: 'vocab', unit: u.id }))
);
const ALL_CORRECT = correct.questions.map((q) => ({ ...q, type: 'correct' }));
const ALL_WORDFORM = wordform.questions.map((q) => ({ ...q, type: 'wordform' }));
const BY_ID = new Map(
  [...ALL_GRAMMAR, ...ALL_VOCAB, ...ALL_CORRECT, ...ALL_WORDFORM].map((q) => [q.id, q])
);

// Serve index.html, style.css and script.js from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Returns a shuffled copy of an array (Fisher–Yates shuffle)
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Shuffles answer options and, for vocabulary, builds 4 definitions to choose from
function prepareQuestion(q) {
  if (q.type === 'grammar') return { ...q, options: shuffle(q.options) };
  if (q.type === 'vocab') {
    // Wrong options come from the same unit first (harder and more useful), then from others
    const sameUnit = shuffle(ALL_VOCAB.filter((v) => v.unit === q.unit && v.id !== q.id));
    const others = shuffle(ALL_VOCAB.filter((v) => v.unit !== q.unit));
    const distractors = [...sameUnit, ...others].slice(0, 3).map((v) => v.definition);
    return { ...q, options: shuffle([q.definition, ...distractors]) };
  }
  return q;
}

// GET /api/catalog -> grammar topics and vocabulary units for the menus
app.get('/api/catalog', (req, res) => {
  res.json({
    topics: grammar.topics.map((t) => ({ id: t.id, unit: t.unit, title: t.title, count: t.questions.length })),
    units: vocab.units.map((u) => ({ id: u.id, title: u.title, count: u.words.length })),
    counts: { correct: ALL_CORRECT.length, wordform: ALL_WORDFORM.length }
  });
});

// GET /api/questions?mode=grammar&topic=g05   (topic=all for mixed grammar)
// GET /api/questions?mode=vocab&unit=u3        (unit=all for every unit)
// GET /api/questions?mode=correct | mode=wordform
// GET /api/questions?ids=g01-02,u3-04,c010     (used by "Review Mistakes")
app.get('/api/questions', (req, res) => {
  let pool;

  if (req.query.ids) {
    pool = String(req.query.ids).split(',').map((id) => BY_ID.get(id)).filter(Boolean);
  } else if (req.query.mode === 'grammar') {
    const topic = grammar.topics.find((t) => t.id === req.query.topic);
    pool = topic ? ALL_GRAMMAR.filter((q) => q.id.startsWith(`${topic.id}-`)) : ALL_GRAMMAR;
  } else if (req.query.mode === 'vocab') {
    const unit = vocab.units.find((u) => u.id === req.query.unit);
    pool = unit ? ALL_VOCAB.filter((w) => w.unit === unit.id) : ALL_VOCAB;
  } else if (req.query.mode === 'correct') {
    pool = ALL_CORRECT;
  } else if (req.query.mode === 'wordform') {
    pool = ALL_WORDFORM;
  } else {
    return res.status(400).json({ error: 'Unknown mode. Use grammar, vocab, correct or wordform.' });
  }

  // Each session picks 10 random questions from the whole pool
  res.json(shuffle(pool).slice(0, SESSION_SIZE).map(prepareQuestion));
});

app.listen(PORT, () => {
  console.log(`TOEFL Sprint is running at http://localhost:${PORT}`);
});
