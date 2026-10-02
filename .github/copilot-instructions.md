# Sistema de Gestão Pessoal e de Estudos (Flask)

## 📌 Visão Geral do Projeto
- **Objetivo**: Aplicação web pessoal desenvolvida para organizar a rotina, estudos, tarefas diárias, finanças e anotações num único local.
- **Conceito**: Uma alternativa privada, leve e 100% local/offline a ferramentas como o Notion.
- **Funcionamento**: Roda num servidor local em Flask que abre automaticamente no navegador ao iniciar, mantendo-se sempre aberto em segundo plano durante a utilização do computador.
- **Visão Futura**: Atualmente focado no uso pessoal local, com potencial para evoluir e ser lançado no futuro como uma plataforma/SaaS para ajudar outros utilizadores.

---

## 🛠️ Arquitetura e Tecnologias
- **Backend**: Python com a framework **Flask**.
- **Base de Dados**: Persistência local em formato JSON (`dados.json`), garantindo total independência de conexões externas ou bases de dados complexas.
- **Frontend**: HTML5, CSS3 moderno (tema escuro, suporte a variáveis CSS e *glassmorphism*) e JavaScript Vanilla.
- **Motor de Templates**: Jinja2 utilizando herança de templates a partir de um ficheiro base (`templates/base.html`).

---

## 🧩 Principais Módulos e Funcionalidades
1. **Gamificação (XP e Níveis)**: Sistema global de pontuação que calcula o nível do utilizador com base no tempo de estudo acumulado.
2. **Modo Foco / Temporizador**: Cronómetro interativo integrado na barra lateral (*sidebar*) para sessões de estudo por disciplina, sincronizado via `localStorage` e API Flask.
3. **Módulos do Sistema**:
   - **Tela Inicial / Núcleo**: Visão geral e dashboards principais.
   - **Gestão de Rotina & Agenda**: Acompanhamento de hábitos e compromissos num calendário.
   - **Estatísticas**: Análise de desempenho e tempo dedicado aos estudos.
   - **Fórum / Anotações**: Registo de tópicos com suporte a *upload* de anexos e ficheiros.
   - **Cadernos de Questões**: Resolução e acompanhamento de exercícios por matéria.
   - **Finanças**: Controlo de despesas, cartões e contas de terceiros.
   - **Diário**: Registo pessoal diário.
   - **Sala de Estudos**: Ambiente dedicado para foco por disciplina/assunto.

---

## 📁 Estrutura de Ficheiros e Diretórias
A estrutura atual do repositório no VS Code está organizada da seguinte forma:

- `app.py`: Servidor principal em Flask com as rotas e endpoints da API[cite: 1].
- `dados.json`: Ficheiro local onde são guardados os dados da aplicação[cite: 1].
- `SistemaIniciar.bat`: Script executável para arrancar o servidor Flask localmente no Windows[cite: 1].
- `copilot_instructions.md`: Ficheiro de diretrizes de contexto para a inteligência artificial[cite: 1].
- `uploads/`: Diretória reservada para o armazenamento de ficheiros e anexos enviados pelo utilizador[cite: 1].
- `templates/`: Diretória que contém todas as páginas HTML do sistema[cite: 1]:
  - `base.html`: Template principal com o layout de barra lateral, temporizador e CSS global[cite: 1].
  - `index.html`, `nucleo.html`, `rotina.html`, `agenda.html`, `estatistica.html`, `forum.html`, `cadernos.html`, `financas.html`, `diario.html`, `sala_estudos.html`[cite: 1].

---

## 📐 Diretrizes para Refatoração e Desenvolvimento com IA
- Manter o código Python simples, limpo e bem documentado em português.
- Garantir que todas as alterações respeitem a persistência de dados offline no ficheiro `dados.json`.
- Manter o padrão visual escuro (*dark mode*) e a consistência das rotas do Flask ao criar novas funcionalidades.