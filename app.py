import os
from flask import Flask, render_template, request, redirect, url_for, session
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)
socketio = SocketIO(app)

# Dicionário para armazenar o estado dos jogos e salas
# Exemplo: { 'game_room_id': {'players': [], 'game_state': {}, 'game_type': 'tic-tac-toe', 'usernames': {SID: username}} }
game_rooms = {}

# Dicionário para mapear SID para username e room_id (para facilitar o disconnect)
sid_to_user_info = {}


# --- Funções de Inicialização dos Jogos ---
def initialize_tic_tac_toe_game():
    return {
        'board': ['', '', '', '', '', '', '', '', ''],
        'current_turn': None,  # SID do jogador atual
        'players_map': {},  # Mapeia SID para 'X' ou 'O'
        'winner': None,
        'moves_count': 0
    }

def initialize_rps_game():
    return {
        'player1_choice': None,
        'player2_choice': None,
        'player1_sid': None,
        'player2_sid': None,
        'round_winner': None,
        'scores': {},  # SID: score
        'round_ready': 0  # Conta quantos jogadores já escolheram
    }

def initialize_hangman_game():
    return {
        'secret_word': '',
        'guessed_letters': [],
        'wrong_guesses': 0,
        'max_wrong_guesses': 6,
        'word_display': '',
        'game_over': False,
        'game_winner': None,
        'setter_sid': None,  # SID do jogador que define a palavra
        'guesser_sid': None  # SID do jogador que adivinha
    }


# --- Rotas do Site ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/game/<game_id>')
def game_page(game_id):
    # Mapeia game_id para o template HTML e o "tipo" de conexão para descrição
    template_map = {
        'tic-tac-toe': {'template': 'game1.html', 'type': 'TCP'},
        'rock-paper-scissors': {'template': 'game2.html', 'type': 'UDP'},
        'hangman': {'template': 'game3.html', 'type': 'Híbrido'}
    }
    
    game_info = template_map.get(game_id)
    if game_info:
        return render_template(game_info['template'], game_type=game_info['type'], game_id=game_id)
    else:
        return redirect(url_for('index')) # Redireciona para a página inicial se o game_id for inválido


