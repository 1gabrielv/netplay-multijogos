import os
from flask import Flask, render_template, request, redirect, url_for, session
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24) 
socketio = SocketIO(app)

game_rooms = {}
sid_to_user_info = {}

# --- Funções de Inicialização dos Jogos ---
def initialize_tic_tac_toe_game():
    return {
        'board': ['', '', '', '', '', '', '', '', ''],
        'current_turn': None,
        'players_map': {},
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
        'round_ready': 0
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
        'setter_sid': None,
        'guesser_sid': None
    }


# --- Rotas do Site ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/game/<game_id>')
def game_page(game_id):
    template_map = {
        'tic-tac-toe': {'template': 'game1.html', 'type': 'TCP'},
        'rock-paper-scissors': {'template': 'game2.html', 'type': 'UDP'},
        'hangman': {'template': 'game3.html', 'type': 'Híbrido'}
    }
    
    game_info = template_map.get(game_id)
    if game_info:
        return render_template(game_info['template'], game_type=game_info['type'], game_id=game_id)
    else:
        return redirect(url_for('index'))


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
                
                if player_sid in room_data['usernames']:
                    del room_data['usernames'][player_sid]

                emit('player_disconnected', {
                    'sid': player_sid,
                    'username': username,
                    'players_in_room': len(room_data['players']),
                    'current_players': list(room_data['usernames'].values())
                }, room=room_id)
                print(f'Jogador {username} ({player_sid}) desconectou da sala {room_id}. Jogadores restantes: {len(room_data["players"])}')

                if not room_data['players']:
                    del game_rooms[room_id]
                    print(f'Sala {room_id} removida por estar vazia.')
                elif len(room_data['players']) == 1:
                    emit('game_ended_player_left', {
                        'message': 'O outro jogador desconectou. O jogo foi encerrado. Por favor, crie ou entre em uma nova sala.',
                        'room_id': room_id
                    }, room=room_data['players'][0])
                    del game_rooms[room_id]
                    print(f'Jogo na sala {room_id} encerrado porque um jogador saiu. Sala removida.')
        
        del sid_to_user_info[player_sid]
    print(f'Cliente desconectado: {player_sid}')


