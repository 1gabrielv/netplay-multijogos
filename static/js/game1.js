document.addEventListener('DOMContentLoaded', () => {
    if (window.socket && window.getCurrentRoomId && window.getMySocketId && window.getCurrentPlayersUsernames) {
        const socket = window.socket;
        const gameInfo = document.getElementById('game-info');
        const boardElement = document.getElementById('tic-tac-toe-board');
        const cells = document.querySelectorAll('.cell');
        const resetBtn = document.getElementById('reset-game-btn');

        let currentBoard = ['', '', '', '', '', '', '', '', ''];
        let myPlayerMark = ''; // 'X' or 'O'
        let currentTurnSID = '';
        let mySID = window.getMySocketId();
        let playersMapSIDToUsername = {}; // Para mapear SID para username

        cells.forEach(cell => {
            cell.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                const currentRoomId = window.getCurrentRoomId();

                if (currentRoomId && currentTurnSID === mySID && currentBoard[index] === '' && !gameInfo.textContent.includes('Vencedor') && !gameInfo.textContent.includes('Empate')) {
                    socket.emit('tic_tac_toe_move', { room_id: currentRoomId, cell_index: index });
                    gameInfo.textContent = 'Sua jogada enviada. Aguardando oponente...';
                } else if (currentTurnSID !== mySID && !gameInfo.textContent.includes('Vencedor') && !gameInfo.textContent.includes('Empate')) {
                    gameInfo.textContent = 'Não é a sua vez!';
                } else if (currentBoard[index] !== '' && !gameInfo.textContent.includes('Vencedor') && !gameInfo.textContent.includes('Empate')) {
                    gameInfo.textContent = 'Essa célula já está ocupada!';
                }
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
            playersMapSIDToUsername = data.usernames; // Captura os usernames

            if (data.player_roles) {
                myPlayerMark = data.player_roles[mySID];
            }

            updateBoardDisplay();
            updateGameInfo();
            document.getElementById('reset-game-btn').style.display = 'none'; // Esconde no início
        });

        socket.on('tic_tac_toe_update', (data) => {
            currentBoard = data.board;
            currentTurnSID = data.current_turn; // Pode ser undefined se houver vencedor/empate
            updateBoardDisplay();
            updateGameInfo(data.winner, data.player_mark, data.cell_index);

            if (data.winner || data.board.every(cell => cell !== '')) { // Se o jogo terminou, mostra o botão de reset
                resetBtn.style.display = 'block';
            }
        });

        socket.on('tic_tac_toe_reset', (data) => {
            currentBoard = data.initial_state.board;
            currentTurnSID = data.initial_state.current_turn;
            playersMapSIDToUsername = data.usernames; // Atualiza em caso de reconexão ou troca
            myPlayerMark = data.initial_state.players_map[mySID]; // Reatribui minha marca
            updateBoardDisplay();
            updateGameInfo();
            resetBtn.style.display = 'none';
        });

        socket.on('game_error', (data) => {
            alert(`Erro no jogo: ${data.message}`);
            updateGameInfo(); // Tenta atualizar para o estado correto
        });

        function updateBoardDisplay() {
            cells.forEach((cell, index) => {
                cell.textContent = currentBoard[index];
                cell.className = 'cell ' + currentBoard[index].toLowerCase(); // Adiciona classe 'x' ou 'o'
            });
        }

        function updateGameInfo(winner = null, playerMark = null, cellIndex = null) {
            let infoText = '';
            if (winner) {
                if (winner === 'draw') {
                    infoText = 'Fim de jogo: Empate!';
                } else if (winner === mySID) {
                    infoText = `Vencedor: Você (${myPlayerMark})!`;
                } else {
                    const opponentUsername = playersMapSIDToUsername[winner] || 'Oponente';
                    infoText = `Vencedor: ${opponentUsername} (${playerMark === 'X' ? 'O' : 'X'})!`; // Assume a marca do oponente
                }
            } else if (currentTurnSID === mySID) {
                infoText = `Sua vez de jogar (${myPlayerMark})!`;
            } else if (currentTurnSID) { // Só mostra se a vez foi definida
                const opponentSID = Object.keys(playersMapSIDToUsername).find(sid => sid !== mySID);
                const opponentUsername = playersMapSIDToUsername[opponentSID] || 'Oponente';
                const opponentMark = myPlayerMark === 'X' ? 'O' : 'X';
                infoText = `Vez do ${opponentUsername} (${opponentMark}).`;
            } else {
                 infoText = 'Aguardando oponentes...';
            }
            gameInfo.textContent = infoText;
        }

        // Inicializa a exibição ao carregar (antes do game_start)
        updateBoardDisplay();
    } else {
        console.error('Dependências do socket não carregadas para Jogo da Velha.');
    }
});