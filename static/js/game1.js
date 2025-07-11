document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificações de dependência iniciais
    if (!window.socket || !window.getCurrentRoomId || !window.getMySocketId || !window.getCurrentPlayersUsernames) {
        console.error('Dependências do socket ou variáveis globais não carregadas para Jogo da Velha. Recarregue a página.');
        // Se as dependências não estão prontas, a UI deve estar em estado de espera.
        document.getElementById('game-info').textContent = 'Aguardando conexão...';
        setBoardClickable(false); // Garante que o tabuleiro não é clicável
        return; 
    }

    const socket = window.socket;
    const gameInfo = document.getElementById('game-info');
    const boardElement = document.getElementById('tic-tac-toe-board');
    const cells = document.querySelectorAll('.cell');
    const resetBtn = document.getElementById('reset-game-btn');

    let currentBoard = ['', '', '', '', '', '', '', '', ''];
    let myPlayerMark = ''; 
    let currentTurnSID = '';
    // mySID agora será lido via função quando necessário
    let playersMapSIDToUsername = {}; 
    let gameEnded = false; 
    let gameStarted = false; 

    // 2. Função para controlar a clicabilidade e aparência do tabuleiro
    function setBoardClickable(isClickable) {
        console.log(`[TicTacToe] setBoardClickable: ${isClickable}`);
        cells.forEach(cell => {
            if (isClickable) {
                cell.style.pointerEvents = 'auto';
                cell.style.opacity = '1';
                cell.style.cursor = 'pointer'; // Adiciona cursor de ponteiro
            } else {
                cell.style.pointerEvents = 'none';
                cell.style.opacity = '0.7'; 
                cell.style.cursor = 'default'; // Cursor padrão
            }
        });
    }

    // 3. Adiciona o Event Listener para as células
    cells.forEach(cell => {
        cell.addEventListener('click', function handleCellClick(e) {
            const index = parseInt(e.target.dataset.index);
            const currentRoomId = window.getCurrentRoomId();
            const myCurrentSID = window.getMySocketId(); // Obtém o SID mais atualizado

            console.log(`[TicTacToe] Cell ${index} clicked. Current SID: ${myCurrentSID}, Current Turn: ${currentTurnSID}`);

            if (gameEnded) {
                alert('O jogo já acabou. Reinicie para jogar novamente.');
                return;
            }

            if (!currentRoomId || !gameStarted) {
                alert('Por favor, entre em uma sala e aguarde o jogo começar.');
                return;
            }

            if (myCurrentSID !== currentTurnSID) { // Usa myCurrentSID
                gameInfo.textContent = 'Não é a sua vez!';
                console.log(`[TicTacToe] Not my turn. My SID: ${myCurrentSID}, Expected turn: ${currentTurnSID}`);
                return;
            }

            if (currentBoard[index] !== '') {
                gameInfo.textContent = 'Essa célula já está ocupada!';
                console.log(`[TicTacToe] Cell ${index} already occupied.`);
                return;
            }
            
            // Se tudo OK, envia o movimento
            console.log(`[TicTacToe] Emitting tic_tac_toe_move for cell ${index}`);
            socket.emit('tic_tac_toe_move', { room_id: currentRoomId, cell_index: index });
            gameInfo.textContent = 'Sua jogada enviada. Aguardando oponente...';
            setBoardClickable(false); // Desabilita o tabuleiro após a jogada
        });
    });

    // 4. Event Listener para o botão de reset
    resetBtn.addEventListener('click', () => {
        const currentRoomId = window.getCurrentRoomId();
        if (currentRoomId) {
            console.log(`[TicTacToe] Emitting reset_tic_tac_toe for room ${currentRoomId}`);
            socket.emit('reset_tic_tac_toe', { room_id: currentRoomId });
        }
    });

    // 5. Sockets Listeners
    socket.on('game_start', (data) => {
        console.log('[TicTacToe] game_start event received.');
        currentBoard = data.initial_state.board;
        currentTurnSID = data.initial_state.current_turn;
        playersMapSIDToUsername = data.usernames; 
        // myPlayerMark é atribuído aqui no game_start
        myPlayerMark = data.player_roles[window.getMySocketId()]; // Garante que a marca seja atribuída
        gameEnded = false;
        gameStarted = true; 
        updateBoardDisplay();
        updateGameInfo(); // Esta função chamará setBoardClickable()
        resetBtn.style.display = 'none'; 
        console.log(`[TicTacToe] Game started. My Mark: ${myPlayerMark}. Turn: ${currentTurnSID}`);
    });

    socket.on('tic_tac_toe_update', (data) => {
        console.log('[TicTacToe] tic_tac_toe_update event received.');
        currentBoard = data.board;
        currentTurnSID = data.current_turn; 
        updateBoardDisplay();
        updateGameInfo(data.winner, data.player_mark, data.cell_index);

        if (data.winner || currentBoard.every(cell => cell !== '')) { 
            gameEnded = true;
            resetBtn.style.display = 'block';
            console.log(`[TicTacToe] Game ended. Winner: ${data.winner}`);
        } 
    });

    socket.on('tic_tac_toe_reset', (data) => {
        console.log('[TicTacToe] tic_tac_toe_reset event received.');
        currentBoard = data.initial_state.board;
        currentTurnSID = data.initial_state.current_turn;
        playersMapSIDToUsername = data.usernames; 
        // Reatribui minha marca no reset também
        myPlayerMark = data.initial_state.players_map[window.getMySocketId()]; 
        gameEnded = false;
        gameStarted = true; 
        updateBoardDisplay();
        updateGameInfo(); 
        resetBtn.style.display = 'none';
    });

    socket.on('game_error', (data) => {
        alert(`Erro no jogo: ${data.message}`);
        console.error(`[TicTacToe] Game Error: ${data.message}`);
        updateGameInfo(); // Reatualiza o status.
    });

    // 6. Funções de Atualização da UI
    function updateBoardDisplay() {
        cells.forEach((cell, index) => {
            cell.textContent = currentBoard[index];
            cell.classList.remove('x', 'o'); 
            if (currentBoard[index] !== '') {
                cell.classList.add(currentBoard[index].toLowerCase()); 
            }
        });
        console.log('[TicTacToe] Board display updated.');
    }

    function updateGameInfo(winner = null, playerMark = null, cellIndex = null) {
        let infoText = '';
        let shouldBeClickable = false; 
        const myCurrentSID = window.getMySocketId(); // Pega o SID mais atualizado aqui

        if (winner) {
            gameEnded = true; 
            if (winner === 'draw') {
                infoText = 'Fim de jogo: Empate!';
            } else if (winner === myCurrentSID) {
                infoText = `Vencedor: Você (${myPlayerMark})!`;
            } else {
                const opponentSID = Object.keys(playersMapSIDToUsername).find(sid => sid !== myCurrentSID);
                const opponentUsername = playersMapSIDToUsername[opponentSID] || 'Oponente';
                const opponentMark = myPlayerMark === 'X' ? 'O' : 'X'; 
                infoText = `Vencedor: ${opponentUsername} (${opponentMark})!`; 
            }
            shouldBeClickable = false; 
        } else if (gameStarted) { 
            if (currentTurnSID === myCurrentSID) { // Compara com o SID atual
                infoText = `Sua vez de jogar (${myPlayerMark})! Clique em uma célula.`;
                shouldBeClickable = true; 
            } else {
                const opponentSID = Object.keys(playersMapSIDToUsername).find(sid => sid !== myCurrentSID);
                const opponentUsername = playersMapSIDToUsername[opponentSID] || 'Oponente';
                const opponentMark = myPlayerMark === 'X' ? 'O' : 'X';
                infoText = `Vez do ${opponentUsername} (${opponentMark}). Aguarde.`;
                shouldBeClickable = false; 
            }
        } else { 
             infoText = 'Aguardando oponentes para começar o jogo...';
             shouldBeClickable = false; 
        }
        gameInfo.textContent = infoText;
        setBoardClickable(shouldBeClickable); // Aplica a habilitação/desabilitação
        console.log(`[TicTacToe] Game info updated. Text: "${infoText}", Board should be clickable: ${shouldBeClickable}`);
    }

    // 7. Função de reset específica (chamada pelo script.js principal)
    window.resetGameSpecific = () => {
        console.log('[TicTacToe] window.resetGameSpecific called.');
        currentBoard = ['', '', '', '', '', '', '', '', ''];
        myPlayerMark = '';
        currentTurnSID = '';
        gameEnded = false;
        gameStarted = false; 
        playersMapSIDToUsername = {};
        updateBoardDisplay();
        updateGameInfo(); 
        resetBtn.style.display = 'none';
    };

    // 8. Inicialização da UI ao carregar
    console.log('[TicTacToe] Script loaded. Initializing UI state.');
    updateBoardDisplay();
    updateGameInfo(); // Define o estado inicial da UI e do tabuleiro (desabilitado)
});