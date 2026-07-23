from flask import Flask, render_template, request, jsonify
import json
import os

app = Flask(__name__)
DATA_FILE = 'dados.json'

def carregar_dados():
    # Se o arquivo não existir, cria a estrutura alinhada com o seu JSON original
    if not os.path.exists(DATA_FILE):
        return {"xp": 0, "edital": []}
    
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def salvar_dados(dados):
    # Salva os dados no arquivo local
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, indent=4)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/nucleo')
def nucleo():
    return render_template('nucleo.html')

@app.route('/api/dados', methods=['GET', 'POST'])
def gerenciar_dados():
    # AQUI ESTAVA O ERRO! Agora a função gerencia tanto salvar (POST) quanto enviar (GET)
    if request.method == 'POST':
        dados_recebidos = request.json
        salvar_dados(dados_recebidos)
        return jsonify({"status": "sucesso"})
    
    # Se for GET, retorna os dados atuais
    return jsonify(carregar_dados())

@app.route('/sala/<id_assunto>')
def sala_estudos(id_assunto):
    return render_template('sala_estudos.html', id_assunto=id_assunto)

if __name__ == '__main__':
    print("Servidor rodando! Abra seu navegador em http://127.0.0.1:5000")
    app.run(debug=True, port=5000)