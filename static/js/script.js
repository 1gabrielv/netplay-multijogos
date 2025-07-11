document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); // Conecta ao SocketIO

    const usernameInput = document.getElementById('username-input');
    const roomIdInput = document.getElementById('room-id-input');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const connectionStatus = document.getElementById('connection-status');
    const playersInRoomDisplay = document.getElementById('players-in-room'); // Renomeado para evitar conflito
    const mySidDisplay = document.getElementById('my-sid'); // Renomeado
    const gameArea = document.getElementById('game-area');
    const chatArea = document.getElementById('chat-area');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('send-chat-btn');

    let currentRoomId = null;
    let mySocketId = null; // Armazena o SID do cliente atual
    let currentPlayersUsernames = []; // Armazena os nomes de usuário dos jogadores na sala

    // Obter o gameId da URL (ex: /game/tic-tac-toe -> tic-tac-toe)
    const pathSegments = window.location.pathname.split('/');
    const gameId = pathSegments[pathSegments.length - 1]; // Pega o último segmento

    joinRoomBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        const roomId = roomIdInput.value.trim();

        if (username) {
            socket.emit('create_or_join_room', { gameId: gameId, username: username, roomId: roomId });
        } else {
            alert('Por favor, insira seu nome de usuário.');
        }
    });

    sendChatBtn.addEventListener('click', () => {
        const message = chatInput.value.trim();
        if (message && currentRoomId) {
            socket.emit('chat_message', { room_id: currentRoomId, message: message });
            chatInput.value = ''; // Limpa o input
        }
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatBtn.click();
        }
    });

    socket.on('connect', () => {
        connectionStatus.textContent = 'Status: Conectado ao servidor.';
        mySocketId = socket.id;
        mySidDisplay.textContent = `Seu ID de Conexão (SID): ${mySocketId}`;
    });

    socket.on('error', (data) => {
        connectionStatus.textContent = `Erro: ${data.message}`;
        alert(data.message);
    });

    socket.on('room_joined', (data) => {
        currentRoomId = data.room_id;
        currentPlayersUsernames = data.current_players;
        connectionStatus.textContent = `Status: Conectado à sala ${currentRoomId} como ${data.username}.`;
        playersInRoomDisplay.textContent = `Jogadores na sala: ${data.players_in_room} (${data.current_players.join(', ')})`;
        document.getElementById('connection-setup').style.display = 'none';
        chatArea.style.display = 'block';

        // Inicializa o chat com uma mensagem de sistema
        const messageElement = document.createElement('p');
        messageElement.className = 'chat-message system-message';
        messageElement.innerHTML = `<em>Você entrou na sala.</em>`;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    socket.on('player_joined', (data) => {
        currentPlayersUsernames = data.current_players; // Atualiza a lista de nomes de usuários
        playersInRoomDisplay.textContent = `Jogadores na sala: ${data.players_in_room} (${currentPlayersUsernames.join(', ')})`;
        
        const messageElement = document.createElement('p');
        messageElement.className = 'chat-message system-message';
        messageElement.innerHTML = `<em>${data.username} entrou na sala.</em>`;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    socket.on('player_disconnected', (data) => {
        // Remove o jogador da lista e atualiza o display
        currentPlayersUsernames = currentPlayersUsernames.filter(username => username !== data.username);
        playersInRoomDisplay.textContent = `Jogadores na sala: ${data.players_in_room} (${currentPlayersUsernames.join(', ')})`;
        
        const messageElement = document.createElement('p');
        messageElement.className = 'chat-message system-message';
        messageElement.innerHTML = `<em>${data.username} (${data.sid.substring(0, 5)}...) saiu da sala.</em>`;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    socket.on('new_chat_message', (data) => {
        const messageElement = document.createElement('p');
        messageElement.className = 'chat-message';
        messageElement.innerHTML = `<strong>${data.username}:</strong> ${data.message}`;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Rola para o final
    });

    socket.on('game_start', (data) => {
        gameArea.style.display = 'block'; // Mostra a área do jogo
        connectionStatus.textContent += ' O jogo começou!';
        alert('O jogo vai começar!');
        // Os scripts de jogo (game1.js, etc.) já estarão escutando 'game_start'
        // e farão suas inicializações específicas.
    });

    socket.on('game_ended_player_left', (data) => {
        alert(data.message);
        // Opcional: Redirecionar ou recarregar a página para um novo início
        // window.location.reload(); 
        // Ou apenas desabilitar a área do jogo e mostrar a tela de conexão novamente
        gameArea.style.display = 'none';
        chatArea.style.display = 'none';
        document.getElementById('connection-setup').style.display = 'block';
        connectionStatus.textContent = 'O jogo foi encerrado.';
        playersInRoomDisplay.textContent = 'Jogadores na sala: 0';
        mySidDisplay.textContent = `Seu ID de Conexão (SID): ${mySocketId}`;
        currentRoomId = null;
    });


    // Torna socket e currentRoomId e mySocketId acessíveis aos scripts de jogo
    window.socket = socket;
    window.getCurrentRoomId = () => currentRoomId;
    window.getMySocketId = () => mySocketId;
    window.getCurrentPlayersUsernames = () => currentPlayersUsernames; // Adicionado
});