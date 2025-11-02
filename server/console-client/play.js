// console-client/play.js
// Prototype console (multijoueur local à tour de rôle)
// lit directement server/data/questions.json et server/data/cards.json

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const serverData = path.join(__dirname, '..', 'server', 'data');
const QUESTIONS = JSON.parse(fs.readFileSync(path.join(serverData, 'questions.json')));
const CARDS = JSON.parse(fs.readFileSync(path.join(serverData, 'cards.json')));
const GAMES_FILE = path.join(serverData, 'games.json');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(res => rl.question(q, ans => res(ans))); }

async function main() {
  console.log("=== French Board Game - Prototype Console ===\n");
  const host = await ask("Ton nom (hôte) : ");
  const theme = await ask("Choisis un thème (food/travel/daily) : ") || 'food';

  // création de la partie en mémoire
  const game = {
    id: 'g-' + Date.now(),
    theme,
    players: [{ id: 'p1', name: host || 'Host', avatar: 'chef', pos: 0, score: 0, xp: 0, loseTurn: false }],
    turnIndex: 0,
    board: { size: 50 },
    history: []
  };

  // ajouter joueurs
  while (game.players.length < 5) {
    const nm = await ask("Ajouter un joueur (nom) ou Entrée pour commencer : ");
    if (!nm) break;
    game.players.push({ id: 'p' + (game.players.length + 1), name: nm, avatar: 'parisien', pos: 0, score: 0, xp: 0, loseTurn: false });
  }

  console.log(`\nPartie créée avec ${game.players.length} joueurs. Début du jeu.\n`);

  while (true) {
    const p = game.players[game.turnIndex];
    console.log(`\n-- Tour de ${p.name} (pos ${p.pos}, score ${p.score})`);

    if (p.loseTurn) {
      console.log(`${p.name} perd ce tour.`);
      p.loseTurn = false;
    } else {
      const die = Math.floor(Math.random() * 6) + 1;
      p.pos += die;
      if (p.pos > game.board.size) p.pos = game.board.size;
      console.log(`${p.name} lance le dé : ${die} -> position ${p.pos}`);

      // sélection question
      const level = p.pos < 18 ? 'level1' : (p.pos < 36 ? 'level2' : 'level3');
      const pool = (QUESTIONS.themes[theme] && QUESTIONS.themes[theme][level]) || [];
      const q = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;

      if (!q) {
        console.log("Pas de question disponible pour ce niveau/thème. On passe.");
      } else {
        if (q.type === 'translation' || q.type === 'fill') {
          const ans = await ask(`Question (${q.type}): "${q.prompt_en}"\nTa réponse en français : `);
          const correct = (ans || '').trim().toLowerCase() === (q.answer_fr || '').toLowerCase();
          if (correct) {
            console.log("✅ Correct! +10 points, +5 XP");
            p.score += 10;
            p.xp += 5;
          } else {
            console.log(`❌ Mauvaise réponse. Réponse correcte : ${q.answer_fr}`);
          }
        } else {
          console.log("Type de question inconnu. On saute.");
        }
      }

      // carte chance
      if (Math.random() < 0.15 && CARDS.length) {
        const card = CARDS[Math.floor(Math.random() * CARDS.length)];
        console.log(`Carte tirée: ${card.title} - ${card.description}`);
        if (card.effect.move) {
          p.pos = Math.min(game.board.size, p.pos + card.effect.move);
          console.log(`${p.name} avance à ${p.pos}`);
        }
        if (card.effect.loseTurn) {
          p.loseTurn = true;
          console.log(`${p.name} perd le prochain tour.`);
        }
        if (card.effect.xp) {
          p.xp += card.effect.xp;
          console.log(`${p.name} gagne ${card.effect.xp} XP`);
        }
      }
    }

    // vérifier fin
    if (p.pos >= game.board.size) {
      console.log(`\n🎉 ${p.name} atteint la fin et gagne la partie! Score final: ${p.score}`);
      break;
    }

    // avancer le tour
    game.turnIndex = (game.turnIndex + 1) % game.players.length;
  }

  rl.close();
}

main();