@socketio.on('create_or_join_room')
def handle_create_or_join_room(data):
    game_id = data.get('gameId')
    username = data.get('username')
    room_id = data.get('roomId') or game_id
    player_sid = request.sid

    if not username:
        emit('error', {'message': 'Por favor, insira um nome de usuário.'}, room=player_sid)
        return

    if player_sid in sid_to_user_info and sid_to_user_info[player_sid]['room_id'] == room_id:
        emit('error', {'message': 'Você já está nesta sala.'}, room=player_sid)
        return

    if room_id not in game_rooms:
        game_rooms[room_id] = {
            'players': [],
            'game_state': {},
            'game_type': game_id,
            'usernames': {}
        }
        print(f'Sala {room_id} criada para o jogo {game_id}')

    room_data = game_rooms[room_id]

    if len(room_data['players']) >= 2 and player_sid not in room_data['players']:
        emit('error', {'message': 'Esta sala já está cheia. Tente outra sala ou crie uma nova.'}, room=player_sid)
        return
    
    if player_sid not in room_data['players']:
        join_room(room_id)
        room_data['players'].append(player_sid)
        room_data['usernames'][player_sid] = username
        sid_to_user_info[player_sid] = {'username': username, 'room_id': room_id}

    emit('room_joined', {
        'room_id': room_id,
        'players_in_room': len(room_data['players']),
        'player_sid': player_sid,
        'username': username,
        'current_players': list(room_data['usernames'].values())
    }, room=player_sid)

    if len(room_data['players']) > 1 and player_sid in room_data['players'] and player_sid == room_data['players'][-1]:
         emit('player_joined', {
            'player_sid': player_sid,
            'username': username,
            'players_in_room': len(room_data['players']),
            'current_players': list(room_data['usernames'].values())
        }, room=room_id, include_self=False)


    print(f'Jogador {username} ({player_sid}) entrou na sala {room_id} para o jogo {game_id}. Jogadores na sala: {len(room_data["players"])}')

    if len(room_data['players']) == 2:
        players_sids_in_order = room_data['players']

        if game_id == 'tic-tac-toe':
            room_data['game_state'] = initialize_tic_tac_toe_game()
            room_data['game_state']['current_turn'] = players_sids_in_order[0]
            room_data['game_state']['players_map'][players_sids_in_order[0]] = 'X'
            room_data['game_state']['players_map'][players_sids_in_order[1]] = 'O'
        elif game_id == 'rock-paper-scissors':
            room_data['game_state'] = initialize_rps_game()
            room_data['game_state']['player1_sid'] = players_sids_in_order[0]
            room_data['game_state']['player2_sid'] = players_sids_in_order[1]
            room_data['game_state']['scores'][players_sids_in_order[0]] = 0 # Inicializa score para o player 1
            room_data['game_state']['scores'][players_sids_in_order[1]] = 0 # Inicializa score para o player 2
        elif game_id == 'hangman':
            room_data['game_state'] = initialize_hangman_game()
            room_data['game_state']['setter_sid'] = players_sids_in_order[0]
            room_data['game_state']['guesser_sid'] = players_sids_in_order[1]
            print(f"Forca: Definidor: {room_data['usernames'].get(players_sids_in_order[0])}, Adivinhador: {room_data['usernames'].get(players_sids_in_order[1])}")

        emit('game_start', {
            'room_id': room_id,
            'initial_state': room_data['game_state'],
            'players_sids': players_sids_in_order,
            'player_roles': room_data['game_state'].get('players_map'),
            'setter_sid': room_data['game_state'].get('setter_sid'),
            'guesser_sid': room_data['game_state'].get('guesser_sid'),
            'usernames': room_data['usernames']
        }, room=room_id)
        print(f'Jogo na sala {room_id} iniciado com estado inicial: {room_data["game_state"]}')
    elif len(room_data['players']) < 2:
        emit('game_info_message', {'message': 'Aguardando outro jogador para começar o jogo...'}, room=player_sid)


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

    if room_id not in game_rooms or game_rooms[room_id]['game_type'] != 'tic-tac-toe':
        emit('game_error', {'message': 'Estado do jogo inválido.'}, room=player_sid)
        return

    game_state = game_rooms[room_id]['game_state']
    
    if not game_state or not game_state.get('board'):
        emit('game_error', {'message': 'Jogo não inicializado corretamente. Aguarde o outro jogador.'}, room=player_sid)
        return

    if game_state['winner'] or game_state['moves_count'] == 9:
        emit('game_error', {'message': 'O jogo já acabou!'}, room=player_sid)
        return

    if player_sid != game_state['current_turn']:
        emit('game_error', {'message': 'Não é a sua vez de jogar!'}, room=player_sid)
        return

    if game_state['board'][cell_index] != '':
        emit('game_error', {'message': 'Essa célula já está ocupada!'}, room=player_sid)
        return

    player_mark = game_state['players_map'][player_sid]
    game_state['board'][cell_index] = player_mark
    game_state['moves_count'] += 1

    winner = check_tic_tac_toe_winner(game_state['board'], player_mark)
    if winner:
        game_state['winner'] = player_sid
        emit('tic_tac_toe_update', {'board': game_state['board'], 'winner': player_sid, 'player_mark': player_mark, 'cell_index': cell_index, 'current_turn': None}, room=room_id)
        print(f'Vencedor do Jogo da Velha na sala {room_id}: {game_rooms[room_id]["usernames"].get(player_sid, player_sid)}')
        return
    elif game_state['moves_count'] == 9:
        game_state['winner'] = 'draw'
        emit('tic_tac_toe_update', {'board': game_state['board'], 'winner': 'draw', 'player_mark': player_mark, 'cell_index': cell_index, 'current_turn': None}, room=room_id)
        print(f'Jogo da Velha na sala {room_id}: Empate')
        return

    other_player_sid = [p for p in game_rooms[room_id]['players'] if p != player_sid][0]
    game_state['current_turn'] = other_player_sid

    emit('tic_tac_toe_update', {
        'board': game_state['board'],
        'current_turn': game_state['current_turn'],
        'player_mark': player_mark,
        'cell_index': cell_index
    }, room=room_id)

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
        players = game_rooms[room_id]['players']
        if len(players) < 2:
            emit('game_error', {'message': 'Não há jogadores suficientes para reiniciar o jogo.'}, room=request.sid)
            return

        current_first_player_sid = game_rooms[room_id]['game_state'].get('current_turn')
        if not current_first_player_sid:
            current_first_player_sid = players[0]
        
        new_starting_player_sid = players[1] if current_first_player_sid == players[0] else players[0]

        game_rooms[room_id]['game_state'] = initialize_tic_tac_toe_game()
        game_rooms[room_id]['game_state']['current_turn'] = new_starting_player_sid
        
        game_rooms[room_id]['game_state']['players_map'][new_starting_player_sid] = 'X'
        game_rooms[room_id]['game_state']['players_map'][players[0] if players[0] != new_starting_player_sid else players[1]] = 'O'


        emit('tic_tac_toe_reset', {'initial_state': game_rooms[room_id]['game_state'], 'usernames': game_rooms[room_id]['usernames']}, room=room_id)
        print(f'Jogo da Velha na sala {room_id} reiniciado. Próximo a começar: {game_rooms[room_id]["usernames"].get(new_starting_player_sid, new_starting_player_sid)}')


