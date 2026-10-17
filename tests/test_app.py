import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app


class FakeCollection:
    def __init__(self, documentos=None):
        self.documentos = copy.deepcopy(documentos or [])

    def find_one(self, filtro):
        for documento in self.documentos:
            if all(documento.get(chave) == valor for chave, valor in filtro.items()):
                return copy.deepcopy(documento)
        return None

    def insert_one(self, documento):
        self.documentos.append(copy.deepcopy(documento))

    def replace_one(self, filtro, documento, upsert=False):
        for indice, existente in enumerate(self.documentos):
            if all(existente.get(chave) == valor for chave, valor in filtro.items()):
                self.documentos[indice] = copy.deepcopy(documento)
                return
        if upsert:
            self.documentos.append(copy.deepcopy(documento))

    def count_documents(self, filtro):
        return sum(all(documento.get(k) == v for k, v in filtro.items()) for documento in self.documentos)

    def create_index(self, *args, **kwargs):
        return 'fake-index'


class AutenticacaoEIsolamentoTests(unittest.TestCase):
    def setUp(self):
        self.cliente = app.app.test_client()
        self.colecao_dados = FakeCollection()
        self.colecao_usuarios = FakeCollection()
        self.patch_dados = patch.object(app, '_get_collection', return_value=self.colecao_dados)
        self.patch_usuarios = patch.object(app, '_get_users_collection', return_value=self.colecao_usuarios)
        self.patch_dados.start()
        self.patch_usuarios.start()
        self.addCleanup(self.patch_dados.stop)
        self.addCleanup(self.patch_usuarios.stop)

    def cadastrar(self, username, email=None, senha='senha-segura'):
        return self.cliente.post('/register', data={
            'username': username, 'email': email or f'{username}@example.com',
            'password': senha, 'password_confirm': senha,
        })

    def login(self, username, senha='senha-segura'):
        return self.cliente.post('/login', data={'username': username, 'password': senha})

    def test_registro_login_correto_incorreto_e_logout(self):
        self.assertEqual(self.cadastrar('bruno').status_code, 302)
        usuario = self.colecao_usuarios.documentos[0]
        self.assertNotIn('password', usuario)
        self.assertNotEqual(usuario['password_hash'], 'senha-segura')
        self.assertEqual(self.cliente.get('/api/dados').status_code, 200)
        self.cliente.get('/logout')
        resposta = self.login('bruno', 'errada')
        self.assertEqual(resposta.status_code, 200)
        self.assertIn('inválidos', resposta.get_data(as_text=True))
        self.assertEqual(self.login('bruno').status_code, 302)
        self.assertEqual(self.cliente.get('/logout').status_code, 302)
        self.assertEqual(self.cliente.get('/').status_code, 302)

    def test_login_rejeita_next_externo_e_preserva_redirecionamento_local(self):
        self.assertEqual(self.cadastrar('bruno').status_code, 302)
        self.cliente.get('/logout')

        resposta = self.cliente.post('/login?next=https://exemplo.com', data={
            'username': 'bruno', 'password': 'senha-segura',
        })
        self.assertEqual(resposta.status_code, 302)
        self.assertEqual(resposta.location, '/')

        self.cliente.get('/logout')
        resposta = self.cliente.post('/login', data={
            'username': 'bruno', 'password': 'senha-segura', 'next': '/forum',
        })
        self.assertEqual(resposta.status_code, 302)
        self.assertEqual(resposta.location, '/forum')

    def test_editar_post_forum_rejeita_json_ausente_ou_nao_objeto(self):
        self.assertEqual(self.cadastrar('bruno').status_code, 302)
        for corpo in (None, [], 'texto'):
            with self.subTest(corpo=corpo):
                resposta = self.cliente.post('/api/forum/editar/0', json=corpo)
                self.assertEqual(resposta.status_code, 400)

    def test_protecao_de_paginas_e_api_retorna_json_401(self):
        self.assertEqual(self.cliente.get('/').status_code, 302)
        resposta = self.cliente.get('/api/dados')
        self.assertEqual(resposta.status_code, 401)
        self.assertEqual(resposta.get_json()['status'], 'erro')
        self.assertEqual(self.cliente.get('/uploads/arquivo.txt').status_code, 302)
        self.assertEqual(self.cliente.get('/api/cadernos/questoes.json').status_code, 401)

    def test_isolamento_entre_dois_usuarios(self):
        self.cadastrar('primeiro')
        self.cliente.post('/api/dados', json={'xp': 42})
        self.cliente.get('/logout')
        self.cadastrar('segundo')
        self.assertEqual(self.cliente.get('/api/dados').get_json()['xp'], 0)
        self.cliente.post('/api/dados', json={'xp': 9, 'user_id': 'adulterado'})
        self.cliente.get('/logout')
        self.login('primeiro')
        dados = self.cliente.get('/api/dados').get_json()
        self.assertEqual(dados['xp'], 42)
        self.assertNotIn('user_id', dados)

    def test_migra_documento_legado_apenas_para_primeiro_usuario(self):
        legado = copy.deepcopy(app.DADOS_PADRAO)
        legado['xp'] = 77
        self.colecao_dados.insert_one({'_id': 'dados_principais', **legado})
        self.cadastrar('inicial')
        self.assertEqual(self.cliente.get('/api/dados').get_json()['xp'], 77)
        id_usuario = self.colecao_usuarios.documentos[0]['_id']
        self.assertIsNotNone(self.colecao_dados.find_one({'user_id': id_usuario}))
        self.assertIsNotNone(self.colecao_dados.find_one({'_id': 'dados_principais'}))
        self.cliente.get('/logout')
        self.cadastrar('seguinte')
        self.assertEqual(self.cliente.get('/api/dados').get_json()['xp'], 0)


