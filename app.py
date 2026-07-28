from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import json
import os
import time

app = Flask(__name__)
DATA_FILE = 'dados.json'
UPLOAD_FOLDER = 'uploads'

# Garante que a pasta de uploads exista
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def carregar_dados():
    # Estrutura padrão com todas as chaves esperadas pelo sistema
    dados_padrao = {
        "xp": 0,
        "tempo_total": 0,
        "dias_seguidos": 0,
        "categorias": ["Principal"],
        "edital": [],
        "forum": [],
        "agenda": []
    }
    
    if not os.path.exists(DATA_FILE):
        return dados_padrao
    
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            dados = json.load(f)
            # Garante que chaves novas existam em arquivos salvos anteriormente
            for chave, valor in dados_padrao.items():
                if chave not in dados:
                    dados[chave] = valor
            return dados
    except Exception as e:
        print(f"Erro ao ler {DATA_FILE}: {e}")
        return dados_padrao

def salvar_dados(dados):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, indent=4)

# --- ROTAS DE TELAS ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/nucleo')
def nucleo():
    return render_template('nucleo.html')

@app.route('/rotina')
def rotina():
    return render_template('rotina.html')

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

# --- ROTAS DE DADOS (API) ---
@app.route('/api/dados', methods=['GET', 'POST'])
def gerenciar_dados():
    if request.method == 'POST':
        dados_recebidos = request.json
        salvar_dados(dados_recebidos)
        return jsonify({"status": "sucesso"})
    return jsonify(carregar_dados())

# --- RECEBER POSTS E ARQUIVOS DO FÓRUM ---
@app.route('/api/forum', methods=['POST'])
def adicionar_post_forum():
    texto = request.form.get('texto', '')
    data_post = request.form.get('data', '')
    nome_arquivo = None

    if 'arquivo' in request.files:
        arquivo = request.files['arquivo']
        if arquivo.filename != '':
            nome_limpo = secure_filename(arquivo.filename)
            # Adiciona timestamp prefixado para impedir nomes duplicados de se sobrescreverem
            nome_arquivo = f"{int(time.time())}_{nome_limpo}"
            caminho_salvar = os.path.join(app.config['UPLOAD_FOLDER'], nome_arquivo)
            arquivo.save(caminho_salvar)
    
    dados = carregar_dados()
    novo_post = {
        "texto": texto,
        "data": data_post,
        "arquivo": nome_arquivo
    }
    
    # Adiciona ao final da lista (o frontend forum.html cuida de inverter para exibir os recentes no topo)
    dados["forum"].append(novo_post)
    salvar_dados(dados)
    
    return jsonify({"status": "sucesso"})

# --- SERVIR OS ARQUIVOS SALVOS ---
@app.route('/uploads/<nome_arquivo>')
def acessar_arquivo(nome_arquivo):
    return send_from_directory(app.config['UPLOAD_FOLDER'], nome_arquivo)

if __name__ == '__main__':
    print("Servidor rodando! Abra seu navegador em http://127.0.0.1:5000")
    app.run(debug=True, port=5000)