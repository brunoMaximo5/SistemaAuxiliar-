import copy
import json
import math
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

    def find(self, filtro=None):
        filtro = filtro or {}
        encontrados = []
        for documento in self.documentos:
            corresponde = True
            for chave, valor in filtro.items():
                if isinstance(valor, dict) and '$exists' in valor:
                    corresponde = corresponde and (chave in documento) == valor['$exists']
                else:
                    corresponde = corresponde and documento.get(chave) == valor
            if corresponde:
                encontrados.append(copy.deepcopy(documento))
        return encontrados

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

    def test_carregamento_exige_id_e_usuario_do_documento(self):
        self.cadastrar('bruno')
        id_usuario = self.colecao_usuarios.documentos[0]['_id']
        self.colecao_dados.replace_one(
            {'_id': f'dados_principais:{id_usuario}'},
            {'_id': f'dados_principais:{id_usuario}', 'user_id': 'outro-usuario', 'xp': 999},
            upsert=True,
        )

        dados = self.cliente.get('/api/dados').get_json()

        self.assertEqual(dados['xp'], 0)
        documento = self.colecao_dados.find_one({'_id': f'dados_principais:{id_usuario}'})
        self.assertEqual(documento['user_id'], id_usuario)

    def test_post_parcial_preserva_modulos_e_identidade_do_servidor(self):
        self.assertEqual(self.cadastrar('parcial').status_code, 302)
        original = {
            'xp': 7,
            'agenda': [{'id': 'agenda-1', 'titulo': 'Estudar'}],
            'forum': [{'id': 'forum-1', 'texto': 'Publicação'}],
            'financas': {
                'cartoes': ['Banco'],
                'receitas': [{'id': 'receita-1', 'descricao': 'Salário', 'valor': 100}],
                'despesas': [{'id': 'despesa-1', 'descricao': 'Mercado', 'valor': 50}],
                'cartoes_config': [{'nome': 'Banco', 'titular': 'Bruno'}],
            },
            '_id': 'cliente', 'user_id': 'cliente',
        }
        self.assertEqual(self.cliente.post('/api/dados', json=original).status_code, 200)
        self.assertEqual(self.cliente.post('/api/dados', json={'xp': 42, '_id': 'falso', 'user_id': 'falso'}).status_code, 200)
        dados = self.cliente.get('/api/dados').get_json()
        self.assertEqual(dados['xp'], 42)
        self.assertEqual(dados['agenda'], original['agenda'])
        self.assertEqual(dados['forum'], original['forum'])
        self.assertEqual(dados['financas']['cartoes'], ['Banco'])
        self.assertEqual(dados['financas']['receitas'][0]['id'], 'receita-1')
        self.assertEqual(dados['financas']['despesas'][0]['compra_id'], 'despesa-1')
        self.assertEqual(dados['financas']['cartoes_config'][0]['nome'], 'Banco')
        self.assertNotIn('_id', dados)
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

    def test_recupera_legado_rico_quando_documento_do_usuario_esta_zerado(self):
        self.cadastrar('legado')
        id_usuario = self.colecao_usuarios.documentos[0]['_id']
        legado = copy.deepcopy(app.DADOS_PADRAO)
        legado.update({
            'xp': 321,
            'edital': [{'disciplina': 'Direito', 'assunto': 'Constitucional'}],
            'diario': [{'texto': 'Registro preservado'}],
        })
        self.colecao_dados.insert_one({'_id': f'dados_principais:{id_usuario}', 'user_id': id_usuario, **copy.deepcopy(app.DADOS_PADRAO)})
        self.colecao_dados.insert_one({'_id': 'dados_principais', **legado})

        dados = self.cliente.get('/api/dados').get_json()

        self.assertEqual(dados['xp'], 321)
        self.assertEqual(dados['edital'], legado['edital'])
        self.assertEqual(dados['diario'], legado['diario'])
        documento = self.colecao_dados.find_one({'_id': f'dados_principais:{id_usuario}'})
        self.assertEqual(documento['user_id'], id_usuario)
        self.assertNotIn('user_id', self.colecao_dados.find_one({'_id': 'dados_principais'}))

    def test_recupera_legado_com_indicadores_reais_e_ignora_acessorios_zerados(self):
        self.cadastrar('bmc5')
        id_usuario = self.colecao_usuarios.documentos[0]['_id']
        legado = copy.deepcopy(app.DADOS_PADRAO)
        legado.update({
            'xp': 1600,
            'tempo_total': 86400,
            'edital': [{'id': indice, 'titulo': f'Edital {indice}'} for indice in range(13)],
            'categorias': ['Principal'],
            'diario': [],
            'forum': [],
            'financas': {
                **copy.deepcopy(app.DADOS_PADRAO['financas']),
                'despesas': [{'descricao': f'Despesa {indice}', 'valor_total': indice} for indice in range(30)],
            },
        })
        self.colecao_dados.insert_one({
            '_id': f'dados_principais:{id_usuario}',
            'user_id': id_usuario,
            **copy.deepcopy(app.DADOS_PADRAO),
        })
        self.colecao_dados.insert_one({'_id': 'dados_principais', **legado})

        dados = self.cliente.get('/api/dados').get_json()

        self.assertEqual(dados['xp'], 1600)
        self.assertEqual(dados['tempo_total'], 86400)
        self.assertEqual(len(dados['edital']), 13)
        self.assertEqual(len(dados['financas']['despesas']), 30)
        documento = self.colecao_dados.find_one({'_id': f'dados_principais:{id_usuario}'})
        self.assertEqual(documento['_id'], f'dados_principais:{id_usuario}')
        self.assertEqual(documento['user_id'], id_usuario)
        self.assertEqual(documento['edital'], legado['edital'])
        self.assertEqual(documento['financas']['despesas'], legado['financas']['despesas'])
        legado_preservado = self.colecao_dados.find_one({'_id': 'dados_principais'})
        self.assertEqual(legado_preservado['xp'], 1600)
        self.assertEqual(len(legado_preservado['edital']), 13)
        self.assertEqual(len(legado_preservado['financas']['despesas']), 30)

    def test_revincula_legado_por_campo_preservando_dados_ativos(self):
        self.cadastrar('revinculacao')
        id_usuario = self.colecao_usuarios.documentos[0]['_id']
        ativo = copy.deepcopy(app.DADOS_PADRAO)
        ativo.update({
            'forum': [{'id': 'forum-ativo', 'texto': 'Publicação atual'}],
            'diario': [{'texto': 'Diário atual'}],
            'financas': {
                **copy.deepcopy(app.DADOS_PADRAO['financas']),
                'despesas': [{'id': 'despesa-ativa', 'descricao': 'Despesa atual'}],
            },
        })
        legado = copy.deepcopy(app.DADOS_PADRAO)
        legado.update({
            'xp': 900,
            'tempo_total': 3600,
            'edital': [{'id': 'edital-legado', 'titulo': 'Edital legado'}],
            'forum': [{'id': 'forum-legado'}],
            'diario': [{'texto': 'Diário legado'}],
            'financas': {
                **copy.deepcopy(app.DADOS_PADRAO['financas']),
                'despesas': [{'id': 'despesa-legada'}],
            },
        })
        self.colecao_dados.replace_one({
            '_id': f'dados_principais:{id_usuario}',
        }, {
            '_id': f'dados_principais:{id_usuario}',
            'user_id': id_usuario,
            **ativo,
        }, upsert=True)
        self.colecao_dados.insert_one({'_id': 'dados_principais', **legado})

        dados = self.cliente.get('/api/dados').get_json()
        dados_novamente = self.cliente.get('/api/dados').get_json()

        self.assertEqual(dados['xp'], 900)
        self.assertEqual(dados['tempo_total'], 3600)
        self.assertEqual(dados['edital'], legado['edital'])
        self.assertEqual(dados['forum'], ativo['forum'])
        self.assertEqual(dados['diario'], ativo['diario'])
        self.assertEqual(dados['financas']['despesas'][0]['id'], 'despesa-ativa')
        self.assertEqual(dados['financas']['despesas'][0]['descricao'], 'Despesa atual')
        documento = self.colecao_dados.find_one({'_id': f'dados_principais:{id_usuario}'})
        self.assertEqual(documento['financas']['despesas'], ativo['financas']['despesas'])
        self.assertEqual(dados_novamente, dados)


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
        for elemento in ('id="resumo-filtro-pessoa"', 'id="resumo-filtro-cartao"', 'id="limpar-filtros-resumo"', 'id="resumo-pessoas"', 'id="resumo-cartoes"', 'id="resumo-lancamentos"', 'id="periodo-financeiro"', 'id="data-analise-financeira"', 'id="gastos-por-dia"'):
            self.assertIn(elemento, html_financas)
        for elemento in ('id="painel-dashboard"', 'id="a-receber-familia"', 'id="form-receita"', 'id="receita-descricao"', 'id="receita-valor"', 'id="receita-mes"', 'id="receita-categoria"', 'id="form-categoria"', 'id="btn-lancamento-rapido"', 'id="modal-lancamento-rapido"', 'id="rapido-forma"', 'id="titular-despesa"', 'id="data-compra"', 'id="rapido-data-compra"'):
            self.assertIn(elemento, html_financas)
        self.assertIn('id="novo-cartao-titular"', html_financas)
        for asset in ('/static/js/utilidades.js', '/static/js/foco.js', '/static/js/financas.js', '/static/vendor/chart.umd.min.js', '/static/vendor/purify.min.js'):
            with self.subTest(asset=asset):
                resposta = self.cliente.get(asset)
                self.assertEqual(resposta.status_code, 200)
                resposta.close()

    def test_contrato_de_datas_e_selecao_financeira(self):
        html = self.cliente.get('/financas').get_data(as_text=True)
        resposta_javascript = self.cliente.get('/static/js/financas.js')
        javascript = resposta_javascript.get_data(as_text=True)
        resposta_javascript.close()
        for valor in ('value="mes"', 'value="semana"', 'value="dia"'):
            self.assertIn(valor, html)
        for valor in ('data_compra', 'selecionarDespesasFinanceiras', 'gastos-por-dia', 'dataAtualLocal'):
            self.assertIn(valor, javascript)
        self.assertNotIn('toISOString()', javascript)

    def test_lancamento_rapido_contem_selecao_de_cartao_origem(self):
        html = self.cliente.get('/financas').get_data(as_text=True)
        resposta_javascript = self.cliente.get('/static/js/financas.js')
        javascript = resposta_javascript.get_data(as_text=True)
        resposta_javascript.close()
        self.assertIn('id="rapido-cartao"', html)
        self.assertIn('id="rapido-cartao-campo"', html)
        self.assertIn("['cartao_credito', 'pix_credito'].includes(forma) && !origem", javascript)
        self.assertIn('origem_cartao_conta: origem', javascript)

    def test_contratos_do_painel_pix_e_do_cadastro_de_cartao(self):
        resposta_javascript = self.cliente.get('/static/js/financas.js')
        javascript = resposta_javascript.get_data(as_text=True)
        resposta_javascript.close()
        self.assertIn("['pix_debito', 'pix_credito'].includes(despesa.forma_pagamento)", javascript)
        self.assertIn("['Pagamento', 'Data da compra', 'Forma', 'Parcela', 'Valor do mês', '']", javascript)
        self.assertIn("const campoTitular = document.getElementById('novo-cartao-titular');", javascript)
        self.assertIn("bancoFinancas.cartoes_config.push({ nome, titular });", javascript)
        self.assertNotIn('\\vert{}\\vert{}', javascript)
        self.assertIn("mesInicio || ''", javascript)
        self.assertIn("mesReferencia || ''", javascript)


