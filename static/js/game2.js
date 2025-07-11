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
        let scores = {};
        let mySID = window.getMySocketId();
        let playersMapSIDToUsername = {}; // Para mapear SID para username
        let gameActive = false; // Controla se o jogo está ativo (2 jogadores)

        function enableChoices(enable) {
            rockBtn.disabled = !enable;
            paperBtn.disabled = !enable;
            scissorsBtn.disabled = !enable;
            if (enable) {
                rockBtn.style.opacity = '1';
                paperBtn.style.opacity = '1';
                scissorsBtn.style.opacity = '1';
            } else {
                rockBtn.style.opacity = '0.7';
                paperBtn.style.opacity = '0.7';
                scissorsBtn.style.opacity = '0.7';
            }
        }

        function resetRoundDisplay() {
            myChoice = null;
            opponentChoice = null;
            myChoiceDisplay.textContent = 'Sua escolha: Nenhuma';
            opponentChoiceDisplay.textContent = 'Escolha do oponente: Nenhuma';
            resultsDisplay.textContent = '';
            roundStatusDisplay.textContent = 'Faça sua escolha!';
            if (gameActive) { // Só habilita se o jogo estiver ativo
                enableChoices(true);
            } else {
                enableChoices(false);
            }
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
            if (!currentRoomId || !gameActive) {
                alert('Aguarde o jogo começar ou entre em uma sala.');
                return;
            }

            if (myChoice === null) { // Só permite uma escolha por rodada
                myChoice = choice;
                myChoiceDisplay.textContent = `Sua escolha: ${choice.toUpperCase()}`;
                roundStatusDisplay.textContent = 'Escolha enviada! Aguardando oponente...';
                enableChoices(false); // Desabilita botões após escolher

                // Envia a escolha via UDP. Não há garantia de entrega, mas é rápido.
                socket.emit('rps_choice', { room_id: currentRoomId, choice: choice });
            } else {
                alert('Você já fez sua escolha para esta rodada!');
            }
        }

        socket.on('game_start', (data) => {
            playersMapSIDToUsername = data.usernames;
            scores = data.initial_state.scores;
            gameActive = true;
            updateScoresDisplay();
            resetRoundDisplay();
        });

        socket.on('rps_player_ready', (data) => {
            if (data.player_sid !== mySID) {
                roundStatusDisplay.textContent = `Oponente fez sua escolha!`;
            }
        });

        socket.on('rps_round_result', (data) => {
            const p1Username = playersMapSIDToUsername[data.player1_sid] || 'Jogador 1';
            const p2Username = playersMapSIDToUsername[data.player2_sid] || 'Jogador 2';

            const p1Choice = data.player1_choice;
            const p2Choice = data.player2_choice;

            // Atualiza a exibição da escolha do oponente
            if (data.player1_sid === mySID) { // Se eu sou o player 1, a escolha do oponente é p2Choice
                opponentChoiceDisplay.textContent = `Escolha do oponente: ${p2Choice ? p2Choice.toUpperCase() : 'Aguardando'}`;
            } else { // Se eu sou o player 2, a escolha do oponente é p1Choice
                opponentChoiceDisplay.textContent = `Escolha do oponente: ${p1Choice ? p1Choice.toUpperCase() : 'Aguardando'}`;
            }
            
            let resultText = '';
            if (data.winner_sid === 'draw') {
                resultText = 'Empate!';
            } else if (data.winner_sid === mySID) {
                resultText = 'Você venceu a rodada!';
            } else {
                resultText = `${playersMapSIDToUsername[data.winner_sid] || 'O oponente'} venceu a rodada!`;
            }
            resultsDisplay.textContent = `Escolhas: ${p1Username} (${p1Choice}) vs ${p2Username} (${p2Choice}). Resultado: ${resultText}`;

            scores = data.scores;
            updateScoresDisplay();
            resetBtn.style.display = 'block'; 
            // Reseta para a próxima rodada após um pequeno delay
            setTimeout(() => {
                resetRoundDisplay();
            }, 3000); 
        });

        socket.on('rps_reset', (data) => {
            playersMapSIDToUsername = data.usernames;
            scores = data.initial_state.scores;
            gameActive = true;
            updateScoresDisplay();
            resetRoundDisplay();
        });

        function updateScoresDisplay() {
            // Pega os SIDs na ordem em que foram armazenados no servidor
            const playerSidsInOrder = window.getPlayersSidsInOrder(); 
            const player1Sid = playerSidsInOrder[0];
            const player2Sid = playerSidsInOrder[1];

            const player1Username = playersMapSIDToUsername[player1Sid] || 'Jogador 1';
            const player2Username = playersMapSIDToUsername[player2Sid] || 'Jogador 2';

            const p1Score = scores[player1Sid] || 0;
            const p2Score = scores[player2Sid] || 0;

            gameInfo.textContent = `Placar: ${player1Username}: ${p1Score} | ${player2Username}: ${p2Score}`;
        }

        socket.on('game_error', (data) => {
            alert(`Erro no jogo: ${data.message}`);
            // Se o jogo está ativo, reabilita as escolhas para o usuário tentar novamente
            if (gameActive) {
                enableChoices(true); 
            }
        });

        // Função de reset específica para ser chamada pelo script.js principal
        window.resetGameSpecific = () => {
            myChoice = null;
            scores = {};
            playersMapSIDToUsername = {};
            gameActive = false;
            resetRoundDisplay();
            gameInfo.textContent = 'Aguardando oponentes para começar o jogo...';
        };

        resetRoundDisplay(); // Inicializa a interface
        gameInfo.textContent = 'Aguardando oponentes para começar o jogo...'; // Mensagem inicial
    } else {
        console.error('Dependências do socket não carregadas para Pedra, Papel e Tesoura.');
    }
});