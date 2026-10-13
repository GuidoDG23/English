// ================== Settings ==================
const STORAGE_KEY = 'toeflSprint.progress.v2';
const MAX_SAVED_MISTAKES = 150;

// Each mode: label shown in the quiz, colour theme, and how the API is called
const MODES = {
  grammar:        { label: 'Grammar',            theme: 'grammar',  query: (f) => `mode=grammar&topic=${f}` },
  'vocab-choose': { label: 'Vocabulary · Meaning', theme: 'vocab',  query: (f) => `mode=vocab&unit=${f}` },
  'vocab-type':   { label: 'Vocabulary · Typing',  theme: 'vocab',  query: (f) => `mode=vocab&unit=${f}` },
  correct:        { label: 'Correct the Mistake', theme: 'correct',  query: () => 'mode=correct' },
  wordform:       { label: 'Word Formation',     theme: 'wordform', query: () => 'mode=wordform' },
  review:         { label: 'Review Mistakes',    theme: 'review',   query: () => `ids=${encodeURIComponent(progress.mistakes.join(','))}` }
};

const PRAISE = ['Correct! 🎉', 'Nice job! ⭐', 'You got it! 🙌', 'Excellent! 🚀', 'Spot on! 🎯'];

// ================== Saved progress (localStorage) ==================
function defaultProgress() {
  return { best: {}, mistakes: [], streak: 0, lastDate: null };
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...defaultProgress(), ...saved } : defaultProgress();
  } catch {
    return defaultProgress();
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage blocked (e.g. private mode): the app still works, progress just isn't kept.
  }
}

let progress = loadProgress();
let catalog = { topics: [], units: [] }; // grammar topics and vocabulary units from the server
let session = null; // the current practice session

// ================== Streak helpers ==================
function dateKey(date) {
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD in the user's local time
}
function todayKey() {
  return dateKey(new Date());
}
function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}
function currentStreak() {
  const active = progress.lastDate === todayKey() || progress.lastDate === yesterdayKey();
  return active ? progress.streak : 0;
}
function registerPracticeDay() {
  const today = todayKey();
  if (progress.lastDate === today) return;
  progress.streak = progress.lastDate === yesterdayKey() ? progress.streak + 1 : 1;
  progress.lastDate = today;
}

// ================== Mistakes and best scores ==================
function addMistake(id) {
  if (progress.mistakes.includes(id)) return;
  progress.mistakes.push(id);
  if (progress.mistakes.length > MAX_SAVED_MISTAKES) progress.mistakes.shift();
}
function removeMistake(id) {
  progress.mistakes = progress.mistakes.filter((m) => m !== id);
}
function bestKey(modeKey, filter) {
  return `${modeKey}:${filter || 'all'}`;
}
function formatBest(key) {
  const score = progress.best[key];
  return score === undefined ? '–' : `${score}%`;
}

