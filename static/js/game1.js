document.addEventListener('DOMContentLoaded', () => {
    // Verificações de dependência
    if (!window.socket || !window.getCurrentRoomId || !window.getMySocketId || !window.getCurrentPlayersUsernames) {
        console.error('Dependências do socket ou variáveis globais não carregadas para Jogo da Velha.');
        return; // Sai se as dependências não estiverem prontas
    }

    const socket = window.socket;
    const gameInfo = document.getElementById('game-info');
    const boardElement = document.getElementById('tic-tac-toe-board');
    const cells = document.querySelectorAll('.cell');
    const resetBtn = document.getElementById('reset-game-btn');

    let currentBoard = ['', '', '', '', '', '', '', '', ''];
    let myPlayerMark = ''; // 'X' or 'O'
    let currentTurnSID = '';
    let mySID = window.getMySocketId();
    let playersMapSIDToUsername = {}; 
    let gameEnded = false; 
    let gameStarted = false; 

    // Função para habilitar ou desabilitar as células
    function setBoardClickable(isClickable) {
        cells.forEach(cell => {
            if (isClickable) {
                // Remove o estilo para permitir cliques e opacidade normal
                cell.style.pointerEvents = 'auto';
                cell.style.opacity = '1';
            } else {
                // Adiciona o estilo para desabilitar cliques e opacidade reduzida
                cell.style.pointerEvents = 'none';
                cell.style.opacity = '0.7'; 
            }
        });
    }

    cells.forEach(cell => {
        // Remove qualquer listener antigo para evitar duplicação em reinícios
        // (Isso é mais robusto em SPA ou com resets complexos, mas não custa aqui)
        // cell.removeEventListener('click', handleCellClick); // Necessitaria de uma função nomeada

        cell.addEventListener('click', function handleCellClick(e) {
            const index = parseInt(e.target.dataset.index);
            const currentRoomId = window.getCurrentRoomId();

            if (gameEnded) {
                alert('O jogo já acabou. Reinicie para jogar novamente.');
                return;
            }

            if (!currentRoomId || !gameStarted) {
                alert('Por favor, entre em uma sala e aguarde o jogo começar.');
                return;
            }

            if (currentTurnSID !== mySID) {
                gameInfo.textContent = 'Não é a sua vez!';
                return;
            }

            if (currentBoard[index] !== '') {
                gameInfo.textContent = 'Essa célula já está ocupada!';
                return;
            }
            
            // Se tudo OK, envia o movimento
            socket.emit('tic_tac_toe_move', { room_id: currentRoomId, cell_index: index });
            gameInfo.textContent = 'Sua jogada enviada. Aguardando oponente...';
            setBoardClickable(false); // Desabilita o tabuleiro após a jogada
        });
    });

    resetBtn.addEventListener('click', () => {
        const currentRoomId = window.getCurrentRoomId();
        if (currentRoomId) {
            socket.emit('reset_tic_tac_toe', { room_id: currentRoomId });
        }
    });

    socket.on('game_start', (data) => {
        currentBoard = data.initial_state.board;
        currentTurnSID = data.initial_state.current_turn;
        playersMapSIDToUsername = data.usernames; 
        myPlayerMark = data.player_roles[mySID]; 
        gameEnded = false;
        gameStarted = true; 
        updateBoardDisplay();
        updateGameInfo(); // Esta função chamará setBoardClickable()
        resetBtn.style.display = 'none'; 
    });

    socket.on('tic_tac_toe_update', (data) => {
        currentBoard = data.board;
        currentTurnSID = data.current_turn; 
        updateBoardDisplay();
        updateGameInfo(data.winner, data.player_mark, data.cell_index);

        if (data.winner || data.board.every(cell => cell !== '')) { 
            gameEnded = true;
            resetBtn.style.display = 'block';
        } 
        // updateGameInfo já cuidará de setBoardClickable()
    });

    socket.on('tic_tac_toe_reset', (data) => {
        currentBoard = data.initial_state.board;
        currentTurnSID = data.initial_state.current_turn;
        playersMapSIDToUsername = data.usernames; 
        myPlayerMark = data.initial_state.players_map[mySID]; 
        gameEnded = false;
        gameStarted = true; 
        updateBoardDisplay();
        updateGameInfo(); // Isso chamará setBoardClickable()
        resetBtn.style.display = 'none';
    });

    socket.on('game_error', (data) => {
        alert(`Erro no jogo: ${data.message}`);
        updateGameInfo(); // Reatualiza o status, o que pode reabilitar o tabuleiro se for sua vez.
    });

    function updateBoardDisplay() {
        cells.forEach((cell, index) => {
            cell.textContent = currentBoard[index];
            cell.classList.remove('x', 'o'); 
            if (currentBoard[index] !== '') {
                cell.classList.add(currentBoard[index].toLowerCase()); 
            }
        });
    }

    function updateGameInfo(winner = null, playerMark = null, cellIndex = null) {
        let infoText = '';
        let shouldEnableBoard = false; 

        if (winner) {
            gameEnded = true; 
            if (winner === 'draw') {
                infoText = 'Fim de jogo: Empate!';
            } else if (winner === mySID) {
                infoText = `Vencedor: Você (${myPlayerMark})!`;
            } else {
                const opponentSID = Object.keys(playersMapSIDToUsername).find(sid => sid !== mySID);
                const opponentUsername = playersMapSIDToUsername[opponentSID] || 'Oponente';
                const opponentMark = myPlayerMark === 'X' ? 'O' : 'X'; 
                infoText = `Vencedor: ${opponentUsername} (${opponentMark})!`; 
            }
            shouldEnableBoard = false; 
        } else if (gameStarted) { 
            if (currentTurnSID === mySID) {
                infoText = `Sua vez de jogar (${myPlayerMark})! Clique em uma célula.`;
                shouldEnableBoard = true; 
            } else {
                const opponentSID = Object.keys(playersMapSIDToUsername).find(sid => sid !== mySID);
                const opponentUsername = playersMapSIDToUsername[opponentSID] || 'Oponente';
                const opponentMark = myPlayerMark === 'X' ? 'O' : 'X';
                infoText = `Vez do ${opponentUsername} (${opponentMark}). Aguarde.`;
                shouldEnableBoard = false; 
            }
        } else { 
             infoText = 'Aguardando oponentes para começar o jogo...';
             shouldEnableBoard = false; 
        }
        gameInfo.textContent = infoText;
        setBoardClickable(shouldEnableBoard); // Aplica a habilitação/desabilitação
    }

    // Função de reset específica para ser chamada pelo script.js principal
    window.resetGameSpecific = () => {
        currentBoard = ['', '', '', '', '', '', '', '', ''];
        myPlayerMark = '';
        currentTurnSID = '';
        gameEnded = false;
        gameStarted = false; 
        playersMapSIDToUsername = {};
        updateBoardDisplay();
        updateGameInfo(); // Isso chamará setBoardClickable(false)
        resetBtn.style.display = 'none';
    };

    // Inicializa a exibição ao carregar.
    // updateGameInfo() será chamada e definirá o estado inicial do tabuleiro como desabilitado.
    updateBoardDisplay();
    updateGameInfo(); 
    // Não chame setBoardClickable(false) aqui diretamente. updateGameInfo() já o faz.
});