class NormalizacaoFinanceiraTests(unittest.TestCase):
    def test_padrao_contem_receitas_e_categorias(self):
        financas = app.DADOS_PADRAO['financas']
        self.assertEqual(financas['receitas'], [])
        self.assertIn('Outros', financas['categorias'])

    def test_migra_legado_preserva_id_aliases_e_infera_forma(self):
        legado = {
            'cartoes': ['Banco'], 'pessoas': ['Bruno'],
            'despesas': [{
                'compra_id': 'compra-legada', 'descricao': 'Mercado',
                'valor_total': '120.50', 'parcelas': 2, 'mes_inicio': '2026-10',
                'meio': 'cartao', 'cartao': 'Banco', 'pessoa': 'Bruno',
            }],
        }
        normalizado = app.normalizar_financas(legado)
        despesa = normalizado['despesas'][0]
        self.assertEqual(despesa['compra_id'], 'compra-legada')
        self.assertEqual(despesa['tipo'], 'Despesa')
        self.assertEqual(despesa['categoria'], 'Outros')
        self.assertEqual(despesa['titular_despesa'], 'Bruno')
        self.assertEqual(despesa['forma_pagamento'], 'cartao_credito')
        self.assertEqual(despesa['meio'], 'cartao')
        self.assertEqual(despesa['cartao'], 'Banco')
        self.assertEqual(despesa['pessoa'], 'Bruno')

    def test_normalizacao_de_receita_cartao_e_idempotencia(self):
        financas = {
            'receitas': [{'id': 'receita-1', 'descricao': 'Salário', 'valor': '3000', 'mes_referencia': '2026-10'}],
            'categorias': ['Casa'],
            'cartoes_config': [{'nome': 'Banco', 'titular': 'Texto livre'}],
            'despesas': [{'id': 'despesa-1', 'descricao': 'Pix', 'valor': 10, 'forma_pagamento': 'pix_credito', 'mes_inicio': '2026-10'}],
        }
        primeira = app.normalizar_financas(financas)
        segunda = app.normalizar_financas(primeira)
        self.assertEqual(primeira, segunda)
        self.assertEqual(primeira['receitas'][0]['id'], 'receita-1')
        self.assertEqual(primeira['receitas'][0]['tipo'], 'Receita')
        self.assertEqual(primeira['categorias'], ['Casa', 'Outros'])
        self.assertEqual(primeira['cartoes_config'][0]['titular'], 'Texto livre')
        self.assertEqual(primeira['despesas'][0]['forma_pagamento'], 'pix_credito')

    def test_data_compra_preserva_iso_e_limpa_valores_invalidos_sem_inventar_legado(self):
        normalizado = app.normalizar_financas({'despesas': [
            {'descricao': 'Datada', 'valor': 10, 'data_compra': '2026-10-17'},
            {'descricao': 'Invalida', 'valor': 11, 'data_compra': '17/10/2026'},
            {'descricao': 'Calendario', 'valor': 11, 'data_compra': '2026-02-30'},
            {'descricao': 'Legada', 'valor': 12},
        ]})
        self.assertEqual(normalizado['despesas'][0]['data_compra'], '2026-10-17')
        self.assertEqual(normalizado['despesas'][1]['data_compra'], '')
        self.assertEqual(normalizado['despesas'][2]['data_compra'], '')
        self.assertEqual(normalizado['despesas'][3]['data_compra'], '')

    def test_ids_legados_sao_deterministicos_e_valores_invalidos_rejeitados(self):
        financas = {
            'despesas': [{'descricao': 'Legada', 'valor': 10}],
            'receitas': [{'descricao': 'Receita legada', 'valor': 20}],
        }
        primeira = app.normalizar_financas(financas)
        segunda = app.normalizar_financas(financas)
        self.assertEqual(primeira, segunda)
        self.assertEqual(primeira['despesas'][0]['compra_id'], 'legado-despesa-0')
        self.assertEqual(primeira['receitas'][0]['id'], 'legado-receita-0')
        with self.assertRaises(ValueError):
            app.normalizar_financas({'despesas': [{'valor': math.inf}]})
        with self.assertRaises(ValueError):
            app.normalizar_financas({'despesas': [{'valor': 10, 'parcelas': 1.5}]})

    def test_classificacao_preserva_pessoa_e_formas_de_pagamento(self):
        normalizado = app.normalizar_financas({'despesas': [
            {'valor': 10, 'forma_pagamento': 'cartao_credito', 'cartao': 'Banco', 'pessoa': 'Bruno', 'titular_despesa': 'Reembolsável - Ana'},
            {'valor': 11, 'forma_pagamento': 'pix_credito', 'cartao': 'Conta', 'pessoa': 'Caio'},
            {'valor': 12, 'forma_pagamento': 'va'},
            {'valor': 13, 'forma_pagamento': 'vr'},
            {'valor': 14, 'forma_pagamento': 'dinheiro'},
        ]})
        despesas = normalizado['despesas']
        self.assertEqual(despesas[0]['pessoa'], 'Bruno')
        self.assertEqual(despesas[0]['titular_despesa'], 'Reembolsável - Ana')
        self.assertEqual([item['forma_pagamento'] for item in despesas], ['cartao_credito', 'pix_credito', 'va', 'vr', 'dinheiro'])
        self.assertEqual(despesas[1]['cartao'], 'Conta')
        self.assertEqual(despesas[1]['origem_cartao_conta'], 'Conta')

    def test_pix_credito_usa_origem_como_cartao_efetivo(self):
        despesas = app.normalizar_financas({'despesas': [{
            'descricao': 'Compra Pix crédito', 'valor': 25,
            'forma_pagamento': 'pix_credito', 'origem_cartao_conta': 'Conta corrente',
        }]})['despesas']
        self.assertEqual(despesas[0]['cartao'], 'Conta corrente')
        self.assertEqual(despesas[0]['origem_cartao_conta'], 'Conta corrente')

    def test_normalizacao_de_dados_remove_identidade_do_cliente(self):
        dados = app._normalizar_dados({'_id': 'adulterado', 'user_id': 'adulterado', 'financas': {}})
        self.assertNotIn('_id', dados)
        self.assertNotIn('user_id', dados)
        self.assertIn('receitas', dados['financas'])


if __name__ == '__main__':
    unittest.main()

