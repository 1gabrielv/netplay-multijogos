document.addEventListener('DOMContentLoaded', () => {
    // Verificações de dependência
    if (!window.socket || !window.getCurrentRoomId || !window.getMySocketId || !window.getCurrentPlayersUsernames) {
        console.error('Dependências do socket ou variáveis globais não carregadas para Forca. Recarregue a página.');
        return; 
    }

    const socket = window.socket;
    const gameInfo = document.getElementById('game-info');
    const myRoleDisplay = document.getElementById('my-role');
    const wordSetterArea = document.getElementById('word-setter-area');
    const secretWordInput = document.getElementById('secret-word-input');
    const setWordBtn = document.getElementById('set-word-btn');
    const gamePlayArea = document.getElementById('game-play-area');
    const wordDisplay = document.getElementById('word-display');
    const guessesDisplay = document.getElementById('guesses');
    const wrongGuessesCount = document.getElementById('wrong-guesses-count');
    const guessInput = document.getElementById('guess-input');
    const guessBtn = document.getElementById('guess-btn');
    const hangmanDrawingElement = document.getElementById('hangman-drawing');
    const resetGameBtn = document.getElementById('reset-game-btn');
    const gameFeedback = document.getElementById('game-feedback');

    // Remove a atribuição inicial de mySID aqui
    // let mySID = window.getMySocketId(); // REMOVA ESTA LINHA OU COMENTE-A
    
    let setterSID = null;
    let guesserSID = null;
    let playersMapSIDToUsername = {};

    let currentWordDisplay = '';
    let guessedLetters = [];
    let wrongGuesses = 0;
    let maxWrongGuesses = 6;
    let gameOver = false;
    let wordIsSet = false; 

    const hangmanParts = [
        `
    -----
    |   |
        |
        |
        |
        ---
            `,
        `
    -----
    |   |
    O   |
        |
        |
        ---
            `,
        `
    -----
    |   |
    O   |
    |   |
        |
        ---
            `,
        `
    -----
    |   |
    O   |
   /|   |
        |
        ---
            `,
        `
    -----
    |   |
    O   |
   /|\\  |
        |
        ---
            `,
        `
    -----
    |   |
    O   |
   /|\\  |
   /    |
        ---
            `,
        `
    -----
    |   |
    O   |
   /|\\  |
   / \\  |
        ---
            `
    ];

    setWordBtn.addEventListener('click', () => {
        const currentRoomId = window.getCurrentRoomId();
        const word = secretWordInput.value.trim().toUpperCase(); 
        const myCurrentSID = window.getMySocketId(); // Obtém mySID no momento do clique

        console.log('setWordBtn clicked. Word:', word, 'My current SID:', myCurrentSID);

        if (!currentRoomId) {
            alert('Por favor, entre em uma sala primeiro.');
            console.log('setWordBtn: No room ID.');
            return;
        }

        if (gameOver) {
            alert('O jogo já acabou. Reinicie para jogar novamente.');
            console.log('setWordBtn: Game Over.');
            return;
        }
        
        if (wordIsSet) {
            alert('A palavra secreta já foi definida para esta rodada.');
            console.log('setWordBtn: Word already set.');
            return;
        }

        if (myCurrentSID !== setterSID) { // Usa myCurrentSID
            alert('Você não é o definidor da palavra nesta rodada!');
            console.log('setWordBtn: Not setter. My SID:', myCurrentSID, 'Setter SID:', setterSID);
            return;
        }

        if (!word || !/^[A-Z]+$/.test(word) || word.length < 3) {
            alert('A palavra deve conter apenas letras (A-Z) e ter no mínimo 3 caracteres.');
            console.log('setWordBtn: Invalid word format.');
            return;
        }
        
        console.log('Emitting hangman_set_word:', { room_id: currentRoomId, word: word });
        socket.emit('hangman_set_word', { room_id: currentRoomId, word: word });
    });

    guessBtn.addEventListener('click', () => {
        const currentRoomId = window.getCurrentRoomId();
        const letter = guessInput.value.trim().toUpperCase(); 
        const myCurrentSID = window.getMySocketId(); // Obtém mySID no momento do clique

        console.log('guessBtn clicked. Letter:', letter, 'My current SID:', myCurrentSID);

        if (!currentRoomId) {
            alert('Por favor, entre em uma sala primeiro.');
            console.log('guessBtn: No room ID.');
            return;
        }

        if (gameOver) {
            alert('O jogo já acabou. Reinicie para jogar novamente.');
            console.log('guessBtn: Game Over.');
            return;
        }

        if (!wordIsSet) {
            alert('Aguardando a palavra secreta ser definida...');
            console.log('guessBtn: Word not set.');
            return;
        }

        if (myCurrentSID !== guesserSID) { // Usa myCurrentSID
            alert('Você não é o adivinhador nesta rodada!');
            console.log('guessBtn: Not guesser. My SID:', myCurrentSID, 'Guesser SID:', guesserSID);
            return;
        }

        if (!letter || !/^[A-Z]$/.test(letter)) {
            alert('Por favor, digite apenas uma letra válida para chutar!');
            guessInput.value = '';
            console.log('guessBtn: Invalid letter format.');
            return;
        }

        if (guessedLetters.includes(letter)) {
            alert(`Você já tentou a letra ${letter}!`);
            guessInput.value = '';
            console.log('guessBtn: Letter already guessed.');
            return;
        }
        
        console.log('Emitting hangman_guess_udp:', { room_id: currentRoomId, letter: letter });
        socket.emit('hangman_guess_udp', { room_id: currentRoomId, letter: letter });
        guessInput.value = ''; 
        gameFeedback.textContent = 'Chute enviado (via UDP)...';
    });

    guessInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            guessBtn.click();
        }
    });

    resetGameBtn.addEventListener('click', () => {
        const currentRoomId = window.getCurrentRoomId();
        if (currentRoomId) {
            console.log('Emitting reset_hangman for room:', currentRoomId);
            socket.emit('reset_hangman', { room_id: currentRoomId });
        }
    });

    socket.on('game_start', (data) => {
        setterSID = data.setter_sid;
        guesserSID = data.guesser_sid;
        playersMapSIDToUsername = data.usernames;
        wordIsSet = false; 
        gameOver = false;
        resetGameUI(); // Reinicializa a interface com os novos papéis
        console.log(`[game_start] Forca - Game Start Event Received.`);
        console.log(`[game_start] My SID (from window.getMySocketId()): ${window.getMySocketId()}`); // Novo log
        console.log(`[game_start] Setter SID: ${setterSID} (${playersMapSIDToUsername[setterSID] || 'N/A'})`);
        console.log(`[game_start] Guesser SID: ${guesserSID} (${playersMapSIDToUsername[guesserSID] || 'N/A'})`);
        console.log(`[game_start] Initial State: `, data.initial_state);
        updateDisplay(); 
    });

    socket.on('hangman_update_tcp', (data) => {
        currentWordDisplay = data.word_display;
        guessedLetters = data.guessed_letters;
        wrongGuesses = data.wrong_guesses;
        gameOver = data.game_over;
        wordIsSet = true; 
        updateDisplay();
        gameFeedback.textContent = ''; 
        console.log(`[hangman_update_tcp] Event Received: Palavra: ${currentWordDisplay}, Erros: ${wrongGuesses}`);
    });

    socket.on('hangman_update_udp', (data) => {
        currentWordDisplay = data.word_display;
        guessedLetters = data.guessed_letters;
        wrongGuesses = data.wrong_guesses;
        gameOver = data.game_over;

        if (data.last_guess_letter) {
            gameFeedback.textContent = `Chute de "${data.last_guess_letter}" foi ${data.last_guess_correct ? 'correto!' : 'errado!'}`;
        }
        updateDisplay();
        console.log(`[hangman_update_udp] Event Received: Palavra: ${currentWordDisplay}, Chute: ${data.last_guess_letter}, Correto: ${data.last_guess_correct}`);

        if (gameOver) {
            resetGameBtn.style.display = 'block';
        }
    });

    socket.on('hangman_reset', (data) => {
        setterSID = data.setter_sid;
        guesserSID = data.guesser_sid;
        playersMapSIDToUsername = data.usernames;
        wordIsSet = false; 
        gameOver = false;
        resetGameUI(); 
        console.log(`[hangman_reset] Event Received. New Setter: ${setterSID}, New Guesser: ${guesserSID}`);
        gameFeedback.textContent = 'Jogo reiniciado! Papéis trocados.';
    });

    socket.on('game_error', (data) => {
        alert(`Erro no jogo: ${data.message}`);
        console.error(`[game_error] ${data.message}`);
    });

    socket.on('game_info_message', (data) => {
        gameFeedback.textContent = data.message;
        console.log(`[game_info_message] ${data.message}`);
    });

    function resetGameUI() {
        console.log('[resetGameUI] Resetting UI...');
        gameOver = false;
        currentWordDisplay = '_ _ _ _ _';
        guessedLetters = [];
        wrongGuesses = 0;
        secretWordInput.value = '';
        gameFeedback.textContent = '';
        resetGameBtn.style.display = 'none';
        
        updateDisplay(); 
        console.log('[resetGameUI] UI Reset Complete. Calling updateDisplay.');
    }

    function updateDisplay() {
        const myCurrentSID = window.getMySocketId(); // Pega o SID mais atualizado AQUI
        console.log('[updateDisplay] Updating display. My current SID:', myCurrentSID, 'Setter SID:', setterSID, 'Guesser SID:', guesserSID);

        wordDisplay.textContent = currentWordDisplay;
        guessesDisplay.textContent = `Letras já tentadas: ${guessedLetters.join(', ')}`;
        wrongGuessesCount.textContent = wrongGuesses;
        hangmanDrawingElement.textContent = hangmanParts[wrongGuesses];

        if (myCurrentSID === setterSID) { // Usa myCurrentSID
            myRoleDisplay.textContent = `Seu papel: Definir a palavra. (${playersMapSIDToUsername[myCurrentSID] || 'Você'})`;
            wordSetterArea.style.display = 'block';
            gamePlayArea.style.display = 'none';

            setWordBtn.disabled = wordIsSet || gameOver; 
            secretWordInput.disabled = wordIsSet || gameOver;

            if (!wordIsSet && !gameOver) {
                gameInfo.textContent = 'Defina a palavra secreta para o jogo da Forca.';
            } else if (wordIsSet && !gameOver) {
                gameInfo.textContent = 'Aguardando o adivinhador chutar...';
            } else if (gameOver) {
                // Não temos data.game_winner aqui, então é mais genérico
                gameInfo.textContent = `Fim de Jogo! Como Definidor, você ${guessedLetters.length > 0 && currentWordDisplay.includes('_') ? 'venceu' : 'perdeu'}!`;
            }


        } else if (myCurrentSID === guesserSID) { // Usa myCurrentSID
            myRoleDisplay.textContent = `Seu papel: Adivinhador. (${playersMapSIDToUsername[myCurrentSID] || 'Você'})`;
            wordSetterArea.style.display = 'none';
            gamePlayArea.style.display = 'block';

            guessInput.disabled = !wordIsSet || gameOver;
            guessBtn.disabled = !wordIsSet || gameOver;

            if (wordIsSet && !gameOver) {
                gameInfo.textContent = 'Sua vez de chutar uma letra!';
            } else if (!wordIsSet && !gameOver) {
                gameInfo.textContent = 'Aguardando o outro jogador definir a palavra...';
            } else if (gameOver) {
                // Não temos data.game_winner aqui, então é mais genérico
                gameInfo.textContent = `Fim de Jogo! Como Adivinhador, você ${!currentWordDisplay.includes('_') && wrongGuesses < maxWrongGuesses ? 'venceu' : 'perdeu'}!`;
            }

        } else { 
            myRoleDisplay.textContent = 'Aguardando definição de papel...'; 
            wordSetterArea.style.display = 'none';
            gamePlayArea.style.display = 'none';
            guessInput.disabled = true;
            guessBtn.disabled = true;
            setWordBtn.disabled = true;
            secretWordInput.disabled = true;
            gameInfo.textContent = 'Aguardando oponentes para começar o jogo...';
        }
        console.log(`[updateDisplay] Current gameInfo: ${gameInfo.textContent}`);
        console.log(`[updateDisplay] wordSetterArea display: ${wordSetterArea.style.display}`);
        console.log(`[updateDisplay] gamePlayArea display: ${gamePlayArea.style.display}`);
        console.log(`[updateDisplay] setWordBtn disabled: ${setWordBtn.disabled}`);
        console.log(`[updateDisplay] guessBtn disabled: ${guessBtn.disabled}`);
    }

    window.resetGameSpecific = () => {
        console.log('[window.resetGameSpecific] Called for Hangman.');
        setterSID = null;
        guesserSID = null;
        playersMapSIDToUsername = {};
        wordIsSet = false;
        gameOver = false;
        resetGameUI(); 
    };

    console.log('[DOMContentLoaded] Hangman script loaded. Initializing UI.');
    resetGameUI(); 
});