# SistemaAuxiliar-

Aplicação pessoal local para organizar estudos, rotina, agenda, finanças e anotações. O servidor usa Flask; os dados principais ficam em `dados.json`, que contém informações pessoais e não deve ser publicado.

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

Os testes usam arquivos temporários e não escrevem no `dados.json` real:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m compileall -q app.py tests
.\.venv\Scripts\python.exe -m json.tool dados.json > $null
```

O último comando valida o JSON local sem exibir o conteúdo. Se o arquivo estiver danificado, faça uma cópia antes de qualquer reparo; a aplicação agora informa erro de leitura em vez de substituir os dados por valores padrão.

## Backup e restauração

1. Feche a aplicação antes de copiar `dados.json`.
2. Guarde uma cópia em local privado e protegido; o arquivo inclui informações pessoais e financeiras.
3. Para restaurar, feche o servidor e substitua `dados.json` pela cópia válida.
4. Preserve também os arquivos da pasta de cadernos e os anexos em `uploads/` se quiser restaurar todos os dados locais.

`dados.json`, `uploads/` e os JSON dos cadernos são ignorados pelo Git. Não remova essa proteção nem envie esses arquivos a um repositório público.
