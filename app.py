from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for, flash
from flask_login import LoginManager, UserMixin, current_user, login_required, login_user, logout_user
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, PyMongoError
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
from copy import deepcopy
import os
from pathlib import Path
import time
import webbrowser
import re
import uuid
from threading import Timer
from urllib.parse import urlparse

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'chave-secreta-dev')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.getenv('SESSION_COOKIE_SECURE', '').lower() == 'true'
login_manager = LoginManager(app)
login_manager.login_view = 'login'
UPLOAD_FOLDER = 'uploads'
CADERNOS_FOLDER = os.environ.get(
    'CADERNOS_FOLDER',
    str(Path(app.root_path).resolve().parents[1] / 'Arquivos Pessoais' / 'static' / 'cadernos')
)
_mongo_client = None
_mongo_collection = None
_mongo_users_collection = None

DADOS_PADRAO = {
    "xp": 0,
    "tempo_total": 0,
    "dias_seguidos": 0,
    "categorias": ["Principal"],
    "edital": [],
    "forum": [],
    "agenda": [],
    "ciclo": [],
    "financas": {"cartoes": [], "pessoas": [], "despesas": [], "cartoes_config": []},
    "diario": []
}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def _get_collection():
    global _mongo_client, _mongo_collection

    if _mongo_collection is None:
        mongo_uri = os.environ.get('MONGO_URI')
        if not mongo_uri:
            raise RuntimeError("A variável de ambiente MONGO_URI não está configurada.")
        _mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        banco = _mongo_client[os.environ.get('MONGO_DB_NAME', 'sistema_auxiliar')]
        _mongo_collection = banco['dados']
    return _mongo_collection


def _get_users_collection():
    global _mongo_client, _mongo_users_collection

    if _mongo_users_collection is None:
        if _mongo_client is None:
            _get_collection()
        banco = _mongo_client[os.environ.get('MONGO_DB_NAME', 'sistema_auxiliar')]
        _mongo_users_collection = banco['usuarios']
        try:
            _mongo_users_collection.create_index('username', unique=True)
            _mongo_users_collection.create_index('email', unique=True)
        except (AttributeError, PyMongoError):
            # Indexes may already exist, or a test double may not implement them.
            pass
    return _mongo_users_collection


class Usuario(UserMixin):
    def __init__(self, documento):
        self.id = str(documento['_id'])
        self.username = documento.get('username', '')
        self.email = documento.get('email', '')


@login_manager.user_loader
def carregar_usuario(user_id):
    documento = _get_users_collection().find_one({'_id': str(user_id)})
    return Usuario(documento) if documento else None


@login_manager.unauthorized_handler
def usuario_nao_autorizado():
    if request.path.startswith('/api/'):
        return jsonify({'status': 'erro', 'mensagem': 'Autenticação necessária'}), 401
    return redirect(url_for('login', next=request.full_path if request.query_string else request.path))


def _id_dados_usuario(user_id):
    return f'dados_principais:{user_id}'


def _garantir_dados_usuario(user_id):
    colecao = _get_collection()
    id_usuario = _id_dados_usuario(user_id)
    if colecao.find_one({'_id': id_usuario, 'user_id': str(user_id)}):
        return

    usuarios = _get_users_collection()
    primeiro_usuario = usuarios.find_one({'_id': str(user_id)})
    primeiro = True
    if hasattr(usuarios, 'count_documents'):
        primeiro = usuarios.count_documents({}) == 1
    if primeiro and primeiro_usuario:
        legado = colecao.find_one({'_id': 'dados_principais'})
        if legado and not legado.get('user_id'):
            copia = deepcopy(legado)
            copia['_id'] = id_usuario
            copia['user_id'] = str(user_id)
            colecao.replace_one({'_id': id_usuario}, copia, upsert=True)
            return

    documento = deepcopy(DADOS_PADRAO)
    documento['_id'] = id_usuario
    documento['user_id'] = str(user_id)
    colecao.replace_one({'_id': id_usuario}, documento, upsert=True)


def carregar_dados():
    _garantir_dados_usuario(current_user.id)
    documento = _get_collection().find_one({'_id': _id_dados_usuario(current_user.id)})
    if documento is None:
        return deepcopy(DADOS_PADRAO)
    if not isinstance(documento, dict):
        raise ValueError("O documento principal de dados deve ser um objeto.")

    documento.pop('_id', None)
    documento.pop('user_id', None)
    for chave, valor in DADOS_PADRAO.items():
        if chave not in documento:
            documento[chave] = deepcopy(valor)
    return documento

def salvar_dados(dados):
    if not isinstance(dados, dict):
        raise ValueError("Os dados enviados devem ser um objeto JSON.")
    documento = deepcopy(dados)
    documento.pop('_id', None)
    documento.pop('user_id', None)
    documento['_id'] = _id_dados_usuario(current_user.id)
    documento['user_id'] = str(current_user.id)
    _get_collection().replace_one(
        {'_id': documento['_id'], 'user_id': str(current_user.id)}, documento, upsert=True
    )


def _validar_cadastro(username, email, senha, confirmacao):
    if not re.fullmatch(r'[A-Za-z0-9_.-]{3,30}', username or ''):
        return 'O usuário deve ter entre 3 e 30 caracteres válidos.'
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email or ''):
        return 'Informe um e-mail válido.'
    if len(senha or '') < 8:
        return 'A senha deve ter pelo menos 8 caracteres.'
    if senha != confirmacao:
        return 'As senhas não conferem.'
    return None