// ================== Text helpers ==================
// Makes typed answers comparable: lower case, contractions expanded, no punctuation or extra spaces.
function normalize(text) {
  let s = text.toLowerCase().replace(/[’‘]/g, "'");
  s = s.replace(/can't/g, 'cannot').replace(/won't/g, 'will not').replace(/can not/g, 'cannot');
  s = s.replace(/n't\b/g, ' not');
  s = s.replace(/'m\b/g, ' am').replace(/'re\b/g, ' are').replace(/'ve\b/g, ' have').replace(/'ll\b/g, ' will');
  s = s.replace(/-/g, '');
  s = s.replace(/[^a-z0-9' ]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function isAccepted(answer, acceptedList) {
  const typed = normalize(answer);
  return acceptedList.some((item) => normalize(item) === typed);
}

// ================== DOM helpers ==================
const $ = (id) => document.getElementById(id);

// Creates an element. Using textContent keeps the page safe from injected HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showScreen(id) {
  ['homeScreen', 'topicsScreen', 'quizScreen', 'resultsScreen'].forEach((screen) => {
    $(screen).classList.toggle('hidden', screen !== id);
  });
  window.scrollTo(0, 0);
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Builds a sentence paragraph where "___" becomes a highlighted blank
function sentenceWithBlank(sentence) {
  const [before, after = ''] = sentence.split('___');
  const blank = el('span', 'blank', '?');
  const p = el('p', 'q-sentence');
  p.append(before, blank, after);
  return { p, blank };
}

// ================== Catalog (topics and units) ==================
async function loadCatalog() {
  try {
    const response = await fetch('/api/catalog');
    if (!response.ok) throw new Error(`Server responded with ${response.status}`);
    catalog = await response.json();
  } catch (error) {
    console.error(error);
    return;
  }

  const select = $('unitSelect');
  catalog.units.forEach((unit) => {
    const option = el('option', null, `${unit.title} (${unit.count})`);
    option.value = unit.id;
    select.append(option);
  });
  try {
    const savedUnit = localStorage.getItem('toeflSprint.unit');
    if (savedUnit && catalog.units.some((u) => u.id === savedUnit)) select.value = savedUnit;
  } catch {
    // ignore storage errors
  }
  renderHome();
}

function topicTitle(id) {
  const topic = catalog.topics.find((t) => t.id === id);
  return topic ? topic.title : 'Mixed grammar';
}
function unitTitle(id) {
  const unit = catalog.units.find((u) => u.id === id);
  return unit ? unit.title.split(' · ')[0] : 'All units';
}

// ================== Home screen ==================
function renderHome() {
  session = null;
  document.body.dataset.theme = 'home';
  $('streakPill').textContent = `🔥 ${currentStreak()}-day streak`;

  document.querySelectorAll('[data-best]').forEach((node) => {
    node.textContent = formatBest(node.dataset.best);
  });

  const unit = $('unitSelect').value;
  $('bestVocabChoose').textContent = formatBest(bestKey('vocab-choose', unit));
  $('bestVocabType').textContent = formatBest(bestKey('vocab-type', unit));

  const practised = catalog.topics.filter((t) => progress.best[bestKey('grammar', t.id)] !== undefined).length;
  $('topicsDone').textContent = `${practised} / ${catalog.topics.length || 28}`;

  const count = progress.mistakes.length;
  $('mistakeCount').textContent = count;
  $('reviewHint').textContent = count === 0
    ? 'No mistakes saved yet. Keep practising!'
    : `You have ${count} question${count === 1 ? '' : 's'} to review.`;
  document.querySelector('[data-start="review"]').disabled = count === 0;

  showScreen('homeScreen');
}

function goHome() {
  const inProgress = session && !$('quizScreen').classList.contains('hidden') && session.questions.length > 0;
  if (inProgress && !confirm('Quit this session? Your score will not be saved.')) return;
  renderHome();
}

// ================== Grammar topics screen ==================
function renderTopics() {
  session = null;
  document.body.dataset.theme = 'grammar';
  const list = $('topicsList');
  list.replaceChildren();

  // Group topics by unit, keeping the book order
  const groups = [];
  catalog.topics.forEach((topic) => {
    let group = groups.find((g) => g.unit === topic.unit);
    if (!group) {
      group = { unit: topic.unit, topics: [] };
      groups.push(group);
    }
    group.topics.push(topic);
  });

  groups.forEach((group) => {
    const box = el('div', 'unit-group');
    const buttons = el('div', 'topic-buttons');
    group.topics.forEach((topic) => {
      const button = el('button', 'topic-btn');
      button.type = 'button';
      const score = progress.best[bestKey('grammar', topic.id)];
      const badge = el('span', 'topic-best', score === undefined ? `${topic.count} Qs` : `${score}%`);
      if (score !== undefined && score >= 70) badge.classList.add('good');
      button.append(el('span', null, topic.title), badge);
      button.addEventListener('click', () => startSession('grammar', topic.id));
      buttons.append(button);
    });
    box.append(el('h3', null, group.unit), buttons);
    list.append(box);
  });

  if (groups.length === 0) {
    list.append(el('p', 'q-message', 'Could not load the topics. Is the server running?'));
  }
  showScreen('topicsScreen');
}

// ================== Starting a session ==================
async function startSession(modeKey, filter = 'all') {
  const mode = MODES[modeKey];
  const current = { modeKey, filter, questions: [], index: 0, score: 0, wrong: [], answered: false };
  session = current;

  let label = mode.label;
  if (modeKey === 'grammar') label = topicTitle(filter);
  if (modeKey.startsWith('vocab')) label = `${mode.label} · ${unitTitle(filter)}`;

  document.body.dataset.theme = mode.theme;
  $('quizLabel').textContent = label;
  $('quizScore').textContent = '⭐ 0';
  $('quizCount').textContent = '';
  $('progressFill').style.width = '0%';
  $('feedback').classList.add('hidden');
  showScreen('quizScreen');
  showMessage('Loading questions… ⏳');

  try {
    const response = await fetch(`/api/questions?${mode.query(filter)}`);
    if (!response.ok) throw new Error(`Server responded with ${response.status}`);
    const questions = await response.json();

    if (session !== current) return; // the user left while we were loading
    if (questions.length === 0) {
      showMessage('There are no questions to practise here yet.', true);
      return;
    }
    current.questions = questions;
    renderQuestion();
  } catch (error) {
    if (session !== current) return;
    console.error(error);
    showMessage('Could not load the questions. Make sure the server is running (npm start) and try again.', true);
  }
}

// Shows a simple message inside the question card (loading or error)
function showMessage(text, withHomeButton = false) {
  const card = $('questionCard');
  card.replaceChildren(el('p', 'q-message', text));
  if (withHomeButton) {
    const button = el('button', 'btn btn-primary', 'Back to home');
    button.type = 'button';
    button.addEventListener('click', renderHome);
    card.append(button);
  }
}

// ================== Rendering questions ==================
function renderQuestion() {
  const question = session.questions[session.index];
  const total = session.questions.length;
  session.answered = false;

  $('quizCount').textContent = `Question ${session.index + 1} of ${total}`;
  $('progressFill').style.width = `${(session.index / total) * 100}%`;
  $('feedback').classList.add('hidden');

  const card = $('questionCard');
  card.replaceChildren();
  card.classList.remove('pop', 'shake');

  if (question.type === 'grammar') renderGrammar(card, question);
  else if (question.type === 'vocab' && session.modeKey === 'vocab-type') renderTypeWord(card, question);
  else if (question.type === 'vocab') renderChooseMeaning(card, question);
  else if (question.type === 'correct') renderCorrect(card, question);
  else renderWordForm(card, question);
}

// Builds a list of answer buttons. onPick receives (chosenText, allButtons, clickedButton).
function buildOptions(options, onPick) {
  const list = el('div', 'options');
  const buttons = options.map((text) => {
    const button = el('button', 'option', text);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (!session.answered) onPick(text, buttons, button);
    });
    list.append(button);
    return button;
  });
  return list;
}

// Disables every option and colours the right (and the chosen wrong) answer
function revealOptions(buttons, correctText, chosenButton) {
  buttons.forEach((button) => {
    button.disabled = true;
    if (button.textContent === correctText) button.classList.add('correct');
    else if (button === chosenButton) button.classList.add('wrong');
  });
}

// A text box + "Check" button. onCheck receives (typedText, input, button).
function buildTypeForm({ placeholder, multiline = false, value = '', onCheck }) {
  const form = el('form', multiline ? 'correct-form' : 'type-form');
  const input = el(multiline ? 'textarea' : 'input', multiline ? 'correct-input' : 'type-input');
  if (!multiline) input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('aria-label', 'Your answer');

  const checkButton = el('button', 'btn btn-primary', 'Check');
  checkButton.type = 'submit';
  form.append(input, checkButton);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (session.answered) return;
    if (!input.value.trim()) {
      input.focus();
      return;
    }
    input.disabled = true;
    checkButton.disabled = true;
    onCheck(input.value.trim(), input);
  });

  // In the text area, Enter checks the answer (Shift + Enter adds a new line)
  if (multiline) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
  }
  return { form, input };
}