# --- Eventos de Conexão/Desconexão do SocketIO ---
@socketio.on('connect')
def handle_connect():
    print(f'Cliente conectado: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    player_sid = request.sid
    if player_sid in sid_to_user_info:
        user_info = sid_to_user_info[player_sid]
        room_id = user_info['room_id']
        username = user_info['username']

        if room_id in game_rooms:
            room_data = game_rooms[room_id]
            if player_sid in room_data['players']:
                room_data['players'].remove(player_sid)
                del room_data['usernames'][player_sid]
                
                # Notifica os outros jogadores que alguém saiu
                emit('player_disconnected', {
                    'sid': player_sid,
                    'username': username,
                    'players_in_room': len(room_data['players'])
                }, room=room_id)
                print(f'Jogador {username} ({player_sid}) desconectou da sala {room_id}. Jogadores restantes: {len(room_data["players"])}')

                # Se a sala ficar vazia, remove-a
                if not room_data['players']:
                    del game_rooms[room_id]
                    print(f'Sala {room_id} removida por estar vazia.')
                elif len(room_data['players']) == 1:
                    # Se apenas um jogador sobrar, o jogo não pode continuar
                    emit('game_ended_player_left', {'message': 'O outro jogador desconectou. O jogo foi encerrado.'}, room=room_id)
                    print(f'Jogo na sala {room_id} encerrado porque um jogador saiu.')
                    del game_rooms[room_id] # Força o reset da sala
        
        del sid_to_user_info[player_sid]
    print(f'Cliente desconectado: {player_sid}')


@socketio.on('create_or_join_room')
def handle_create_or_join_room(data):
    game_id = data.get('gameId')
    username = data.get('username')
    room_id = data.get('roomId') or game_id # Usa o gameId como roomId se não for fornecido um específico
    player_sid = request.sid

    if not username:
        emit('error', {'message': 'Por favor, insira um nome de usuário.'}, room=player_sid)
        return

    if room_id not in game_rooms:
        # Cria uma nova sala
        game_rooms[room_id] = {
            'players': [],
            'game_state': {},  # Será inicializado pelo game_start
            'game_type': game_id,
            'usernames': {}  # Mapeia SID para username
        }
        print(f'Sala {room_id} criada para o jogo {game_id}')

    room_data = game_rooms[room_id]

    # Verifica se o jogador já está na sala ou se a sala está cheia
    if player_sid in room_data['players']:
        emit('error', {'message': 'Você já está nesta sala.'}, room=player_sid)
        return
    if len(room_data['players']) >= 2:
        emit('error', {'message': 'Esta sala já está cheia. Tente outra sala ou crie uma nova.'}, room=player_sid)
        return

    join_room(room_id)
    room_data['players'].append(player_sid)
    room_data['usernames'][player_sid] = username
    sid_to_user_info[player_sid] = {'username': username, 'room_id': room_id} # Armazena para disconnect

    emit('room_joined', {
        'room_id': room_id,
        'players_in_room': len(room_data['players']),
        'player_sid': player_sid,
        'username': username,
        'current_players': list(room_data['usernames'].values()) # Lista dos nomes de usuários na sala
    }, room=player_sid)

    # Notifica os outros jogadores na sala que um novo jogador entrou
    emit('player_joined', {
        'player_sid': player_sid,
        'username': username,
        'players_in_room': len(room_data['players']),
        'current_players': list(room_data['usernames'].values())
    }, room=room_id, include_self=False)

    print(f'Jogador {username} ({player_sid}) entrou na sala {room_id} para o jogo {game_id}. Jogadores na sala: {len(room_data["players"])}')

    if len(room_data['players']) == 2:
        # Inicializa o estado do jogo apenas quando os 2 jogadores entram
        if game_id == 'tic-tac-toe':
            room_data['game_state'] = initialize_tic_tac_toe_game()
            room_data['game_state']['current_turn'] = room_data['players'][0] # O primeiro a entrar começa
            room_data['game_state']['players_map'][room_data['players'][0]] = 'X'
            room_data['game_state']['players_map'][room_data['players'][1]] = 'O'
        elif game_id == 'rock-paper-scissors':
            room_data['game_state'] = initialize_rps_game()
            room_data['game_state']['player1_sid'] = room_data['players'][0]
            room_data['game_state']['player2_sid'] = room_data['players'][1]
            room_data['game_state']['scores'][room_data['players'][0]] = 0
            room_data['game_state']['scores'][room_data['players'][1]] = 0
        elif game_id == 'hangman':
            room_data['game_state'] = initialize_hangman_game()
            # Alterna quem define a palavra a cada rodada se for resetado, ou define inicial
            # Para o início, o primeiro a entrar define
            room_data['game_state']['setter_sid'] = room_data['players'][0]
            room_data['game_state']['guesser_sid'] = room_data['players'][1]

        emit('game_start', {
            'room_id': room_id,
            'initial_state': room_data['game_state'],
            'players_sids': room_data['players'], # Envia SIDs para mapeamento local
            'player_roles': room_data['game_state'].get('players_map'), # Para Tic Tac Toe
            'setter_sid': room_data['game_state'].get('setter_sid'), # Para Forca
            'guesser_sid': room_data['game_state'].get('guesser_sid'), # Para Forca
            'usernames': room_data['usernames'] # Envia usernames também
        }, room=room_id)
        print(f'Jogo na sala {room_id} iniciado com estado inicial: {room_data["game_state"]}')


# --- Chat Geral ---
@socketio.on('chat_message')
def handle_chat_message(data):
    room_id = data.get('room_id')
    message = data.get('message')
    player_sid = request.sid

    if room_id in game_rooms and player_sid in game_rooms[room_id]['players']:
        username = game_rooms[room_id]['usernames'].get(player_sid, 'Desconhecido')
        emit('new_chat_message', {'username': username, 'message': message}, room=room_id)
        print(f'Chat na sala {room_id} de {username}: {message}')


# --- Jogo da Velha (TCP) ---
@socketio.on('tic_tac_toe_move')
def handle_tic_tac_toe_move(data):
    room_id = data.get('room_id')
    cell_index = data.get('cell_index')
    player_sid = request.sid

    if room_id in game_rooms and game_rooms[room_id]['game_type'] == 'tic-tac-toe':
        game_state = game_rooms[room_id]['game_state']

        if game_state['winner'] or game_state['moves_count'] == 9: # Jogo já acabou
            emit('game_error', {'message': 'O jogo já acabou!'}, room=player_sid)
            return

        if player_sid != game_state['current_turn']: # Não é a vez do jogador
            emit('game_error', {'message': 'Não é a sua vez de jogar!'}, room=player_sid)
            return

        if game_state['board'][cell_index] != '': # Célula já ocupada
            emit('game_error', {'message': 'Essa célula já está ocupada!'}, room=player_sid)
            return

        player_mark = game_state['players_map'][player_sid]
        game_state['board'][cell_index] = player_mark
        game_state['moves_count'] += 1

        # Verificar vencedor
        winner = check_tic_tac_toe_winner(game_state['board'], player_mark)
        if winner:
            game_state['winner'] = player_sid
            emit('tic_tac_toe_update', {'board': game_state['board'], 'winner': player_sid, 'player_mark': player_mark, 'cell_index': cell_index, 'current_turn': None}, room=room_id)
            print(f'Vencedor do Jogo da Velha na sala {room_id}: {game_rooms[room_id]["usernames"].get(player_sid, player_sid)}')
            return
        elif game_state['moves_count'] == 9: # Empate
            game_state['winner'] = 'draw'
            emit('tic_tac_toe_update', {'board': game_state['board'], 'winner': 'draw', 'player_mark': player_mark, 'cell_index': cell_index, 'current_turn': None}, room=room_id)
            print(f'Jogo da Velha na sala {room_id}: Empate')
            return

        # Trocar a vez
        other_player_sid = [p for p in game_rooms[room_id]['players'] if p != player_sid][0]
        game_state['current_turn'] = other_player_sid

        emit('tic_tac_toe_update', {
            'board': game_state['board'],
            'current_turn': game_state['current_turn'],
            'player_mark': player_mark,
            'cell_index': cell_index
        }, room=room_id)

    else:
        emit('game_error', {'message': 'Estado do jogo inválido.'}, room=player_sid)

def check_tic_tac_toe_winner(board, player_mark):
    winning_combinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], # Linhas
        [0, 3, 6], [1, 4, 7], [2, 5, 8], # Colunas
        [0, 4, 8], [2, 4, 6]             # Diagonais
    ]
    for combo in winning_combinations:
        if board[combo[0]] == board[combo[1]] == board[combo[2]] == player_mark:
            return True
    return False

