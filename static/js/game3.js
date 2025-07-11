document.addEventListener('DOMContentLoaded', () => {
    if (window.socket && window.getCurrentRoomId && window.getMySocketId && window.getCurrentPlayersUsernames) {
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

        let mySID = window.getMySocketId();
        let setterSID = null;
        let guesserSID = null;
        let playersMapSIDToUsername = {};

        let currentWordDisplay = '';
        let guessedLetters = [];
        let wrongGuesses = 0;
        let maxWrongGuesses = 6;
        let gameOver = false;

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
            const word = secretWordInput.value;
            if (currentRoomId && word) {
                socket.emit('hangman_set_word', { room_id: currentRoomId, word: word });
                secretWordInput.value = '';
                gameInfo.textContent = 'Palavra enviada. Aguardando oponente chutar...';
                setWordBtn.disabled = true; // Desabilita o botão após definir a palavra
                secretWordInput.disabled = true;
            } else {
                alert('Digite a palavra secreta!');
            }
        });

        guessBtn.addEventListener('click', () => {
            const currentRoomId = window.getCurrentRoomId();
            const letter = guessInput.value;
            if (currentRoomId && letter) {
                socket.emit('hangman_guess_udp', { room_id: currentRoomId, letter: letter });
                guessInput.value = ''; // Limpa o campo para o próximo chute
                gameFeedback.textContent = 'Chute enviado (via UDP)...';
            } else {
                alert('Digite uma letra para chutar!');
            }
        });

        guessInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                guessBtn.click();
            }
        });

        resetGameBtn.addEventListener('click', () => {
            const currentRoomId = window.getCurrentRoomId();
            if (currentRoomId) {
                socket.emit('reset_hangman', { room_id: currentRoomId });
            }
        });

        socket.on('game_start', (data) => {
            setterSID = data.setter_sid;
            guesserSID = data.guesser_sid;
            playersMapSIDToUsername = data.usernames;
            resetGame(); // Inicializa o jogo
        });

        // Evento TCP para a palavra inicial (confiabilidade)
        socket.on('hangman_update_tcp', (data) => {
            currentWordDisplay = data.word_display;
            guessedLetters = data.guessed_letters;
            wrongGuesses = data.wrong_guesses;
            gameOver = data.game_over;
            setterSID = data.setter_sid; // Atualiza roles
            guesserSID = data.guesser_sid;
            updateDisplay();
            gameFeedback.textContent = ''; // Limpa feedback após receber atualização garantida
        });

        // Evento UDP para os chutes (velocidade)
        socket.on('hangman_update_udp', (data) => {
            currentWordDisplay = data.word_display;
            guessedLetters = data.guessed_letters;
            wrongGuesses = data.wrong_guesses;
            gameOver = data.game_over;

            if (data.last_guess_letter) {
                gameFeedback.textContent = `Chute de "${data.last_guess_letter}" foi ${data.last_guess_correct ? 'correto!' : 'errado!'}`;
            }

            updateDisplay();

            if (gameOver) {
                if (data.game_winner === mySID) {
                    gameInfo.textContent = `Fim de Jogo: Você venceu! A palavra era "${data.secret_word}"`;
                } else if (data.game_winner !== null) {
                    const winnerUsername = playersMapSIDToUsername[data.game_winner] || 'Oponente';
                    gameInfo.textContent = `Fim de Jogo: ${winnerUsername} venceu! A palavra era "${data.secret_word}"`;
                }
                resetGameBtn.style.display = 'block';
                guessInput.disabled = true;
                guessBtn.disabled = true;
                setWordBtn.disabled = true; // Garante que não possa mais definir palavra
                secretWordInput.disabled = true;
            }
        });

        socket.on('hangman_reset', (data) => {
            setterSID = data.setter_sid;
            guesserSID = data.guesser_sid;
            playersMapSIDToUsername = data.usernames;
            resetGame();
        });

        socket.on('game_error', (data) => {
            alert(`Erro no jogo: ${data.message}`);
        });

        socket.on('game_info_message', (data) => {
            gameFeedback.textContent = data.message;
        });

        function resetGame() {
            gameOver = false;
            currentWordDisplay = '_ _ _ _ _';
            guessedLetters = [];
            wrongGuesses = 0;
            updateDisplay();
            gameFeedback.textContent = '';
            resetGameBtn.style.display = 'none';
            guessInput.disabled = false;
            guessBtn.disabled = false;
            secretWordInput.value = '';
            setWordBtn.disabled = false; // Habilita o botão de definir palavra
            secretWordInput.disabled = false;

            if (mySID === setterSID) {
                myRoleDisplay.textContent = `Seu papel: Definir a palavra. (Sua vez de jogar: ${playersMapSIDToUsername[mySID]})`;
                wordSetterArea.style.display = 'block';
                gamePlayArea.style.display = 'none';
                gameInfo.textContent = 'Defina a palavra secreta para o jogo da Forca.';
            } else if (mySID === guesserSID) {
                myRoleDisplay.textContent = `Seu papel: Adivinhador. (Sua vez de jogar: ${playersMapSIDToUsername[mySID]})`;
                wordSetterArea.style.display = 'none';
                gamePlayArea.style.display = 'block';
                gameInfo.textContent = 'Aguardando o outro jogador definir a palavra...';
            } else {
                // Caso ainda não tenha 2 jogadores ou SIDs desatualizados
                myRoleDisplay.textContent = 'Aguardando definição de papel...';
                wordSetterArea.style.display = 'none';
                gamePlayArea.style.display = 'none';
                gameInfo.textContent = 'Aguardando oponentes para começar...';
            }
        }

        function updateDisplay() {
            wordDisplay.textContent = currentWordDisplay;
            guessesDisplay.textContent = `Letras já tentadas: ${guessedLetters.join(', ')}`;
            wrongGuessesCount.textContent = wrongGuesses;
            hangmanDrawingElement.textContent = hangmanParts[wrongGuesses];

            if (!gameOver) {
                if (mySID === guesserSID && currentWordDisplay.includes('_')) {
                     gameInfo.textContent = 'Sua vez de chutar uma letra!';
                     guessInput.disabled = false;
                     guessBtn.disabled = false;
                } else if (mySID === setterSID && currentWordDisplay.includes('_')) {
                    gameInfo.textContent = 'Aguardando o adivinhador chutar...';
                    guessInput.disabled = true;
                    guessBtn.disabled = true;
                } else if (currentWordDisplay.replace(/ /g, '').length === 0) { // Se a palavra ainda não foi definida
                    if (mySID === setterSID) {
                        gameInfo.textContent = 'Defina a palavra secreta para o jogo da Forca.';
                        setWordBtn.disabled = false;
                        secretWordInput.disabled = false;
                    } else {
                        gameInfo.textContent = 'Aguardando o outro jogador definir a palavra...';
                    }
                    guessInput.disabled = true;
                    guessBtn.disabled = true;
                }
            } else { // Jogo acabou
                guessInput.disabled = true;
                guessBtn.disabled = true;
                setWordBtn.disabled = true;
                secretWordInput.disabled = true;
            }
        }

        // Inicializa a exibição ao carregar
        resetGame();
    } else {
        console.error('Dependências do socket não carregadas para Forca.');
    }
});