# SistemaAuxiliar-

Aplicação pessoal local para organizar estudos, rotina, agenda, finanças e anotações. O servidor usa Flask e MongoDB Atlas via PyMongo. Configure `MONGO_URI` no ambiente antes de iniciar; nunca inclua credenciais na documentação ou no código.

## Requisitos

- Windows 10 ou superior
- Python 3.10 ou superior
- Flask, instalado pelo arquivo `requirements.txt`

## Instalação e execução

No PowerShell, dentro da pasta do projeto:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\SistemaIniciar.bat
```

O servidor fica disponível em `http://127.0.0.1:5000`. A aplicação é local e de usuário único; `debug=True` é apropriado somente para desenvolvimento local, não para publicação na internet.

Os cadernos de questões ficam, por padrão, em `..\..\Arquivos Pessoais\static\cadernos`, conforme a organização deste workspace. É possível apontar outra pasta definindo a variável de ambiente `CADERNOS_FOLDER` antes de iniciar o servidor. O endpoint serve apenas arquivos `.json` dessa pasta.

Chart.js 4.4.9 e DOMPurify 3.3.1 ficam em `static/vendor/` para uso sem internet. Os arquivos de licença correspondentes também estão nessa pasta.

## Finanças

Uma compra pode ser dividida em partes independentes, cada uma com meio de pagamento, cartão (quando aplicável), valor, quantidade de parcelas e mês inicial próprios. O mês inicial é informado pelo usuário; os dias de fechamento e vencimento cadastrados no cartão são exibidos como referência, sem tentar adivinhar a fatura de uma compra. A aba Pix lista pagamentos Pix previstos, mas não mantém saldo de conta.

## Testes e verificações

Os testes usam uma coleção falsa em memória e não acessam o MongoDB real:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m compileall -q app.py tests
```
O banco padrão é `sistema_auxiliar`, mas pode ser alterado com `MONGO_DB_NAME`. O estado agregado da aplicação fica na coleção `dados`, em um único documento principal.

As contas usam Flask-Login e senhas armazenadas somente como hash Werkzeug. Páginas e arquivos privados redirecionam ao login; endpoints `/api/*` retornam JSON 401 para manter os `fetch(...).json()` existentes compatíveis. A sessão usa `SECRET_KEY`, cookie HttpOnly e SameSite=Lax. Flask-WTF/CSRF obrigatório não foi introduzido porque os POSTs atuais usam `fetch` e `FormData` sem token; em produção, configure uma `SECRET_KEY` forte, HTTPS e considere adicionar token CSRF aos helpers JavaScript antes de expor a aplicação a requisições entre sites.

O banco padrão é `sistema_auxiliar`, mas pode ser alterado com `MONGO_DB_NAME`. Os usuários ficam na coleção `usuarios` e os dados ficam na coleção `dados`, em um documento por usuário. O documento legado `_id=dados_principais` é preservado e copiado apenas para o primeiro usuário.

Para backup e restauração, use os recursos do MongoDB Atlas e mantenha também os arquivos da pasta de cadernos e os anexos em `uploads/` se quiser preservar todos os dados locais.
