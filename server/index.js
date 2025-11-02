// server/index.js
// Serveur Express basique pour prototype French-board-game
// commentaires en français pour aide pédagogique

const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const CARDS_FILE = path.join(DATA_DIR, 'cards.json');

app.use(express.json());
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// helpers
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error('Erreur lecture JSON', filePath, e);
    return null;
  }
}
function saveJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

ensureDir(DATA_DIR);
if (!fs.existsSync(GAMES_FILE)) saveJSON(GAMES_FILE, { games: [] });
const QUESTIONS = loadJSON(QUESTIONS_FILE) || { themes: {} };
const CARDS = loadJSON(CARDS_FILE) || [];

// API routes

// créer une nouvelle partie
app.post('/api/game/create', (req, res) => {
  const { theme = 'food', hostName = 'Host' } = req.body;
  const gamesData = loadJSON(GAMES_FILE);
  const id = uuidv4();
  const newGame = {
    id,
    theme,
    players: [
      { id: uuidv4(), name: hostName, avatar: 'chef', pos: 0, score: 0, xp: 0, loseTurn: false }
    ],
    turnIndex: 0,
    board: { size: 50 },
    history: [],
    createdAt: new Date().toISOString()
  };
  gamesData.games.push(newGame);
  saveJSON(GAMES_FILE, gamesData);
  res.json({ ok: true, game: newGame });
});

// rejoindre une partie
app.post('/api/game/:gameId/join', (req, res) => {
  const { gameId } = req.params;
  const { name, avatar } = req.body;
  const gamesData = loadJSON(GAMES_FILE);
  const game = gamesData.games.find(g => g.id === gameId);
  if (!game) return res.status(404).json({ ok: false, error: 'Game not found' });
  if (game.players.length >= 5) return res.status(400).json({ ok: false, error: 'Game is full' });
  const player = { id: uuidv4(), name, avatar: avatar || 'parisien', pos: 0, score: 0, xp: 0, loseTurn: false };
  game.players.push(player);
  saveJSON(GAMES_FILE, gamesData);
  res.json({ ok: true, player, game });
});

// obtenir état de la partie
app.get('/api/game/:gameId', (req, res) => {
  const gamesData = loadJSON(GAMES_FILE);
  const game = gamesData.games.find(g => g.id === req.params.gameId);
  if (!game) return res.status(404).json({ ok: false, error: 'Game not found' });
  res.json({ ok: true, game });
});

// lancer le dé (tour du joueur)
// corps: { playerId }
app.post('/api/game/:gameId/roll', (req, res) => {
  const { gameId } = req.params;
  const { playerId } = req.body;
  const gamesData = loadJSON(GAMES_FILE);
  const game = gamesData.games.find(g => g.id === gameId);
  if (!game) return res.status(404).json({ ok: false, error: 'Game not found' });

  const currentPlayer = game.players[game.turnIndex];
  if (currentPlayer.id !== playerId) return res.status(400).json({ ok: false, error: 'Not your turn' });
  if (currentPlayer.loseTurn) {
    currentPlayer.loseTurn = false;
    game.turnIndex = (game.turnIndex + 1) % game.players.length;
    saveJSON(GAMES_FILE, gamesData);
    return res.json({ ok: true, message: 'You lost this turn', game });
  }

  const die = Math.floor(Math.random() * 6) + 1;
  currentPlayer.pos += die;
  if (currentPlayer.pos > game.board.size) currentPlayer.pos = game.board.size;

  // tirage de carte possible
  const card = Math.random() < 0.15 && CARDS.length ? CARDS[Math.floor(Math.random() * CARDS.length)] : null;

  // historique (on stocke la carte mais les effets sont appliqués après la réponse)
  game.history.push({ type: 'roll', playerId, die, pos: currentPlayer.pos, card });

  saveJSON(GAMES_FILE, gamesData);

  // préparer question en fonction du thème et niveau progressif
  const themeData = QUESTIONS.themes[game.theme];
  const levelKey = currentPlayer.pos < 18 ? 'level1' : (currentPlayer.pos < 36 ? 'level2' : 'level3');
  const pool = (themeData && themeData[levelKey]) || [];
  const question = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;

  res.json({ ok: true, die, pos: currentPlayer.pos, card, question });
});

// soumettre une réponse
// corps: { playerId, questionId, answer }
app.post('/api/game/:gameId/answer', (req, res) => {
  const { gameId } = req.params;
  const { playerId, questionId, answer } = req.body;
  const gamesData = loadJSON(GAMES_FILE);
  const game = gamesData.games.find(g => g.id === gameId);
  if (!game) return res.status(404).json({ ok: false, error: 'Game not found' });
  const player = game.players.find(p => p.id === playerId);
  if (!player) return res.status(404).json({ ok: false, error: 'Player not found' });

  // chercher la question
  let found = null;
  for (const t of Object.values(QUESTIONS.themes || {})) {
    for (const lvl of Object.values(t)) {
      const q = (lvl || []).find(x => x.id === questionId);
      if (q) { found = q; break; }
    }
    if (found) break;
  }
  if (!found) return res.status(404).json({ ok: false, error: 'Question not found' });

  const normalize = s => (s||'').toString().trim().toLowerCase();
  const correct = normalize(found.answer_fr) === normalize(answer);

  if (correct) {
    player.score = (player.score || 0) + 10;
    player.xp = (player.xp || 0) + 5;
  }

  // appliquer effets de carte si présents dans le dernier historique
  const last = game.history[game.history.length - 1];
  if (last && last.card && last.card.effect) {
    const eff = last.card.effect;
    if (eff.move) player.pos = Math.min(game.board.size, player.pos + eff.move);
    if (eff.loseTurn) player.loseTurn = true;
  }

  game.turnIndex = (game.turnIndex + 1) % game.players.length;
  game.history.push({ type: 'answer', playerId, questionId, given: answer, correct });

  saveJSON(GAMES_FILE, gamesData);
  res.json({ ok: true, correct, score: player.score, xp: player.xp, game });
});

// endpoint debug: lister les parties
app.get('/api/games', (req, res) => {
  const gamesData = loadJSON(GAMES_FILE);
  res.json({ ok: true, games: gamesData.games });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
