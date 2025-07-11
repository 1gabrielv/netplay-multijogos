document.addEventListener('DOMContentLoaded', () => {
    if (window.socket && window.getCurrentRoomId && window.getMySocketId && window.getCurrentPlayersUsernames) {
        const socket = window.socket;
        const gameInfo = document.getElementById('game-info');
        const rockBtn = document.getElementById('rock-btn');
        const paperBtn = document.getElementById('paper-btn');
        const scissorsBtn = document.getElementById('scissors-btn');
        const resultsDisplay = document.getElementById('results');
        const myChoiceDisplay = document.getElementById('my-choice');
        const opponentChoiceDisplay = document.getElementById('opponent-choice');
        const roundStatusDisplay = document.getElementById('round-status');
        const resetBtn = document.getElementById('reset-game-btn');


        let myChoice = null;
        let opponentChoice = null;
        let scores = {};
        let mySID = window.getMySocketId();
        let playersMapSIDToUsername = {}; // Para mapear SID para username

        function enableChoices(enable) {
            rockBtn.disabled = !enable;
            paperBtn.disabled = !enable;
            scissorsBtn.disabled = !enable;
        }

        function resetRoundDisplay() {
            myChoice = null;
            opponentChoice = null;
            myChoiceDisplay.textContent = 'Sua escolha: Nenhuma';
            opponentChoiceDisplay.textContent = 'Escolha do oponente: Nenhuma';
            resultsDisplay.textContent = '';
            roundStatusDisplay.textContent = 'Faça sua escolha!';
            enableChoices(true);
            resetBtn.style.display = 'none'; // Esconde o botão de reset
        }

        rockBtn.addEventListener('click', () => makeChoice('pedra'));
        paperBtn.addEventListener('click', () => makeChoice('papel'));
        scissorsBtn.addEventListener('click', () => makeChoice('tesoura'));

        resetBtn.addEventListener('click', () => {
            const currentRoomId = window.getCurrentRoomId();
            if (currentRoomId) {
                socket.emit('reset_rps', { room_id: currentRoomId });
            }
        });

        function makeChoice(choice) {
            const currentRoomId = window.getCurrentRoomId();
            if (currentRoomId && myChoice === null) { // Só permite uma escolha por rodada
                myChoice = choice;
                myChoiceDisplay.textContent = `Sua escolha: ${choice.toUpperCase()}`;
                roundStatusDisplay.textContent = 'Escolha enviada! Aguardando oponente...';
                enableChoices(false); // Desabilita botões após escolher

                // Envia a escolha via UDP. Não há garantia de entrega, mas é rápido.
                socket.emit('rps_choice', { room_id: currentRoomId, choice: choice });
            } else if (myChoice !== null) {
                alert('Você já fez sua escolha para esta rodada!');
            }
        }

        socket.on('game_start', (data) => {
            playersMapSIDToUsername = data.usernames;
            scores = data.initial_state.scores;
            updateScoresDisplay();
            resetRoundDisplay();
        });

        socket.on('rps_player_ready', (data) => {
            // Este evento pode ser usado para dar feedback mais rápido
            if (data.player_sid !== mySID) {
                roundStatusDisplay.textContent = `Oponente fez sua escolha!`;
            }
        });

        socket.on('rps_round_result', (data) => {
            const p1Username = playersMapSIDToUsername[data.player1_sid];
            const p2Username = playersMapSIDToUsername[data.player2_sid];

            const p1Choice = data.player1_choice;
            const p2Choice = data.player2_choice;

            // Atualiza a exibição da escolha do oponente
            if (data.player1_sid === mySID) {
                opponentChoiceDisplay.textContent = `Escolha do oponente: ${p2Choice.toUpperCase()}`;
            } else {
                opponentChoiceDisplay.textContent = `Escolha do oponente: ${p1Choice.toUpperCase()}`;
            }
            
            let resultText = '';
            if (data.winner_sid === 'draw') {
                resultText = 'Empate!';
            } else if (data.winner_sid === mySID) {
                resultText = 'Você venceu a rodada!';
            } else {
                resultText = 'O oponente venceu a rodada!';
            }
            resultsDisplay.textContent = `Escolhas: ${p1Username} (${p1Choice}) vs ${p2Username} (${p2Choice}). Resultado: ${resultText}`;

            scores = data.scores;
            updateScoresDisplay();
            resetBtn.style.display = 'block'; // Mostra o botão de reset após a rodada
            // Reseta para a próxima rodada após um pequeno delay
            setTimeout(() => {
                resetRoundDisplay();
            }, 3000); // Dá um tempo para o usuário ver o resultado
        });

        socket.on('rps_reset', (data) => {
            playersMapSIDToUsername = data.usernames;
            scores = data.initial_state.scores;
            updateScoresDisplay();
            resetRoundDisplay();
        });

        function updateScoresDisplay() {
            const player1Username = playersMapSIDToUsername[Object.keys(playersMapSIDToUsername)[0]] || 'Jogador 1';
            const player2Username = playersMapSIDToUsername[Object.keys(playersMapSIDToUsername)[1]] || 'Jogador 2';

            const p1Score = scores[Object.keys(playersMapSIDToUsername)[0]] || 0;
            const p2Score = scores[Object.keys(playersMapSIDToUsername)[1]] || 0;

            gameInfo.textContent = `Placar: ${player1Username}: ${p1Score} | ${player2Username}: ${p2Score}`;
        }

        socket.on('game_error', (data) => {
            alert(`Erro no jogo: ${data.message}`);
            enableChoices(true); // Permite tentar novamente
        });

        resetRoundDisplay(); // Inicializa a interface
    } else {
        console.error('Dependências do socket não carregadas para Pedra, Papel e Tesoura.');
    }
});