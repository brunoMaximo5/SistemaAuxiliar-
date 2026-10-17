import json
import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app


class FakeCollection:
    def __init__(self, documento=None, erro=None):
        self.documento = copy.deepcopy(documento)
        self.erro = erro

    def find_one(self, filtro):
        if self.erro:
            raise self.erro
        return copy.deepcopy(self.documento)

    def replace_one(self, filtro, documento, upsert=False):
        if self.erro:
            raise self.erro
        self.documento = copy.deepcopy(documento)


class PersistenciaDadosTests(unittest.TestCase):
    def setUp(self):
        self.pasta_temporaria = tempfile.TemporaryDirectory()
        self.addCleanup(self.pasta_temporaria.cleanup)
        self.cliente = app.app.test_client()
        self.colecao = FakeCollection()
        self.patch_colecao = patch.object(app, "_get_collection", return_value=self.colecao)
        self.patch_colecao.start()
        self.addCleanup(self.patch_colecao.stop)

    def test_rejeita_payload_que_nao_e_objeto(self):
        resposta = self.cliente.post("/api/dados", json=[])

        self.assertEqual(resposta.status_code, 400)
        self.assertIsNone(self.colecao.documento)

    def test_grava_e_carrega_dados_validos(self):
        resposta = self.cliente.post("/api/dados", json={"xp": 8})

        self.assertEqual(resposta.status_code, 200)
        dados = self.cliente.get("/api/dados").get_json()
        self.assertEqual(dados["xp"], 8)
        self.assertEqual(dados["agenda"], [])
        self.assertEqual(dados["financas"]["cartoes_config"], [])

    def test_documento_ausente_retorna_defaults(self):
        resposta = self.cliente.get("/api/dados")

        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.get_json(), app.DADOS_PADRAO)

    def test_erro_de_banco_retorna_json_controlado(self):
        with patch.object(app, "_get_collection", side_effect=app.PyMongoError("banco indisponível")):
            resposta = self.cliente.get("/api/dados")

        self.assertEqual(resposta.status_code, 500)
        self.assertEqual(resposta.get_json()["status"], "erro")
        self.assertIn("banco indisponível", resposta.get_json()["mensagem"])

    def test_endpoint_serve_apenas_json_da_pasta_configurada(self):
        pasta_cadernos = Path(self.pasta_temporaria.name) / "cadernos"
        pasta_cadernos.mkdir()
        (pasta_cadernos / "questoes.json").write_text(
            json.dumps({"questoes": []}), encoding="utf-8"
        )

        with patch.object(app, "CADERNOS_FOLDER", str(pasta_cadernos)):
            resposta = self.cliente.get("/api/cadernos/questoes.json")
            self.assertEqual(resposta.status_code, 200)
            self.assertEqual(resposta.get_json(), {"questoes": []})
            resposta.close()

            resposta = self.cliente.get("/api/cadernos/ausente.txt")
            self.assertEqual(resposta.status_code, 404)
            resposta.close()

            resposta = self.cliente.get("/api/cadernos/../dados-teste.json")
            self.assertEqual(resposta.status_code, 404)
            resposta.close()

    def test_paginas_principais_e_assets_locais_carregam(self):
        rotas = [
            "/", "/nucleo", "/rotina", "/cadernos", "/estatistica",
            "/forum", "/sala/0-0", "/agenda", "/financas", "/diario"
        ]
        for rota in rotas:
            with self.subTest(rota=rota):
                resposta = self.cliente.get(rota)
                self.assertEqual(resposta.status_code, 200)

        html_estatisticas = self.cliente.get("/estatistica").get_data(as_text=True)
        self.assertIn("/static/js/utilidades.js", html_estatisticas)
        self.assertIn("/static/vendor/chart.umd.min.js", html_estatisticas)
        self.assertNotIn("https://cdn.jsdelivr.net", html_estatisticas)

        html_sala = self.cliente.get("/sala/0-0").get_data(as_text=True)
        self.assertIn("/static/vendor/purify.min.js", html_sala)

        html_financas = self.cliente.get("/financas").get_data(as_text=True)
        self.assertIn("Pagamentos Pix", html_financas)
        self.assertIn("cartões", html_financas.lower())
        for elemento in (
            'id="resumo-filtro-pessoa"',
            'id="resumo-filtro-cartao"',
            'id="limpar-filtros-resumo"',
            'id="resumo-pessoas"',
            'id="resumo-cartoes"',
            'id="resumo-lancamentos"',
        ):
            self.assertIn(elemento, html_financas)

        for asset in (
            "/static/js/utilidades.js",
            "/static/js/foco.js",
            "/static/js/financas.js",
            "/static/vendor/chart.umd.min.js",
            "/static/vendor/purify.min.js",
        ):
            with self.subTest(asset=asset):
                resposta = self.cliente.get(asset)
                try:
                    self.assertEqual(resposta.status_code, 200)
                finally:
                    resposta.close()


if __name__ == "__main__":
    unittest.main()