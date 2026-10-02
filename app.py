from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import json
import os
import tempfile
from pathlib import Path
from threading import RLock
import time
import webbrowser
from threading import Timer

app = Flask(__name__)
DATA_FILE = 'dados.json'
UPLOAD_FOLDER = 'uploads'
CADERNOS_FOLDER = os.environ.get(
    'CADERNOS_FOLDER',
    str(Path(app.root_path).resolve().parents[1] / 'Arquivos Pessoais' / 'static' / 'cadernos')
)
_data_lock = RLock()

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def carregar_dados():
    dados_padrao = {
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
    
    if not os.path.exists(DATA_FILE):
        return dados_padrao
    
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            dados = json.load(f)
            if not isinstance(dados, dict):
                raise ValueError(f"O conteúdo de {DATA_FILE} deve ser um objeto JSON.")
            for chave, valor in dados_padrao.items():
                if chave not in dados:
                    dados[chave] = valor
            return dados
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise ValueError(f"Não foi possível ler {DATA_FILE}; o arquivo não foi alterado.") from e

def salvar_dados(dados):
    if not isinstance(dados, dict):
        raise ValueError("Os dados enviados devem ser um objeto JSON.")

    caminho = os.path.abspath(DATA_FILE)
    diretorio = os.path.dirname(caminho)
    caminho_temporario = None

    with _data_lock:
        try:
            with tempfile.NamedTemporaryFile(
                mode='w',
                encoding='utf-8',
                dir=diretorio,
                prefix=f'.{os.path.basename(caminho)}.',
                suffix='.tmp',
                delete=False
            ) as arquivo_temporario:
                caminho_temporario = arquivo_temporario.name
                json.dump(dados, arquivo_temporario, ensure_ascii=False, indent=4)
                arquivo_temporario.flush()
                os.fsync(arquivo_temporario.fileno())

            os.replace(caminho_temporario, caminho)
        finally:
            if caminho_temporario and os.path.exists(caminho_temporario):
                os.remove(caminho_temporario)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/nucleo')
def nucleo():
    return render_template('nucleo.html')

@app.route('/rotina')
def rotina():
    return render_template('rotina.html')

@app.route('/cadernos')
def cadernos():
    return render_template('cadernos.html')

@app.route('/estatistica')
def estatistica():
    return render_template('estatistica.html')

@app.route('/forum')
def forum():
    return render_template('forum.html')

@app.route('/sala/<id_assunto>')
def sala_estudos(id_assunto):
    return render_template('sala_estudos.html', id_assunto=id_assunto)

@app.route('/agenda')
def agenda():
    return render_template('agenda.html')
    
@app.route('/financas')
def financas():
    return render_template('financas.html')

@app.route('/diario')
def diario():
    return render_template('diario.html')

@app.route('/api/dados', methods=['GET', 'POST'])
def gerenciar_dados():
    if request.method == 'POST':
        dados_recebidos = request.get_json(silent=True)
        try:
            salvar_dados(dados_recebidos)
        except ValueError as e:
            return jsonify({"status": "erro", "mensagem": str(e)}), 400
        return jsonify({"status": "sucesso"})
    try:
        return jsonify(carregar_dados())
    except ValueError as e:
        return jsonify({"status": "erro", "mensagem": str(e)}), 500

@app.route('/api/forum/editar/<int:post_index>', methods=['POST'])
def editar_post_forum(post_index):
    dados_recebidos = request.json
    novo_texto = dados_recebidos.get('texto')
    nova_secao = dados_recebidos.get('secao')
    
    banco = carregar_dados()
    if 0 <= post_index < len(banco["forum"]):
        banco["forum"][post_index]["texto"] = novo_texto
        banco["forum"][post_index]["secao"] = nova_secao
        salvar_dados(banco)
        return jsonify({"status": "sucesso"})
    else:
        return jsonify({"status": "erro", "mensagem": "Post não encontrado"}), 404

@app.route('/api/forum', methods=['POST'])
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

@app.route('/uploads/<nome_arquivo>')
def acessar_arquivo(nome_arquivo):
    return send_from_directory(app.config['UPLOAD_FOLDER'], nome_arquivo)

@app.route('/api/cadernos/<path:nome_arquivo>')
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