@socketio.on('reset_tic_tac_toe')
def handle_reset_tic_tac_toe(data):
    room_id = data.get('room_id')
    if room_id in game_rooms and game_rooms[room_id]['game_type'] == 'tic-tac-toe':
        # Troca quem começa a cada reset
        players = game_rooms[room_id]['players']
        current_first_player = game_rooms[room_id]['game_state'].get('current_turn', players[0])
        new_first_player = players[1] if current_first_player == players[0] else players[0]

        game_rooms[room_id]['game_state'] = initialize_tic_tac_toe_game()
        game_rooms[room_id]['game_state']['current_turn'] = new_first_player
        game_rooms[room_id]['game_state']['players_map'][players[0]] = 'X' if new_first_player == players[0] else 'O'
        game_rooms[room_id]['game_state']['players_map'][players[1]] = 'X' if new_first_player == players[1] else 'O'

        emit('tic_tac_toe_reset', {'initial_state': game_rooms[room_id]['game_state'], 'usernames': game_rooms[room_id]['usernames']}, room=room_id)
        print(f'Jogo da Velha na sala {room_id} reiniciado.')


# --- Pedra, Papel e Tesoura (UDP) ---
@socketio.on('rps_choice')
def handle_rps_choice(data):
    room_id = data.get('room_id')
    choice = data.get('choice')
    player_sid = request.sid

    if room_id in game_rooms and game_rooms[room_id]['game_type'] == 'rock-paper-scissors':
        game_state = game_rooms[room_id]['game_state']

        if player_sid == game_state['player1_sid']:
            if game_state['player1_choice'] is None:
                game_state['player1_choice'] = choice
                game_state['round_ready'] += 1
                emit('rps_player_ready', {'player_sid': player_sid, 'choice_made': True}, room=room_id)
                print(f'Player 1 ({game_rooms[room_id]["usernames"].get(player_sid, player_sid)}) escolheu em sala {room_id}.')
        elif player_sid == game_state['player2_sid']:
            if game_state['player2_choice'] is None:
                game_state['player2_choice'] = choice
                game_state['round_ready'] += 1
                emit('rps_player_ready', {'player_sid': player_sid, 'choice_made': True}, room=room_id)
                print(f'Player 2 ({game_rooms[room_id]["usernames"].get(player_sid, player_sid)}) escolheu em sala {room_id}.')
        else:
            emit('game_error', {'message': 'Você não é um jogador válido nesta sala.'}, room=player_sid)
            return

        # Se ambos os jogadores escolheram
        if game_state['round_ready'] == 2:
            p1_choice = game_state['player1_choice']
            p2_choice = game_state['player2_choice']

            winner_sid = None
            if p1_choice == p2_choice:
                winner_sid = 'draw' # Empate
            elif (p1_choice == 'pedra' and p2_choice == 'tesoura') or \
                 (p1_choice == 'papel' and p2_choice == 'pedra') or \
                 (p1_choice == 'tesoura' and p2_choice == 'papel'):
                winner_sid = game_state['player1_sid']
                game_state['scores'][game_state['player1_sid']] += 1
            else:
                winner_sid = game_state['player2_sid']
                game_state['scores'][game_state['player2_sid']] += 1

            game_state['round_winner'] = winner_sid
            emit('rps_round_result', {
                'player1_choice': p1_choice,
                'player2_choice': p2_choice,
                'winner_sid': winner_sid,
                'scores': game_state['scores'],
                'player1_sid': game_state['player1_sid'],
                'player2_sid': game_state['player2_sid'],
                'usernames': game_rooms[room_id]['usernames'] # Envia usernames
            }, room=room_id)

            # Resetar para a próxima rodada
            game_state['player1_choice'] = None
            game_state['player2_choice'] = None
            game_state['round_ready'] = 0
            game_state['round_winner'] = None # Limpa para próxima rodada

            print(f'Rodada PPT na sala {room_id} concluída. Vencedor: {game_rooms[room_id]["usernames"].get(winner_sid, winner_sid if winner_sid != "draw" else "Empate")}. Placar: {game_state["scores"]}')

    else:
        emit('game_error', {'message': 'Estado do jogo PPT inválido.'}, room=player_sid)

