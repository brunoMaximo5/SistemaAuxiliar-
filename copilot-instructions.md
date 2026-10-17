# Sistema de Gestão Pessoal e de Estudos (Flask + MongoDB + Render)

## 📌 Visão Geral do Projeto
- **Objetivo**: Aplicação web e mobile pessoal desenvolvida para organizar rotina, estudos, tarefas diárias, finanças e anotações em um único local.
- **Conceito**: Sistema de alto desempenho, leve, privado e 100% responsivo para sincronização em tempo real entre computador e smartphone.
- **Ambiente**: Execução local (Flask dev) e hospedagem de produção contínua no **Render**.

---

## 🛠️ Arquitetura e Tecnologias
- **Backend**: Python com **Flask**.
- **Servidor de Produção**: `gunicorn`.
- **Banco de Dados**: **MongoDB** (MongoDB Atlas) via biblioteca `pymongo`.
  - *Conexão*: Realizada via URI de ambiente (`os.environ.get('MONGO_URI')`).
  - *Estrutura*: Documentos NoSQL flexíveis compatíveis com dicionários Python/JSON.
- **Frontend**: HTML5, CSS3 moderno (tema escuro, suporte a variáveis CSS e *glassmorphism*), JavaScript Vanilla e **Bootstrap 5 (CDN)** para layout mobile-first.
- **Motor de Templates**: Jinja2 utilizando herança de templates a partir de `templates/base.html`.

---

## 🚨 Regras Cruciais para a IA (GitHub Copilot)
1. **Banco de Dados Não-Relacional (MongoDB)**: Proponha e refatore o banco utilizando estritamente **PyMongo** com conexão ao MongoDB Atlas. Nunca sugira SQLite, PostgreSQL, MySQL ou SQLAlchemy.
2. **Mobile First / Responsividade**: Todos os componentes visuais devem ser otimizados para telas pequenas de smartphone, utilizando utilitários do Bootstrap 5, navegação adaptativa (Navbar/Offcanvas) e `meta viewport`.
3. **Variáveis de Ambiente**: Nunca expor credenciais do MongoDB no código. Sempre utilizar `os.environ.get()` para chaves e strings de conexão.
4. **Tratamento de Arquivos e Uploads**: Em hospedagem efêmera (Render), uploads de arquivos não devem depender de armazenamento estático local em disco. Utilize codificação para o banco ou integração leve.
5. **Preservação do Código**: Ao editar rotas no `app.py` ou blocos HTML, garanta a manutenção da lógica existente e a integridade dos blocos Jinja2 (`{% block content %}`).

---

## 🧩 Módulos do Sistema
1. **Gamificação (XP e Níveis)**: Registro de pontuação e tempo total acumulado.
2. **Modo Foco / Temporizador**: Cronômetro de estudos sincronizado via API.
3. **Módulos Gerais**:
   - **Painel Principal / Núcleo**: Visão geral e dashboards.
   - **Gestão de Rotina & Agenda**: Compromissos e acompanhamento de hábitos.
   - **Estatísticas**: Métricas de evolução.
   - **Fórum / Anotações**: Tópicos, seções e anexos.
   - **Cadernos de Questões**: Resolução e acompanhamento por disciplina.
   - **Finanças**: Controle de despesas, faturas, cartões e contas por pessoa.
   - **Diário Pessoal**: Registros e memórias do dia a dia.
   - **Sala de Estudos**: Espaço dedicado por matéria.

---

## 📁 Estrutura do Repositório
- `app.py`: Servidor Flask com rotas, APIs e integração PyMongo.
- `templates/`: Páginas HTML com herança Jinja2 (`base.html`, `index.html`, `financas.html`, etc.).
- `static/`: Estilos CSS, lógica em JS e imagens estáticas.
- `requirements.txt`: Dependências (`Flask`, `pymongo`, `dnspython`, `gunicorn`, `python-dotenv`).
- `Procfile`: Comando de inicialização no Render (`web: gunicorn app:app`).