# --- Pedra, Papel e Tesoura (UDP) ---
@socketio.on('rps_choice')
def handle_rps_choice(data):
    room_id = data.get('room_id')
    choice = data.get('choice')
    player_sid = request.sid

    if room_id not in game_rooms or game_rooms[room_id]['game_type'] != 'rock-paper-scissors':
        emit('game_error', {'message': 'Estado do jogo PPT inválido.'}, room=player_sid)
        return

    game_state = game_rooms[room_id]['game_state']

    if not game_state or not game_state.get('scores'):
        emit('game_error', {'message': 'Jogo não inicializado corretamente. Aguarde o outro jogador.'}, room=player_sid)
        return

    # Certifica que os scores para os jogadores existem
    for p_sid in [game_state['player1_sid'], game_state['player2_sid']]:
        if p_sid not in game_state['scores']:
            game_state['scores'][p_sid] = 0

    if player_sid == game_state['player1_sid']:
        if game_state['player1_choice'] is None:
            game_state['player1_choice'] = choice
            game_state['round_ready'] += 1
            emit('rps_player_ready', {'player_sid': player_sid, 'choice_made': True}, room=room_id)
            print(f'Player 1 ({game_rooms[room_id]["usernames"].get(player_sid, player_sid)}) escolheu em sala {room_id}.')
        else:
            emit('game_error', {'message': 'Você já fez sua escolha para esta rodada!'}, room=player_sid)
            return
    elif player_sid == game_state['player2_sid']:
        if game_state['player2_choice'] is None:
            game_state['player2_choice'] = choice
            game_state['round_ready'] += 1
            emit('rps_player_ready', {'player_sid': player_sid, 'choice_made': True}, room=room_id)
            print(f'Player 2 ({game_rooms[room_id]["usernames"].get(player_sid, player_sid)}) escolheu em sala {room_id}.')
        else:
            emit('game_error', {'message': 'Você já fez sua escolha para esta rodada!'}, room=player_sid)
            return
    else:
        emit('game_error', {'message': 'Você não é um jogador válido nesta sala.'}, room=player_sid)
        return

    if game_state['round_ready'] == 2:
        p1_choice = game_state['player1_choice']
        p2_choice = game_state['player2_choice']

        winner_sid = None
        if p1_choice == p2_choice:
            winner_sid = 'draw'
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
            'scores': game_state['scores'], # Enviando o dicionário de scores atualizado
            'player1_sid': game_state['player1_sid'],
            'player2_sid': game_state['player2_sid'],
            'usernames': game_rooms[room_id]['usernames']
        }, room=room_id)

        game_state['player1_choice'] = None
        game_state['player2_choice'] = None
        game_state['round_ready'] = 0
        game_state['round_winner'] = None

        print(f'Rodada PPT na sala {room_id} concluída. Vencedor: {game_rooms[room_id]["usernames"].get(winner_sid, winner_sid if winner_sid != "draw" else "Empate")}. Placar: {game_state["scores"]}')

@socketio.on('reset_rps')
def handle_reset_rps(data):
    room_id = data.get('room_id')
    if room_id in game_rooms and game_rooms[room_id]['game_type'] == 'rock-paper-scissors':
        players = game_rooms[room_id]['players']
        if len(players) < 2:
            emit('game_error', {'message': 'Não há jogadores suficientes para reiniciar o jogo.'}, room=request.sid)
            return

        game_rooms[room_id]['game_state'] = initialize_rps_game()
        game_rooms[room_id]['game_state']['player1_sid'] = players[0]
        game_rooms[room_id]['game_state']['player2_sid'] = players[1]
        game_rooms[room_id]['game_state']['scores'][players[0]] = 0
        game_rooms[room_id]['game_state']['scores'][players[1]] = 0

        emit('rps_reset', {'initial_state': game_rooms[room_id]['game_state'], 'usernames': game_rooms[room_id]['usernames']}, room=room_id)
        print(f'Jogo PPT na sala {room_id} reiniciado.')