@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        senha = request.form.get('password', '')
        documento = _get_users_collection().find_one({'username': username})
        from werkzeug.security import check_password_hash
        if documento and check_password_hash(documento.get('password_hash', ''), senha):
            login_user(Usuario(documento))
            proximo = request.form.get('next') or request.args.get('next')
            if proximo and proximo.startswith('/'):
                destino = urlparse(proximo)
                if not destino.netloc and not destino.scheme:
                    return redirect(proximo)
            return redirect(url_for('index'))
        flash('Usuário ou senha inválidos.', 'erro')
    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip().lower()
        senha = request.form.get('password', '')
        confirmacao = request.form.get('password_confirm', '')
        erro = _validar_cadastro(username, email, senha, confirmacao)
        usuarios = _get_users_collection()
        if not erro and (usuarios.find_one({'username': username}) or usuarios.find_one({'email': email})):
            erro = 'Usuário ou e-mail já cadastrado.'
        if erro:
            flash(erro, 'erro')
        else:
            from werkzeug.security import generate_password_hash
            documento = {
                '_id': uuid.uuid4().hex,
                'username': username,
                'email': email,
                'password_hash': generate_password_hash(senha),
                'created_at': time.time(),
            }
            try:
                usuarios.insert_one(documento)
                usuario = Usuario(documento)
                login_user(usuario)
                _garantir_dados_usuario(usuario.id)
                return redirect(url_for('index'))
            except DuplicateKeyError:
                flash('Usuário ou e-mail já cadastrado.', 'erro')
    return render_template('register.html')


@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/nucleo')
@login_required
def nucleo():
    return render_template('nucleo.html')

@app.route('/rotina')
@login_required
def rotina():
    return render_template('rotina.html')

@app.route('/cadernos')
@login_required
def cadernos():
    return render_template('cadernos.html')

@app.route('/estatistica')
@login_required
def estatistica():
    return render_template('estatistica.html')

@app.route('/forum')
@login_required
def forum():
    return render_template('forum.html')

@app.route('/sala/<id_assunto>')
@login_required
def sala_estudos(id_assunto):
    return render_template('sala_estudos.html', id_assunto=id_assunto)

@app.route('/agenda')
@login_required
def agenda():
    return render_template('agenda.html')
    
@app.route('/financas')
@login_required
def financas():
    return render_template('financas.html')

@app.route('/diario')
@login_required
def diario():
    return render_template('diario.html')

@app.route('/api/dados', methods=['GET', 'POST'])
@login_required
def gerenciar_dados():
    if request.method == 'POST':
        dados_recebidos = request.get_json(silent=True)
        try:
            salvar_dados(dados_recebidos)
        except (ValueError, RuntimeError, PyMongoError) as e:
            return jsonify({"status": "erro", "mensagem": str(e)}), 400
        return jsonify({"status": "sucesso"})
    try:
        return jsonify(carregar_dados())
    except (ValueError, RuntimeError, PyMongoError) as e:
        return jsonify({"status": "erro", "mensagem": str(e)}), 500

@app.route('/api/forum/editar/<int:post_index>', methods=['POST'])
@login_required
def editar_post_forum(post_index):
    dados_recebidos = request.get_json(silent=True)
    if not isinstance(dados_recebidos, dict):
        return jsonify({"status": "erro", "mensagem": "JSON inválido"}), 400
    novo_texto = dados_recebidos.get('texto')
    nova_secao = dados_recebidos.get('secao')
    
    try:
        banco = carregar_dados()
        if 0 <= post_index < len(banco["forum"]):
            banco["forum"][post_index]["texto"] = novo_texto
            banco["forum"][post_index]["secao"] = nova_secao
            salvar_dados(banco)
            return jsonify({"status": "sucesso"})
        return jsonify({"status": "erro", "mensagem": "Post não encontrado"}), 404
    except (ValueError, RuntimeError, PyMongoError) as e:
        return jsonify({"status": "erro", "mensagem": str(e)}), 500

@app.route('/api/forum', methods=['POST'])
@login_required
def adicionar_post_forum():
    texto = request.form.get('texto', '')
    data_post = request.form.get('data', '')
    secao_post = request.form.get('secao', 'Geral')
    nome_arquivo = None

    if 'arquivo' in request.files:
        arquivo = request.files['arquivo']
        if arquivo.filename != '':
            nome_limpo = secure_filename(arquivo.filename)
            nome_arquivo = f"{int(time.time())}_{nome_limpo}"
            caminho_salvar = os.path.join(app.config['UPLOAD_FOLDER'], nome_arquivo)
            arquivo.save(caminho_salvar)
    
    try:
        dados = carregar_dados()
        novo_post = {
            "texto": texto,
            "data": data_post,
            "secao": secao_post,
            "arquivo": nome_arquivo
        }
        dados["forum"].append(novo_post)
        salvar_dados(dados)
        return jsonify({"status": "sucesso"})
    except (ValueError, RuntimeError, PyMongoError) as e:
        return jsonify({"status": "erro", "mensagem": str(e)}), 500

@app.route('/uploads/<nome_arquivo>')
@login_required
def acessar_arquivo(nome_arquivo):
    return send_from_directory(app.config['UPLOAD_FOLDER'], nome_arquivo)

@app.route('/api/cadernos/<path:nome_arquivo>')
@login_required
def acessar_caderno(nome_arquivo):
    if Path(nome_arquivo).suffix.lower() != '.json':
        return jsonify({"status": "erro", "mensagem": "Arquivo não encontrado"}), 404
    return send_from_directory(CADERNOS_FOLDER, nome_arquivo)

if __name__ == '__main__':
    print("Servidor rodando! Abra seu navegador em http://127.0.0.1:5000")

    # Abre o navegador após 1.5 segundo (evita abrir duplicado devido ao modo debug do Flask)
    if not os.environ.get("WERKZEUG_RUN_MAIN"):
        Timer(1.5, lambda: webbrowser.open("http://127.0.0.1:5000")).start()

    app.run(debug=True, port=5000)