class ContratosFrontendTests(unittest.TestCase):
    def setUp(self):
        self.pasta_temporaria = tempfile.TemporaryDirectory()
        self.addCleanup(self.pasta_temporaria.cleanup)
        self.cliente = app.app.test_client()
        self.colecao_dados = FakeCollection()
        self.colecao_usuarios = FakeCollection()
        self.patch_dados = patch.object(app, '_get_collection', return_value=self.colecao_dados)
        self.patch_usuarios = patch.object(app, '_get_users_collection', return_value=self.colecao_usuarios)
        self.patch_dados.start()
        self.patch_usuarios.start()
        self.addCleanup(self.patch_dados.stop)
        self.addCleanup(self.patch_usuarios.stop)
        self.cliente.post('/register', data={
            'username': 'teste', 'email': 'teste@example.com',
            'password': 'senha-segura', 'password_confirm': 'senha-segura',
        })

    def test_endpoint_serve_apenas_json_da_pasta_configurada(self):
        pasta_cadernos = Path(self.pasta_temporaria.name) / 'cadernos'
        pasta_cadernos.mkdir()
        (pasta_cadernos / 'questoes.json').write_text(json.dumps({'questoes': []}), encoding='utf-8')
        with patch.object(app, 'CADERNOS_FOLDER', str(pasta_cadernos)):
            resposta = self.cliente.get('/api/cadernos/questoes.json')
            self.assertEqual(resposta.status_code, 200)
            self.assertEqual(resposta.get_json(), {'questoes': []})
            resposta.close()
            resposta = self.cliente.get('/api/cadernos/ausente.txt')
            self.assertEqual(resposta.status_code, 404)
            resposta.close()

    def test_paginas_principais_e_assets_locais_carregam(self):
        rotas = ['/', '/nucleo', '/rotina', '/cadernos', '/estatistica', '/forum', '/sala/0-0', '/agenda', '/financas', '/diario']
        for rota in rotas:
            with self.subTest(rota=rota):
                self.assertEqual(self.cliente.get(rota).status_code, 200)
        html_estatisticas = self.cliente.get('/estatistica').get_data(as_text=True)
        self.assertIn('/static/js/utilidades.js', html_estatisticas)
        self.assertIn('/static/vendor/chart.umd.min.js', html_estatisticas)
        self.assertIn('bootstrap@5', html_estatisticas)
        self.assertIn('/static/vendor/purify.min.js', self.cliente.get('/sala/0-0').get_data(as_text=True))
        html_financas = self.cliente.get('/financas').get_data(as_text=True)
        self.assertIn('Pagamentos Pix', html_financas)
        for elemento in ('id="resumo-filtro-pessoa"', 'id="resumo-filtro-cartao"', 'id="limpar-filtros-resumo"', 'id="resumo-pessoas"', 'id="resumo-cartoes"', 'id="resumo-lancamentos"'):
            self.assertIn(elemento, html_financas)
        for asset in ('/static/js/utilidades.js', '/static/js/foco.js', '/static/js/financas.js', '/static/vendor/chart.umd.min.js', '/static/vendor/purify.min.js'):
            with self.subTest(asset=asset):
                resposta = self.cliente.get(asset)
                self.assertEqual(resposta.status_code, 200)
                resposta.close()


if __name__ == '__main__':
    unittest.main()