// Grammar: choose the option that completes the sentence
function renderGrammar(card, q) {
  const { p, blank } = sentenceWithBlank(q.sentence);
  card.append(
    el('p', 'q-instruction', `${q.topic} · Choose the correct option`),
    p,
    buildOptions(q.options, (chosen, buttons, clicked) => {
      revealOptions(buttons, q.answer, clicked);
      blank.textContent = q.answer;
      blank.classList.add('filled');
      finishAnswer(chosen === q.answer, q, {
        prompt: q.sentence.replace('___', '_____'),
        correctText: q.answer,
        extra: q.explanation
      });
    })
  );
}

// Vocabulary 1: see a word, choose its meaning
function renderChooseMeaning(card, q) {
  card.append(
    el('p', 'q-instruction', 'What does this mean?'),
    el('h2', 'q-word', q.word),
    buildOptions(q.options, (chosen, buttons, clicked) => {
      revealOptions(buttons, q.definition, clicked);
      finishAnswer(chosen === q.definition, q, {
        prompt: q.word,
        correctText: q.definition,
        extra: `Example: “${q.example}”`
      });
    })
  );
}

// Vocabulary 2: read a definition, type the word or phrase
function renderTypeWord(card, q) {
  const words = q.word.split(' ').length;
  const hint = words > 1
    ? `Hint: ${words} words, starts with “${q.word[0]}”`
    : `Hint: starts with “${q.word[0]}” · ${q.word.length} letters`;

  const { form, input } = buildTypeForm({
    placeholder: 'Type the word or phrase…',
    onCheck: (typed, field) => {
      const ok = isAccepted(typed, [q.word]);
      field.classList.add(ok ? 'correct' : 'wrong');
      finishAnswer(ok, q, {
        prompt: q.definition,
        correctText: q.word,
        yourAnswer: typed,
        extra: `Example: “${q.example}”`
      });
    }
  });

  card.append(
    el('p', 'q-instruction', 'Which word or phrase matches this definition?'),
    el('p', 'q-definition', q.definition),
    el('p', 'q-hint', hint),
    form
  );
  input.focus();
}

