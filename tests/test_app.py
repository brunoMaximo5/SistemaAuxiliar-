import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app


class PersistenciaDadosTests(unittest.TestCase):
    def setUp(self):
        self.pasta_temporaria = tempfile.TemporaryDirectory()
        self.arquivo_dados = Path(self.pasta_temporaria.name) / "dados-teste.json"
        self.patch_arquivo = patch.object(app, "DATA_FILE", str(self.arquivo_dados))
        self.patch_arquivo.start()
        self.addCleanup(self.patch_arquivo.stop)
        self.addCleanup(self.pasta_temporaria.cleanup)
        self.cliente = app.app.test_client()

    def test_rejeita_payload_que_nao_e_objeto_sem_criar_arquivo(self):
        resposta = self.cliente.post("/api/dados", json=[])

        self.assertEqual(resposta.status_code, 400)
        self.assertFalse(self.arquivo_dados.exists())

    def test_grava_e_carrega_dados_validos(self):
        resposta = self.cliente.post("/api/dados", json={"xp": 8})

        self.assertEqual(resposta.status_code, 200)
        dados = self.cliente.get("/api/dados").get_json()
        self.assertEqual(dados["xp"], 8)
        self.assertEqual(dados["agenda"], [])
        self.assertEqual(dados["financas"]["cartoes_config"], [])

    def test_json_corrompido_nao_e_substituido_por_defaults(self):
        conteudo_original = b"{json corrompido"
        self.arquivo_dados.write_bytes(conteudo_original)

        resposta = self.cliente.get("/api/dados")

        self.assertEqual(resposta.status_code, 500)
        self.assertEqual(self.arquivo_dados.read_bytes(), conteudo_original)
        self.assertEqual(list(self.arquivo_dados.parent.glob("*.tmp")), [])

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