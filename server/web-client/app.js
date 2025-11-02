// web-client/app.js
// frontend minimal pour prototype
const apiBase = 'http://localhost:3001/api'; // si backend local
let game = null;
let me = null;

document.getElementById('create').onclick = async () => {
  const name = document.getElementById('name').value || 'Player';
  const theme = document.getElementById('theme').value;
  const res = await fetch(apiBase + '/game/create', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ hostName: name, theme })
  });
  const data = await res.json();
  if (!data.ok) return alert('Erreur création partie');
  game = data.game;
  me = game.players[0];
  showGame();
};

document.getElementById('rollBtn').onclick = async () => {
  if (!game || !me) return alert('No game');
  const res = await fetch(`${apiBase}/game/${game.id}/roll`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ playerId: me.id })
  });
  const data = await res.json();
  if (!data.ok) return alert(data.error || 'Error');
  displayQuestion(data.question);
  updateState(data);
};

async function displayQuestion(q) {
  const area = document.getElementById('questionArea');
  if (!q) { area.innerText = 'No question available.'; return; }
  area.innerHTML = '';
  const qDiv = document.createElement('div');
  qDiv.innerHTML = `<div><strong>Question:</strong> ${q.type === 'translation' ? q.prompt_en : q.prompt_en}</div>`;
  area.appendChild(qDiv);

  const input = document.createElement('input');
  input.id = 'answer';
  area.appendChild(input);

  const submit = document.createElement('button');
  submit.innerText = 'Submit';
  submit.onclick = async () => {
    const answer = input.value;
    const res = await fetch(`${apiBase}/game/${game.id}/answer`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ playerId: me.id, questionId: q.id, answer })
    });
    const result = await res.json();
    if (!result.ok) return alert('Erreur sur la réponse');
    alert(result.correct ? 'Correct!' : `Wrong. Correct: ${getCorrectAnswer(q.id)}`);
    // rafraichir l'état de la partie
    const s = await fetch(`${apiBase}/game/${game.id}`);
    const updated = await s.json();
    game = updated.game;
    updateState();
  };
  area.appendChild(submit);

  // bouton pour jouer l'audio si disponible
  if (q.audio) {
    const audioBtn = document.createElement('button');
    audioBtn.innerText = 'Play audio';
    audioBtn.onclick = () => {
      const a = new Audio('/' + q.audio);
      a.play();
    };
    area.appendChild(audioBtn);
  }
}

function getCorrectAnswer(qid) {
  // lecture locale du fichier questions (front n'a pas accès — simple fallback)
  return '(answer stored server-side)';
}

function showGame() {
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  document.getElementById('playersList').innerText = 'Players: ' + game.players.map(p => p.name).join(', ');
  document.getElementById('boardView').innerText = `Board size: ${game.board.size}`;
  updateState();
}

function updateState(data) {
  const s = document.getElementById('stateArea');
  s.innerText = `Turn: ${game.players[game.turnIndex].name}\nPlayers:\n` + game.players.map(p => `${p.name} - pos ${p.pos} - score ${p.score} - xp ${p.xp}`).join('\n');
}