@socketio.on('reset_rps')
def handle_reset_rps(data):
    room_id = data.get('room_id')
    if room_id in game_rooms and game_rooms[room_id]['game_type'] == 'rock-paper-scissors':
        game_rooms[room_id]['game_state'] = initialize_rps_game()
        # Garante que os players_sids estejam corretos
        game_rooms[room_id]['game_state']['player1_sid'] = game_rooms[room_id]['players'][0]
        game_rooms[room_id]['game_state']['player2_sid'] = game_rooms[room_id]['players'][1]
        game_rooms[room_id]['game_state']['scores'][game_rooms[room_id]['players'][0]] = 0
        game_rooms[room_id]['game_state']['scores'][game_rooms[room_id]['players'][1]] = 0

        emit('rps_reset', {'initial_state': game_rooms[room_id]['game_state'], 'usernames': game_rooms[room_id]['usernames']}, room=room_id)
        print(f'Jogo PPT na sala {room_id} reiniciado.')


# --- Forca (Híbrido) ---
@socketio.on('hangman_set_word')
def handle_hangman_set_word(data):
    room_id = data.get('room_id')
    secret_word = data.get('word').strip().upper()
    player_sid = request.sid

    if room_id in game_rooms and game_rooms[room_id]['game_type'] == 'hangman':
        game_state = game_rooms[room_id]['game_state']

        if player_sid != game_state['setter_sid']:
            emit('game_error', {'message': 'Apenas o definidor da palavra pode fazer isso!'}, room=player_sid)
            return
        if game_state['secret_word']: # Palavra já definida
            emit('game_error', {'message': 'A palavra secreta já foi definida.'}, room=player_sid)
            return

        if not secret_word.isalpha() or len(secret_word) < 3:
            emit('game_error', {'message': 'A palavra deve conter apenas letras e ter no mínimo 3 caracteres.'}, room=player_sid)
            return

        game_state['secret_word'] = secret_word
        game_state['word_display'] = '_ ' * len(secret_word)
        game_state['guessed_letters'] = []
        game_state['wrong_guesses'] = 0
        game_state['game_over'] = False
        game_state['game_winner'] = None

        # Envia a atualização via TCP para garantir que a palavra (mascarada) e o estado inicial cheguem corretamente
        emit('hangman_update_tcp', {
            'word_display': game_state['word_display'],
            'guessed_letters': game_state['guessed_letters'],
            'wrong_guesses': game_state['wrong_guesses'],
            'game_over': game_state['game_over'],
            'game_winner': game_state['game_winner'],
            'setter_sid': game_state['setter_sid'],
            'guesser_sid': game_state['guesser_sid']
        }, room=room_id)
        print(f'Palavra secreta definida para Forca na sala {room_id}.')
        emit('game_info_message', {'message': 'A palavra secreta foi definida! Agora é a vez do adivinhador.'}, room=room_id)