// Correct the mistake: edit the sentence so it is correct
function renderCorrect(card, q) {
  const { form, input } = buildTypeForm({
    placeholder: 'Rewrite the sentence correctly…',
    multiline: true,
    value: q.sentence,
    onCheck: (typed, field) => {
      const ok = isAccepted(typed, q.answers);
      field.classList.add(ok ? 'correct' : 'wrong');
      const others = q.answers.slice(1);
      finishAnswer(ok, q, {
        prompt: `✘ ${q.sentence}`,
        correctText: q.answers[0],
        yourAnswer: typed,
        extra: others.length ? `${q.explanation} Also correct: ${others.join(' / ')}` : q.explanation
      });
    }
  });

  card.append(
    el('p', 'q-instruction', 'There is one mistake. Edit the sentence to correct it'),
    el('p', 'wrong-sentence', q.sentence),
    form
  );
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

// Word formation: change the word in capitals so it fits the gap
function renderWordForm(card, q) {
  const { p, blank } = sentenceWithBlank(q.sentence);
  const { form, input } = buildTypeForm({
    placeholder: 'Type the correct form…',
    onCheck: (typed, field) => {
      const ok = isAccepted(typed, q.answers);
      field.classList.add(ok ? 'correct' : 'wrong');
      blank.textContent = q.answers[0];
      blank.classList.add('filled');
      finishAnswer(ok, q, {
        prompt: `${q.sentence.replace('___', '_____')} (${q.root})`,
        correctText: q.answers.join(' / '),
        yourAnswer: typed,
        extra: q.explanation
      });
    }
  });

  card.append(
    el('p', 'q-instruction', 'Use the word in capitals to form a word that fits the gap'),
    el('span', 'root-word', q.root),
    p,
    form
  );
  input.focus();
}

// ================== Answer feedback ==================
function finishAnswer(isCorrect, q, details) {
  session.answered = true;

  if (isCorrect) {
    session.score++;
    removeMistake(q.id);
  } else {
    addMistake(q.id);
    session.wrong.push({ prompt: details.prompt, correctText: details.correctText });
  }
  saveProgress();
  $('quizScore').textContent = `⭐ ${session.score}`;

  // Restart the card animation (reading offsetWidth forces the browser to reset it)
  const card = $('questionCard');
  card.classList.remove('pop', 'shake');
  void card.offsetWidth;
  card.classList.add(isCorrect ? 'pop' : 'shake');

  const feedback = $('feedback');
  feedback.className = `feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`;
  feedback.replaceChildren(el('p', 'fb-title', isCorrect ? pickRandom(PRAISE) : 'Not quite! 💪'));

  if (details.yourAnswer && !isCorrect) {
    const yours = el('p', 'fb-answer');
    yours.append(el('strong', null, 'Your answer: '), details.yourAnswer);
    feedback.append(yours);
  }

  const answer = el('p', 'fb-answer');
  answer.append(el('strong', null, isCorrect ? 'Answer: ' : 'Correct answer: '), details.correctText);
  feedback.append(answer);

  if (details.extra) feedback.append(el('p', 'fb-extra', details.extra));

  const isLast = session.index === session.questions.length - 1;
  const nextButton = el('button', 'btn btn-primary', isLast ? 'See results 🎉' : 'Next →');
  nextButton.type = 'button';
  nextButton.addEventListener('click', nextQuestion);
  feedback.append(nextButton);

  nextButton.focus({ preventScroll: true });
  feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function nextQuestion() {
  session.index++;
  if (session.index < session.questions.length) renderQuestion();
  else showResults();
}

// ================== Results ==================
function showResults() {
  const total = session.questions.length;
  const percent = Math.round((session.score / total) * 100);
  $('progressFill').style.width = '100%';

  registerPracticeDay();

  let newRecord = false;
  if (session.modeKey !== 'review') {
    const key = bestKey(session.modeKey, session.filter);
    const previous = progress.best[key];
    if (previous === undefined || percent > previous) {
      progress.best[key] = percent;
      newRecord = previous !== undefined;
    }
  }
  saveProgress();
  $('streakPill').textContent = `🔥 ${currentStreak()}-day streak`;

  let emoji = '🌱';
  let title = 'Keep going!';
  if (percent >= 90) { emoji = '🏆'; title = 'Outstanding!'; }
  else if (percent >= 70) { emoji = '🎉'; title = 'Great work!'; }
  else if (percent >= 50) { emoji = '👍'; title = 'Good effort!'; }

  let message = 'Every mistake is saved so you can review it later.';
  if (newRecord) message = 'New personal best! 🥳';
  if (session.modeKey === 'review') message = 'Questions you got right were removed from your review list.';

  $('resultsEmoji').textContent = emoji;
  $('resultsTitle').textContent = title;
  $('resultsScore').textContent = `${session.score} / ${total}`;
  $('resultsMessage').textContent = message;

  const list = $('mistakeList');
  list.replaceChildren();
  if (session.wrong.length > 0) {
    const box = el('div', 'mistake-review');
    const ul = el('ul');
    session.wrong.forEach((item) => {
      const li = el('li', null, item.prompt);
      li.append(el('span', null, `✔ ${item.correctText}`));
      ul.append(li);
    });
    box.append(el('h3', null, 'Your mistakes'), ul);
    list.append(box);
  }

  const backToTopics = session.modeKey === 'grammar' && session.filter !== 'all';
  $('homeBtn').textContent = backToTopics ? 'All topics' : 'Home';

  // Hide the "again" button when there is nothing left to review
  $('againBtn').classList.toggle('hidden', session.modeKey === 'review' && progress.mistakes.length === 0);

  showScreen('resultsScreen');
  if (percent >= 70) launchConfetti();
}

// ================== Confetti (no libraries) ==================
function launchConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const colors = ['#7c4dff', '#ff6b6b', '#10b3a3', '#ffb703', '#ff4fa3', '#2bc46e'];
  const layer = el('div', 'confetti-layer');
  layer.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < 90; i++) {
    const piece = el('span', 'confetti');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${2 + Math.random() * 1.5}s`;
    piece.style.animationDelay = `${Math.random() * 0.6}s`;
    piece.style.setProperty('--drift', `${Math.random() * 200 - 100}px`);
    layer.append(piece);
  }

  document.body.append(layer);
  setTimeout(() => layer.remove(), 4500);
}

// ================== Event listeners ==================
document.querySelectorAll('[data-start]').forEach((button) => {
  button.addEventListener('click', () => {
    const modeKey = button.dataset.start;
    const filter = modeKey.startsWith('vocab') ? $('unitSelect').value : button.dataset.filter || 'all';
    startSession(modeKey, filter);
  });
});

$('unitSelect').addEventListener('change', () => {
  try {
    localStorage.setItem('toeflSprint.unit', $('unitSelect').value);
  } catch {
    // ignore storage errors
  }
  renderHome();
});

$('openTopicsBtn').addEventListener('click', renderTopics);
$('topicsBackBtn').addEventListener('click', renderHome);
$('logoBtn').addEventListener('click', goHome);
$('quitBtn').addEventListener('click', goHome);
$('homeBtn').addEventListener('click', () => {
  // After a grammar topic, go back to the topic list; otherwise go home
  if (session && session.modeKey === 'grammar' && session.filter !== 'all') renderTopics();
  else renderHome();
});
$('againBtn').addEventListener('click', () => startSession(session.modeKey, session.filter));

renderHome();
loadCatalog();