# --- Forca (Híbrido) ---
@socketio.on('hangman_set_word')
def handle_hangman_set_word(data):
    room_id = data.get('room_id')
    secret_word = data.get('word').strip().upper()
    player_sid = request.sid

    if room_id not in game_rooms or game_rooms[room_id]['game_type'] != 'hangman':
        emit('game_error', {'message': 'Estado do jogo Forca inválido.'}, room=player_sid)
        return

    game_state = game_rooms[room_id]['game_state']

    if len(game_rooms[room_id]['players']) < 2:
        emit('game_error', {'message': 'Não há jogadores suficientes para iniciar/prosseguir o jogo.'}, room=player_sid)
        return

    if not game_state or game_state.get('setter_sid') is None:
        emit('game_error', {'message': 'Jogo não inicializado corretamente. Aguarde o outro jogador.'}, room=player_sid)
        return

    if player_sid != game_state['setter_sid']:
        emit('game_error', {'message': 'Apenas o definidor da palavra pode fazer isso!'}, room=player_sid)
        return
    if game_state['secret_word']:
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

    if room_id not in game_rooms or game_rooms[room_id]['game_type'] != 'hangman':
        emit('game_error', {'message': 'Estado do jogo Forca inválido.'}, room=player_sid)
        return

    game_state = game_rooms[room_id]['game_state']

    if len(game_rooms[room_id]['players']) < 2:
        emit('game_error', {'message': 'Não há jogadores suficientes para iniciar/prosseguir o jogo.'}, room=player_sid)
        return

    if not game_state or game_state.get('guesser_sid') is None:
        emit('game_error', {'message': 'Jogo não inicializado corretamente. Aguarde o outro jogador.'}, room=player_sid)
        return

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

    if '_' not in game_state['word_display']:
        game_state['game_over'] = True
        game_state['game_winner'] = game_state['guesser_sid']
        emit('game_info_message', {'message': f'Parabéns! O adivinhador venceu! A palavra era "{game_state["secret_word"]}"'}, room=room_id)
    elif game_state['wrong_guesses'] >= game_state['max_wrong_guesses']:
        game_state['game_over'] = True
        game_state['game_winner'] = game_state['setter_sid']
        emit('game_info_message', {'message': f'Fim de jogo! A forca foi completa. A palavra era "{game_state["secret_word"]}"'}, room=room_id)

    emit('hangman_update_udp', {
        'word_display': game_state['word_display'],
        'guessed_letters': game_state['guessed_letters'],
        'wrong_guesses': game_state['wrong_guesses'],
        'game_over': game_state['game_over'],
        'game_winner': game_state['game_winner'],
        'last_guess_letter': guess,
        'last_guess_correct': found_letter,
        'secret_word': game_state['secret_word']
    }, room=room_id)

    print(f'Chute de Forca UDP na sala {room_id}: {guess}. Estado: {game_state["word_display"]}')

@socketio.on('reset_hangman')
def handle_reset_hangman(data):
    room_id = data.get('room_id')
    if room_id in game_rooms and game_rooms[room_id]['game_type'] == 'hangman':
        players = game_rooms[room_id]['players']
        if len(players) < 2:
            emit('game_error', {'message': 'Não há jogadores suficientes para reiniciar o jogo.'}, room=request.sid)
            return

        current_setter = game_rooms[room_id]['game_state'].get('setter_sid')
        
        if current_setter == players[0]: 
            new_setter_sid = players[1]
            new_guesser_sid = players[0]
        else: 
            new_setter_sid = players[0]
            new_guesser_sid = players[1]
        
        game_rooms[room_id]['game_state'] = initialize_hangman_game()
        game_rooms[room_id]['game_state']['setter_sid'] = new_setter_sid
        game_rooms[room_id]['game_state']['guesser_sid'] = new_guesser_sid

        emit('hangman_reset', {
            'initial_state': game_rooms[room_id]['game_state'],
            'setter_sid': game_rooms[room_id]['game_state']['setter_sid'],
            'guesser_sid': game_rooms[room_id]['game_state']['guesser_sid'],
            'usernames': game_rooms[room_id]['usernames']
        }, room=room_id)
        print(f'Jogo da Forca na sala {room_id} reiniciado. Papéis trocados. Novo definidor: {game_rooms[room_id]["usernames"].get(new_setter_sid, new_setter_sid)}')


# --- Função para rodar o servidor ---
if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)