@socketio.on('hangman_guess_udp')
def handle_hangman_guess_udp(data):
    room_id = data.get('room_id')
    guess = data.get('letter').strip().upper()
    player_sid = request.sid

    if room_id in game_rooms and game_rooms[room_id]['game_type'] == 'hangman':
        game_state = game_rooms[room_id]['game_state']

        if player_sid != game_state['guesser_sid']:
            emit('game_error', {'message': 'Apenas o adivinhador pode chutar letras!'}, room=player_sid)
            return
        if not game_state['secret_word']:
            emit('game_error', {'message': 'Aguardando a palavra secreta ser definida!'}, room=player_sid)
            return
        if game_state['game_over']:
            emit('game_error', {'message': 'O jogo já acabou!'}, room=player_sid)
            return
        if not guess.isalpha() or len(guess) != 1:
            emit('game_error', {'message': 'Por favor, chute apenas uma letra!'}, room=player_sid)
            return
        if guess in game_state['guessed_letters']:
            emit('game_error', {'message': f'Você já tentou a letra {guess}!'}, room=player_sid)
            return

        game_state['guessed_letters'].append(guess)
        new_word_display = ''
        found_letter = False

        for char in game_state['secret_word']:
            if char in game_state['guessed_letters']:
                new_word_display += char + ' '
                if char == guess:
                    found_letter = True
            else:
                new_word_display += '_ '

        game_state['word_display'] = new_word_display.strip()

        if not found_letter:
            game_state['wrong_guesses'] += 1

        # Verificar fim de jogo
        if '_' not in game_state['word_display']:
            game_state['game_over'] = True
            game_state['game_winner'] = game_state['guesser_sid']
            emit('game_info_message', {'message': f'Parabéns! O adivinhador venceu! A palavra era "{game_state["secret_word"]}"'}, room=room_id)
        elif game_state['wrong_guesses'] >= game_state['max_wrong_guesses']:
            game_state['game_over'] = True
            game_state['game_winner'] = game_state['setter_sid']
            emit('game_info_message', {'message': f'Fim de jogo! A forca foi completa. A palavra era "{game_state["secret_word"]}"'}, room=room_id)

        # Envia a atualização do chute via UDP (prioriza velocidade, pequenas perdas não quebram o jogo)
        emit('hangman_update_udp', {
            'word_display': game_state['word_display'],
            'guessed_letters': game_state['guessed_letters'],
            'wrong_guesses': game_state['wrong_guesses'],
            'game_over': game_state['game_over'],
            'game_winner': game_state['game_winner'],
            'last_guess_letter': guess,
            'last_guess_correct': found_letter,
            'secret_word': game_state['secret_word'] # Inclui a palavra para o final do jogo
        }, room=room_id)

        print(f'Chute de Forca UDP na sala {room_id}: {guess}. Estado: {game_state["word_display"]}')
    else:
        emit('game_error', {'message': 'Estado do jogo Forca inválido.'}, room=player_sid)

@socketio.on('reset_hangman')
def handle_reset_hangman(data):
    room_id = data.get('room_id')
    if room_id in game_rooms and game_rooms[room_id]['game_type'] == 'hangman':
        # Troca os papéis ao reiniciar
        players = game_rooms[room_id]['players']
        # Verifica se os SIDs ainda são válidos
        if len(players) < 2: # Caso um jogador tenha saído e a sala ainda não foi limpa
            emit('game_error', {'message': 'Não há jogadores suficientes para reiniciar o jogo.'}, room=request.sid)
            return

        current_setter = game_rooms[room_id]['game_state'].get('setter_sid')
        current_guesser = game_rooms[room_id]['game_state'].get('guesser_sid')

        # Garante que os SIDs sejam dos jogadores presentes
        if current_setter == players[0]:
            new_setter = players[1]
            new_guesser = players[0]
        else: # Se o setter atual é o player[1] ou não foi definido corretamente
            new_setter = players[0]
            new_guesser = players[1]
        
        game_rooms[room_id]['game_state'] = initialize_hangman_game()
        game_rooms[room_id]['game_state']['setter_sid'] = new_setter
        game_rooms[room_id]['game_state']['guesser_sid'] = new_guesser

        emit('hangman_reset', {
            'initial_state': game_rooms[room_id]['game_state'],
            'setter_sid': game_rooms[room_id]['game_state']['setter_sid'],
            'guesser_sid': game_rooms[room_id]['game_state']['guesser_sid'],
            'usernames': game_rooms[room_id]['usernames']
        }, room=room_id)
        print(f'Jogo da Forca na sala {room_id} reiniciado. Papéis trocados.')


# --- Função para rodar o servidor ---
if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)