document.addEventListener('DOMContentLoaded', () => {
    // Verificações de dependência
    if (!window.socket || !window.getCurrentRoomId || !window.getMySocketId || !window.getCurrentPlayersUsernames) {
        console.error('Dependências do socket ou variáveis globais não carregadas para Pedra, Papel e Tesoura. Recarregue a página.');
        document.getElementById('game-info').textContent = 'Aguardando conexão...';
        enableChoices(false); // Garante que botões estejam desabilitados
        return; 
    }

    const socket = window.socket;
    const gameInfo = document.getElementById('game-info'); // Usado para placar
    const rockBtn = document.getElementById('rock-btn');
    const paperBtn = document.getElementById('paper-btn');
    const scissorsBtn = document.getElementById('scissors-btn');
    const resultsDisplay = document.getElementById('results'); // Usado para resultado da rodada
    const myChoiceDisplay = document.getElementById('my-choice');
    const opponentChoiceDisplay = document.getElementById('opponent-choice');
    const roundStatusDisplay = document.getElementById('round-status'); // Usado para status atual da rodada
    const resetBtn = document.getElementById('reset-game-btn'); // Novo botão de reset

    let myChoice = null;
    let scores = {};
    // mySID será lido via função window.getMySocketId() quando necessário
    let playersMapSIDToUsername = {}; 
    let gameActive = false; 
    let player1Sid = null; // Para manter a ordem dos jogadores e seus SIDs
    let player2Sid = null;

    function enableChoices(enable) {
        rockBtn.disabled = !enable;
        paperBtn.disabled = !enable;
        scissorsBtn.disabled = !enable;
        if (enable) {
            rockBtn.style.opacity = '1';
            paperBtn.style.opacity = '1';
            scissorsBtn.style.opacity = '1';
            rockBtn.style.cursor = 'pointer';
            paperBtn.style.cursor = 'pointer';
            scissorsBtn.style.cursor = 'pointer';
        } else {
            rockBtn.style.opacity = '0.7';
            paperBtn.style.opacity = '0.7';
            scissorsBtn.style.opacity = '0.7';
            rockBtn.style.cursor = 'default';
            paperBtn.style.cursor = 'default';
            scissorsBtn.style.cursor = 'default';
        }
    }

    function resetRoundDisplay() {
        console.log('[RPS] Resetting round display.');
        myChoice = null;
        opponentChoice = null; // Limpa a escolha do oponente também
        myChoiceDisplay.textContent = 'Sua escolha: Nenhuma';
        opponentChoiceDisplay.textContent = 'Escolha do oponente: Nenhuma';
        resultsDisplay.textContent = '';
        roundStatusDisplay.textContent = 'Faça sua escolha!';
        if (gameActive) { 
            enableChoices(true);
        } else {
            enableChoices(false);
        }
        resetBtn.style.display = 'none'; // Esconde o botão de reset ao iniciar a rodada
    }

    // Event Listeners para os botões de escolha
    rockBtn.addEventListener('click', () => makeChoice('pedra'));
    paperBtn.addEventListener('click', () => makeChoice('papel'));
    scissorsBtn.addEventListener('click', () => makeChoice('tesoura'));

    // Event Listener para o botão de reset
    resetBtn.addEventListener('click', () => {
        const currentRoomId = window.getCurrentRoomId();
        if (currentRoomId) {
            console.log(`[RPS] Emitting reset_rps for room ${currentRoomId}`);
            socket.emit('reset_rps', { room_id: currentRoomId });
        }
    });

    function makeChoice(choice) {
        const currentRoomId = window.getCurrentRoomId();
        const myCurrentSID = window.getMySocketId(); // Obtém o SID mais atualizado

        if (!currentRoomId || !gameActive) {
            alert('Aguarde o jogo começar ou entre em uma sala.');
            return;
        }

        if (myChoice === null) { 
            myChoice = choice;
            myChoiceDisplay.textContent = `Sua escolha: ${choice.toUpperCase()}`;
            roundStatusDisplay.textContent = 'Escolha enviada! Aguardando oponente...';
            enableChoices(false); 

            console.log(`[RPS] Emitting rps_choice: ${choice} from ${myCurrentSID}`);
            socket.emit('rps_choice', { room_id: currentRoomId, choice: choice });
        } else {
            alert('Você já fez sua escolha para esta rodada!');
        }
    }

    // Recebe o evento de início do jogo
    socket.on('game_start', (data) => {
        console.log('[RPS] game_start event received.');
        playersMapSIDToUsername = data.usernames;
        scores = data.initial_state.scores;
        player1Sid = data.players_sids[0]; // Guarda os SIDs dos jogadores na ordem
        player2Sid = data.players_sids[1];
        gameActive = true;
        updateScoresDisplay(); // Atualiza o placar
        resetRoundDisplay(); // Prepara para a primeira rodada
        console.log(`[RPS] Game started. Player 1: ${playersMapSIDToUsername[player1Sid]}, Player 2: ${playersMapSIDToUsername[player2Sid]}`);
    });

    // Recebe feedback de que um jogador fez a escolha (UDP)
    socket.on('rps_player_ready', (data) => {
        const myCurrentSID = window.getMySocketId();
        if (data.player_sid !== myCurrentSID) {
            roundStatusDisplay.textContent = `Oponente fez sua escolha!`;
            console.log(`[RPS] Opponent (${playersMapSIDToUsername[data.player_sid]}) ready.`);
        }
    });

    // Recebe o resultado da rodada (UDP)
    socket.on('rps_round_result', (data) => {
        console.log('[RPS] rps_round_result event received.');
        const myCurrentSID = window.getMySocketId();

        const p1Username = playersMapSIDToUsername[data.player1_sid] || 'Jogador 1';
        const p2Username = playersMapSIDToUsername[data.player2_sid] || 'Jogador 2';

        const p1Choice = data.player1_choice;
        const p2Choice = data.player2_choice;

        // Atualiza a exibição da escolha do oponente
        if (data.player1_sid === myCurrentSID) {
            opponentChoiceDisplay.textContent = `Escolha do oponente: ${p2Choice ? p2Choice.toUpperCase() : 'N/A'}`;
        } else {
            opponentChoiceDisplay.textContent = `Escolha do oponente: ${p1Choice ? p1Choice.toUpperCase() : 'N/A'}`;
        }
        
        let resultText = '';
        if (data.winner_sid === 'draw') {
            resultText = 'Empate!';
        } else if (data.winner_sid === myCurrentSID) {
            resultText = 'Você VENCEU a rodada!';
        } else {
            resultText = `${playersMapSIDToUsername[data.winner_sid] || 'O oponente'} VENCEU a rodada!`;
        }
        
        // Mensagem de resultado mais bonita e concisa
        let messageLine1 = `Rodada: ${p1Username} escolheu ${p1Choice.toUpperCase()}, ${p2Username} escolheu ${p2Choice.toUpperCase()}.`;
        let messageLine2 = `Resultado: ${resultText}`;
        
        resultsDisplay.innerHTML = `${messageLine1}<br>${messageLine2}`; // Usa innerHTML para quebrar linha
        roundStatusDisplay.textContent = 'Rodada encerrada!';

        scores = data.scores; // Atualiza o objeto de scores com o novo placar
        updateScoresDisplay(); // Chama para atualizar o placar exibido

        resetBtn.style.display = 'block'; // Mostra o botão de reset após a rodada

        setTimeout(() => {
            resetRoundDisplay(); // Reseta a interface para a próxima rodada após 3 segundos
            console.log('[RPS] Resetting round for next play.');
        }, 3000); 
    });

    // Recebe o evento de reset do jogo
    socket.on('rps_reset', (data) => {
        console.log('[RPS] rps_reset event received.');
        playersMapSIDToUsername = data.usernames;
        scores = data.initial_state.scores;
        player1Sid = data.initial_state.player1_sid; // Garante que SIDs estejam atualizados
        player2Sid = data.initial_state.player2_sid;
        gameActive = true; // Reinicia como ativo
        updateScoresDisplay();
        resetRoundDisplay();
        console.log('[RPS] Game reset. Ready for new rounds.');
    });

    function updateScoresDisplay() {
        // Usa player1Sid e player2Sid que foram armazenados na inicialização/reset do jogo
        const p1Username = playersMapSIDToUsername[player1Sid] || 'Jogador 1';
        const p2Username = playersMapSIDToUsername[player2Sid] || 'Jogador 2';

        const p1Score = scores[player1Sid] || 0;
        const p2Score = scores[player2Sid] || 0;

        gameInfo.textContent = `Placar: ${p1Username}: ${p1Score} | ${p2Username}: ${p2Score}`;
        console.log(`[RPS] Scores updated: ${p1Username}: ${p1Score}, ${p2Username}: ${p2Score}`);
    }

    socket.on('game_error', (data) => {
        alert(`Erro no jogo: ${data.message}`);
        console.error(`[RPS] Game Error: ${data.message}`);
        if (gameActive) { // Só habilita se o jogo estiver supostamente ativo
            enableChoices(true); 
        }
    });

    // Função de reset específica para ser chamada pelo script.js principal
    window.resetGameSpecific = () => {
        console.log('[RPS] window.resetGameSpecific called.');
        myChoice = null;
        scores = {};
        playersMapSIDToUsername = {};
        gameActive = false;
        player1Sid = null;
        player2Sid = null;
        resetRoundDisplay();
        gameInfo.textContent = 'Aguardando oponentes para começar o jogo...';
    };

    console.log('[RPS] Script loaded. Initializing UI state.');
    resetRoundDisplay(); // Inicializa a interface (desabilitando botões, etc.)
    gameInfo.textContent = 'Aguardando oponentes para começar o jogo...'; // Mensagem inicial
});