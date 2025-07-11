document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); // Conecta ao SocketIO

    const usernameInput = document.getElementById('username-input');
    const roomIdInput = document.getElementById('room-id-input');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const connectionStatus = document.getElementById('connection-status');
    const playersInRoomDisplay = document.getElementById('players-in-room');
    const mySidDisplay = document.getElementById('my-sid');
    const gameArea = document.getElementById('game-area');
    const chatArea = document.getElementById('chat-area');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('send-chat-btn');

    let currentRoomId = null;
    let currentPlayersUsernames = []; 
    let playersSidsInOrder = []; 

    // Obter o gameId da URL
    const pathSegments = window.location.pathname.split('/');
    const gameId = pathSegments[pathSegments.length - 1]; 

    // Torna socket e currentRoomId acessíveis aos scripts de jogo
    window.socket = socket;
    window.getCurrentRoomId = () => currentRoomId;
    // Esta função agora SEMPRE retornará o socket.id atual.
    // Assim, 'mySID' nos scripts de jogo pode ser lido a qualquer momento.
    window.getMySocketId = () => socket.id; 
    window.getCurrentPlayersUsernames = () => currentPlayersUsernames;
    window.getPlayersSidsInOrder = () => playersSidsInOrder;

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
            chatInput.value = ''; 
        }
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatBtn.click();
        }
    });

    socket.on('connect', () => {
        // Agora, mySidDisplay é atualizado diretamente aqui
        mySidDisplay.textContent = `Seu ID de Conexão (SID): ${socket.id}`;
        connectionStatus.textContent = 'Status: Conectado ao servidor.';
        console.log(`[script.js] Connected to server. My SID: ${socket.id}`);

        // Importante: Se o script do jogo já foi carregado e chamou getMySocketId() antes
        // da conexão ser estabelecida, ele teria recebido 'null'.
        // Agora que o socket.id está disponível, podemos forçar um 'reset' ou 'update'
        // no script do jogo para que ele reavalie mySID e a interface.
        if (typeof window.resetGameSpecific === 'function') {
            window.resetGameSpecific(); 
        }
    });

    socket.on('error', (data) => {
        connectionStatus.textContent = `Erro: ${data.message}`;
        alert(data.message);
        console.error(`[script.js] Server error: ${data.message}`);
    });

    socket.on('room_joined', (data) => {
        currentRoomId = data.room_id;
        currentPlayersUsernames = data.current_players;
        playersSidsInOrder = data.players_sids || []; 
        connectionStatus.textContent = `Status: Conectado à sala ${currentRoomId} como ${data.username}.`;
        playersInRoomDisplay.textContent = `Jogadores na sala: ${data.players_in_room} (${data.current_players.join(', ')})`;
        document.getElementById('connection-setup').style.display = 'none';
        chatArea.style.display = 'block';

        const messageElement = document.createElement('p');
        messageElement.className = 'chat-message system-message';
        messageElement.innerHTML = `<em>Você entrou na sala.</em>`;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (data.players_in_room === 2) {
             gameArea.style.display = 'block';
             // No game_start o script de jogo será notificado
        } else {
             gameArea.style.display = 'none'; 
             const waitingMessageElement = document.createElement('p');
             waitingMessageElement.className = 'chat-message system-message';
             waitingMessageElement.innerHTML = '<em>Aguardando outro jogador para iniciar o jogo...</em>';
             chatMessages.appendChild(waitingMessageElement);
             chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        console.log(`[script.js] Room joined: ${currentRoomId}, Players: ${data.players_in_room}`);
    });

    socket.on('player_joined', (data) => {
        currentPlayersUsernames = data.current_players; 
        playersSidsInOrder = data.players_sids || []; 
        playersInRoomDisplay.textContent = `Jogadores na sala: ${data.players_in_room} (${currentPlayersUsernames.join(', ')})`;
        
        const messageElement = document.createElement('p');
        messageElement.className = 'chat-message system-message';
        messageElement.innerHTML = `<em>${data.username} entrou na sala.</em>`;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        console.log(`[script.js] Player joined: ${data.username}, Total players: ${data.players_in_room}`);
    });

    socket.on('player_disconnected', (data) => {
        currentPlayersUsernames = data.current_players; 
        playersInRoomDisplay.textContent = `Jogadores na sala: ${data.players_in_room} (${currentPlayersUsernames.join(', ')})`;
        
        const messageElement = document.createElement('p');
        messageElement.className = 'chat-message system-message';
        messageElement.innerHTML = `<em>${data.username} (${data.sid.substring(0, 5)}...) saiu da sala.</em>`;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        console.log(`[script.js] Player disconnected: ${data.username}`);
    });

    socket.on('new_chat_message', (data) => {
        const messageElement = document.createElement('p');
        messageElement.className = 'chat-message';
        messageElement.innerHTML = `<strong>${data.username}:</strong> ${data.message}`;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    socket.on('game_start', (data) => {
        gameArea.style.display = 'block'; 
        connectionStatus.textContent = `Status: Conectado à sala ${currentRoomId} como ${usernameInput.value}. O jogo começou!`;
        alert('O jogo vai começar!');
        console.log(`[script.js] Game started in room ${currentRoomId}.`);
    });

    socket.on('game_ended_player_left', (data) => {
        alert(data.message);
        currentRoomId = null;
        gameArea.style.display = 'none';
        chatArea.style.display = 'none';
        document.getElementById('connection-setup').style.display = 'block';
        usernameInput.value = ''; 
        roomIdInput.value = ''; 
        connectionStatus.textContent = 'O jogo foi encerrado. Digite seu nome de usuário e entre em uma nova sala.';
        playersInRoomDisplay.textContent = 'Jogadores na sala: 0';
        mySidDisplay.textContent = 'Seu ID de Conexão (SID): Desconectado'; // Atualiza para mostrar que o SID pode mudar
        chatMessages.innerHTML = ''; 
        currentPlayersUsernames = [];
        playersSidsInOrder = [];
        console.log(`[script.js] Game ended due to player left in room ${data.room_id}.`);
        
        if (typeof window.resetGameSpecific === 'function') {
            window.resetGameSpecific(); 
        }
    });

    console.log('[script.js] Script loaded. Waiting for socket connection.');
});