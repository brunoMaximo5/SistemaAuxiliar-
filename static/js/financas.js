let bancoFinancas = { cartoes: [], pessoas: [], despesas: [], cartoes_config: [] };
let ultimoMesAutomatico = '';

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function normalizarFinancas(financas) {
    const origem = financas && typeof financas === 'object' ? financas : {};
    return {
        ...origem,
        cartoes: Array.isArray(origem.cartoes) ? origem.cartoes.filter(cartao => typeof cartao === 'string') : [],
        pessoas: Array.isArray(origem.pessoas) ? origem.pessoas.filter(pessoa => typeof pessoa === 'string') : [],
        despesas: Array.isArray(origem.despesas) ? origem.despesas.filter(despesa => despesa && typeof despesa === 'object') : [],
        cartoes_config: Array.isArray(origem.cartoes_config) ? origem.cartoes_config.filter(config => config && typeof config === 'object') : []
    };
}

function diferencaMeses(mesInicio, mesReferencia) {
    if (!/^\d{4}-\d{2}$/.test(mesInicio || '') || !/^\d{4}-\d{2}$/.test(mesReferencia || '')) return null;
    const [anoInicio, numeroMesInicio] = mesInicio.split('-').map(Number);
    const [anoReferencia, numeroMesReferencia] = mesReferencia.split('-').map(Number);
    if (numeroMesInicio < 1 || numeroMesInicio > 12 || numeroMesReferencia < 1 || numeroMesReferencia > 12) return null;
    return (anoReferencia - anoInicio) * 12 + numeroMesReferencia - numeroMesInicio;
}

function obterParcelaNoMes(parte, mesReferencia) {
    const mesesPassados = diferencaMeses(parte.mes_inicio, mesReferencia);
    const parcelas = Number(parte.parcelas);
    const valorTotal = Number(parte.valor_total);
    if (mesesPassados === null || !Number.isInteger(parcelas) || parcelas < 1 || !Number.isFinite(valorTotal) || valorTotal <= 0) return null;
    if (mesesPassados < 0 || mesesPassados >= parcelas) return null;
    return { numero: mesesPassados + 1, quantidade: parcelas, valor: valorTotal / parcelas };
}

function calcularResumoFinanceiro(itens, pessoaSelecionada, cartaoSelecionado, pessoas = [], cartoes = []) {
    const filtrados = itens.filter(({ despesa }) => {
        if (pessoaSelecionada && despesa.pessoa !== pessoaSelecionada) return false;
        if (!cartaoSelecionado) return true;
        return despesa.meio !== 'pix' && despesa.cartao === cartaoSelecionado;
    });
    const porPessoa = new Map(pessoas.map(pessoa => [pessoa, 0]));
    const porCartao = new Map(cartoes.map(cartao => [cartao, 0]));
    let totalCartoes = 0;
    let totalPix = 0;

    filtrados.forEach(({ despesa, parcela }) => {
        if (despesa.meio === 'pix') {
            totalPix += parcela.valor;
        } else {
            totalCartoes += parcela.valor;
            porCartao.set(despesa.cartao, (porCartao.get(despesa.cartao) || 0) + parcela.valor);
        }
        porPessoa.set(despesa.pessoa, (porPessoa.get(despesa.pessoa) || 0) + parcela.valor);
    });

    const ordenarTotais = totais => [...totais]
        .map(([nome, valor]) => ({ nome, valor }))
        .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));

    return {
        itens: filtrados,
        totalCartoes,
        totalPix,
        totalGeral: totalCartoes + totalPix,
        porPessoa: ordenarTotais(porPessoa),
        porCartao: ordenarTotais(porCartao)
    };
}

window.FinanceHelpers = { normalizarFinancas, diferencaMeses, obterParcelaNoMes, calcularResumoFinanceiro, verificarViradaDoMes };

function mesAtualLocal() {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function verificarViradaDoMes(mesHoje = mesAtualLocal()) {
    if (mesHoje === ultimoMesAutomatico) return false;
    ultimoMesAutomatico = mesHoje;
    const seletorMes = document.getElementById('mes-referencia');
    if (!seletorMes) return false;
    seletorMes.value = mesHoje;
    renderizarTudo();
    return true;
}

function escapar(valor) {
    return window.escaparHtml(valor);
}

function valorFormatado(valor) {
    return formatoMoeda.format(Number(valor) || 0);
}

function configuracaoCartao(nome) {
    return bancoFinancas.cartoes_config.find(config => config.nome === nome) || {};
}

async function carregarFinancas() {
    ultimoMesAutomatico = mesAtualLocal();
    document.getElementById('mes-referencia').value = ultimoMesAutomatico;
    try {
        const resposta = await fetch('/api/dados');
        if (!resposta.ok) throw new Error('Não foi possível carregar os dados financeiros.');
        const dados = await resposta.json();
        bancoFinancas = normalizarFinancas(dados.financas);
        renderizarTudo();
        adicionarPartePagamento();
    } catch (erro) {
        console.error('Erro ao carregar finanças:', erro);
        alert('Não foi possível carregar os dados financeiros.');
    }
}

async function salvarFinancas() {
    const respostaDados = await fetch('/api/dados');
    if (!respostaDados.ok) throw new Error('Não foi possível carregar os dados atuais.');
    const dados = await respostaDados.json();
    dados.financas = bancoFinancas;

    const respostaSalvar = await fetch('/api/dados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });
    if (!respostaSalvar.ok) throw new Error('Não foi possível salvar as finanças.');
    renderizarTudo();
}

function alternarAbaFinanceira(botao) {
    document.querySelectorAll('.finance-tab').forEach(item => {
        const ativo = item === botao;
        item.classList.toggle('active', ativo);
        item.setAttribute('aria-selected', String(ativo));
    });
    document.querySelectorAll('.finance-panel').forEach(painel => {
        painel.classList.toggle('active', painel.id === `painel-${botao.dataset.panel}`);
    });
}

function opcoesPessoas(valorSelecionado = '') {
    return '<option value="">Selecione...</option>' + bancoFinancas.pessoas.map(pessoa =>
        `<option value="${escapar(pessoa)}" ${pessoa === valorSelecionado ? 'selected' : ''}>${escapar(pessoa)}</option>`
    ).join('');
}

function opcoesCartoes(valorSelecionado = '') {
    return '<option value="">Selecione...</option>' + bancoFinancas.cartoes.map(cartao =>
        `<option value="${escapar(cartao)}" ${cartao === valorSelecionado ? 'selected' : ''}>${escapar(cartao)}</option>`
    ).join('');
}

function renderizarSelects() {
    const selectPessoa = document.getElementById('select-pessoa');
    const pessoaAtual = selectPessoa.value;
    selectPessoa.innerHTML = opcoesPessoas(pessoaAtual);

    const filtroPessoa = document.getElementById('filtro-pessoa');
    const valorPessoa = filtroPessoa.value;
    filtroPessoa.innerHTML = '<option value="">Todas</option>' + bancoFinancas.pessoas.map(pessoa =>
        `<option value="${escapar(pessoa)}" ${pessoa === valorPessoa ? 'selected' : ''}>${escapar(pessoa)}</option>`
    ).join('');

    const filtroCartao = document.getElementById('filtro-cartao');
    const valorCartao = filtroCartao.value;
    filtroCartao.innerHTML = '<option value="">Todos</option>' + bancoFinancas.cartoes.map(cartao =>
        `<option value="${escapar(cartao)}" ${cartao === valorCartao ? 'selected' : ''}>${escapar(cartao)}</option>`
    ).join('');

    const resumoFiltroPessoa = document.getElementById('resumo-filtro-pessoa');
    const resumoPessoaAtual = resumoFiltroPessoa.value;
    resumoFiltroPessoa.innerHTML = '<option value="">Todas as pessoas</option>' + bancoFinancas.pessoas.map(pessoa =>
        `<option value="${escapar(pessoa)}" ${pessoa === resumoPessoaAtual ? 'selected' : ''}>${escapar(pessoa)}</option>`
    ).join('');

    const resumoFiltroCartao = document.getElementById('resumo-filtro-cartao');
    const resumoCartaoAtual = resumoFiltroCartao.value;
    resumoFiltroCartao.innerHTML = '<option value="">Todos os cartões</option>' + bancoFinancas.cartoes.map(cartao =>
        `<option value="${escapar(cartao)}" ${cartao === resumoCartaoAtual ? 'selected' : ''}>${escapar(cartao)}</option>`
    ).join('');

    document.querySelectorAll('.payment-part').forEach(linha => {
        const select = linha.querySelector('.payment-card');
        const selecionado = select.value;
        select.innerHTML = opcoesCartoes(selecionado);
    });
}

function criarTabela(cabecalhos, linhas, mensagemVazia) {
    if (linhas.length === 0) return `<div class="empty-state">${escapar(mensagemVazia)}</div>`;
    return `<table class="finance-table"><thead><tr>${cabecalhos.map(titulo => `<th>${escapar(titulo)}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table>`;
}

function despesasDoMes() {
    const mesReferencia = document.getElementById('mes-referencia').value;
    return bancoFinancas.despesas.map((despesa, indice) => ({
        despesa,
        indice,
        parcela: obterParcelaNoMes(despesa, mesReferencia)
    })).filter(item => item.parcela);
}

function renderizarResumo() {
    const pessoa = document.getElementById('resumo-filtro-pessoa').value;
    const cartao = document.getElementById('resumo-filtro-cartao').value;
    const resumo = calcularResumoFinanceiro(despesasDoMes(), pessoa, cartao, bancoFinancas.pessoas, bancoFinancas.cartoes);
    document.getElementById('total-cartoes').textContent = valorFormatado(resumo.totalCartoes);
    document.getElementById('total-pix').textContent = valorFormatado(resumo.totalPix);
    document.getElementById('total-mes').textContent = valorFormatado(resumo.totalGeral);

    const mes = document.getElementById('mes-referencia').value;
    const pessoaLabel = pessoa ? ` · ${pessoa}` : '';
    const cartaoLabel = cartao ? ` · ${cartao}` : '';
    document.getElementById('contexto-resumo').textContent = `Valores previstos para ${mes}${pessoaLabel}${cartaoLabel}${!pessoa && !cartao ? ' · visão completa do mês' : ''}`;

    const linhas = resumo.itens.map(({ despesa, parcela }) => {
        const meio = despesa.meio === 'pix' ? 'Pix' : `Cartão · ${escapar(despesa.cartao || 'Não informado')}`;
        return `<tr><td>${escapar(despesa.descricao)}</td><td>${escapar(despesa.pessoa)}</td><td>${meio}</td><td>${parcela.numero}/${parcela.quantidade}</td><td class="amount">${valorFormatado(parcela.valor)}</td></tr>`;
    });
    document.getElementById('resumo-lancamentos').innerHTML = criarTabela(['Compra', 'Pessoa', 'Pagamento', 'Parcela', 'Valor'], linhas, 'Nenhum lançamento corresponde aos filtros neste mês.');

    const linhasPessoa = resumo.porPessoa.map(({ nome, valor }) =>
        `<tr><td>${escapar(nome)}</td><td class="amount">${valorFormatado(valor)}</td></tr>`
    );
    document.getElementById('resumo-pessoas').innerHTML = criarTabela(['Pessoa', 'Total previsto'], linhasPessoa, 'Nenhum pagamento corresponde aos filtros.');

    const linhasCartao = resumo.porCartao.map(({ nome, valor }) => {
        const config = configuracaoCartao(nome);
        const datas = config.dia_fechamento && config.dia_vencimento
            ? `<div class="muted">Fecha dia ${Number(config.dia_fechamento)} · vence dia ${Number(config.dia_vencimento)}</div>`
            : '<div class="muted">Configure fechamento e vencimento</div>';
        return `<tr><td>${escapar(nome)}${datas}</td><td class="amount">${valorFormatado(valor)}</td></tr>`;
    });
    document.getElementById('resumo-cartoes').innerHTML = criarTabela(['Cartão', 'Total previsto'], linhasCartao, 'Nenhuma fatura de cartão corresponde aos filtros.');
}

function renderizarCompras() {
    const filtroPessoa = document.getElementById('filtro-pessoa').value;
    const filtroCartao = document.getElementById('filtro-cartao').value;
    const itens = despesasDoMes().filter(({ despesa }) => {
        if (filtroPessoa && despesa.pessoa !== filtroPessoa) return false;
        if (filtroCartao && despesa.cartao !== filtroCartao) return false;
        return true;
    });
    const linhas = itens.map(({ despesa, indice, parcela }) => {
        const meio = despesa.meio === 'pix' ? 'Pix' : `💳 ${escapar(despesa.cartao || 'Cartão não definido')}`;
        const inicial = Number(despesa.valor_total);
        const total = Number.isFinite(inicial) ? valorFormatado(inicial) : 'Valor inválido';
        return `<tr><td><strong>${escapar(despesa.descricao)}</strong><div class="muted">${escapar(despesa.pessoa)}</div></td><td>${meio}</td><td>${parcela.numero}/${parcela.quantidade}<div class="muted">Começou em ${escapar(despesa.mes_inicio)}</div></td><td class="amount">${valorFormatado(parcela.valor)}<div class="muted">de ${total}</div></td><td><button type="button" class="finance-button danger remove-part" data-index="${indice}" aria-label="Remover esta parte">Remover</button></td></tr>`;
    });
    document.getElementById('lista-compras').innerHTML = criarTabela(['Compra', 'Meio', 'Parcela', 'Este mês', ''], linhas, 'Nenhuma parcela ativa neste mês.');
    document.querySelectorAll('.remove-part').forEach(botao => botao.addEventListener('click', () => removerPartePagamento(Number(botao.dataset.index))));
}

function renderizarPix() {
    const itens = despesasDoMes().filter(({ despesa }) => despesa.meio === 'pix');
    const linhas = itens.map(({ despesa, indice, parcela }) =>
        `<tr><td>${escapar(despesa.descricao)}<div class="muted">${escapar(despesa.pessoa)}</div></td><td>${parcela.numero}/${parcela.quantidade}</td><td class="amount">${valorFormatado(parcela.valor)}</td><td><button type="button" class="finance-button danger remove-pix" data-index="${indice}">Remover</button></td></tr>`
    );
    document.getElementById('lista-pix').innerHTML = criarTabela(['Pagamento', 'Parcela', 'Valor do mês', ''], linhas, 'Nenhum pagamento Pix neste mês.');
    document.querySelectorAll('.remove-pix').forEach(botao => botao.addEventListener('click', () => removerPartePagamento(Number(botao.dataset.index))));
}

function renderizarCartoesEPessoas() {
    const containerCartoes = document.getElementById('configuracao-cartoes');
    if (bancoFinancas.cartoes.length === 0) {
        containerCartoes.innerHTML = '<div class="empty-state">Adicione seu primeiro cartão para definir os dias da fatura.</div>';
    } else {
        containerCartoes.innerHTML = bancoFinancas.cartoes.map((cartao, indice) => {
            const config = configuracaoCartao(cartao);
            return `<div class="card-settings" data-index="${indice}">
                <div class="finance-field card-name"><label>Cartão</label><strong>${escapar(cartao)}</strong></div>
                <div class="finance-field"><label>Fecha no dia</label><input class="closing-day" type="number" min="1" max="31" value="${escapar(config.dia_fechamento || '')}" placeholder="1 a 31"></div>
                <div class="finance-field"><label>Vence no dia</label><input class="due-day" type="number" min="1" max="31" value="${escapar(config.dia_vencimento || '')}" placeholder="1 a 31"></div>
                <div class="finance-actions"><button type="button" class="finance-button save-card" data-index="${indice}">Salvar</button><button type="button" class="finance-button danger delete-card" data-index="${indice}">Remover</button></div>
            </div>`;
        }).join('');
    }

    const listaPessoas = document.getElementById('lista-pessoas');
    listaPessoas.innerHTML = bancoFinancas.pessoas.length
        ? bancoFinancas.pessoas.map((pessoa, indice) => `<div class="card-settings"><div class="card-name">${escapar(pessoa)}</div><button type="button" class="finance-button danger delete-person" data-index="${indice}">Remover</button></div>`).join('')
        : '<div class="empty-state">Nenhuma pessoa cadastrada.</div>';

    document.querySelectorAll('.save-card').forEach(botao => botao.addEventListener('click', () => salvarConfiguracaoCartao(Number(botao.dataset.index))));
    document.querySelectorAll('.delete-card').forEach(botao => botao.addEventListener('click', () => removerCartao(Number(botao.dataset.index))));
    document.querySelectorAll('.delete-person').forEach(botao => botao.addEventListener('click', () => removerPessoa(Number(botao.dataset.index))));
}

function renderizarTudo() {
    renderizarSelects();
    renderizarResumo();
    renderizarCompras();
    renderizarPix();
    renderizarCartoesEPessoas();
}

function adicionarPartePagamento() {
    const container = document.getElementById('partes-pagamento');
    const numero = container.querySelectorAll('.payment-part').length + 1;
    const parte = document.createElement('div');
    parte.className = 'payment-part';
    parte.innerHTML = `<div class="payment-part-head"><span>Parte ${numero}</span><button type="button" class="finance-button danger remove-draft-part" aria-label="Remover parte">Remover</button></div>
        <div class="payment-part-fields">
            <div class="finance-field"><label>Meio de pagamento</label><select class="payment-method"><option value="cartao">Cartão</option><option value="pix">Pix</option></select></div>
            <div class="finance-field card-field"><label>Cartão</label><select class="payment-card">${opcoesCartoes()}</select></div>
            <div class="finance-field"><label>Valor desta parte (R$)</label><input class="payment-amount" type="number" min="0.01" step="0.01" required placeholder="0,00"></div>
            <div class="finance-field"><label>Quantidade de parcelas</label><input class="payment-installments" type="number" min="1" step="1" value="1" required></div>
            <div class="finance-field"><label class="start-month-label">Mês da primeira parcela</label><input class="payment-start-month" type="month" value="${mesAtualLocal()}" required></div>
        </div>`;
    container.appendChild(parte);
    parte.querySelector('.payment-method').addEventListener('change', evento => {
        const pix = evento.currentTarget.value === 'pix';
        parte.querySelector('.card-field').hidden = pix;
        parte.querySelector('.payment-card').required = !pix;
        parte.querySelector('.start-month-label').textContent = pix ? 'Mês do primeiro pagamento' : 'Mês da primeira parcela';
    });
    parte.querySelector('.remove-draft-part').addEventListener('click', () => {
        if (container.querySelectorAll('.payment-part').length > 1) parte.remove();
        else alert('A compra precisa ter pelo menos uma forma de pagamento.');
        atualizarRotulosPartes();
    });
    atualizarRotulosPartes();
}

function atualizarRotulosPartes() {
    document.querySelectorAll('#partes-pagamento .payment-part-head span').forEach((rotulo, indice) => {
        rotulo.textContent = `Parte ${indice + 1}`;
    });
}

async function salvarCompra(evento) {
    evento.preventDefault();
    const descricao = document.getElementById('desc-despesa').value.trim();
    const pessoa = document.getElementById('select-pessoa').value;
    const linhas = [...document.querySelectorAll('#partes-pagamento .payment-part')];

    if (!descricao || !pessoa || linhas.length === 0) {
        alert('Informe a compra, a pessoa responsável e pelo menos uma forma de pagamento.');
        return;
    }

    const partes = [];
    for (const linha of linhas) {
        const meio = linha.querySelector('.payment-method').value;
        const cartao = meio === 'cartao' ? linha.querySelector('.payment-card').value : '';
        const valor = Number(linha.querySelector('.payment-amount').value);
        const parcelas = Number(linha.querySelector('.payment-installments').value);
        const mesInicio = linha.querySelector('.payment-start-month').value;
        if (!Number.isFinite(valor) || valor <= 0 || !Number.isInteger(parcelas) || parcelas < 1 || !/^\d{4}-\d{2}$/.test(mesInicio) || (meio === 'cartao' && !cartao)) {
            alert('Revise o meio de pagamento, o cartão, o valor, as parcelas e o mês inicial de cada parte.');
            return;
        }
        partes.push({ compra_id: gerarIdCompra(), descricao, pessoa, meio, cartao, valor_total: valor, parcelas, mes_inicio: mesInicio });
    }

    const compraId = gerarIdCompra();
    partes.forEach(parte => { parte.compra_id = compraId; });
    bancoFinancas.despesas.push(...partes);

    try {
        await salvarFinancas();
        document.getElementById('form-compra').reset();
        document.getElementById('partes-pagamento').innerHTML = '';
        adicionarPartePagamento();
    } catch (erro) {
        bancoFinancas.despesas.splice(-partes.length, partes.length);
        console.error('Erro ao salvar compra:', erro);
        alert('Não foi possível salvar. Confira os dados e tente novamente.');
    }
}

function gerarIdCompra() {
    return window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function removerPartePagamento(indice) {
    if (!Number.isInteger(indice) || !bancoFinancas.despesas[indice]) return;
    if (!confirm('Remover esta parte do pagamento?')) return;
    const [removida] = bancoFinancas.despesas.splice(indice, 1);
    try {
        await salvarFinancas();
    } catch (erro) {
        bancoFinancas.despesas.splice(indice, 0, removida);
        console.error('Erro ao remover pagamento:', erro);
        alert('Não foi possível remover este pagamento.');
    }
}

async function salvarConfiguracaoCartao(indice) {
    const cartao = bancoFinancas.cartoes[indice];
    const linha = document.querySelector(`.card-settings[data-index="${indice}"]`);
    const fechamento = Number(linha.querySelector('.closing-day').value);
    const vencimento = Number(linha.querySelector('.due-day').value);
    if (!Number.isInteger(fechamento) || fechamento < 1 || fechamento > 31 || !Number.isInteger(vencimento) || vencimento < 1 || vencimento > 31) {
        alert('Informe dias de fechamento e vencimento entre 1 e 31.');
        return;
    }
    const configuracaoAnterior = configuracaoCartao(cartao);
    bancoFinancas.cartoes_config = bancoFinancas.cartoes_config.filter(config => config.nome !== cartao);
    bancoFinancas.cartoes_config.push({ nome: cartao, dia_fechamento: fechamento, dia_vencimento: vencimento });
    try {
        await salvarFinancas();
    } catch (erro) {
        bancoFinancas.cartoes_config = bancoFinancas.cartoes_config.filter(config => config.nome !== cartao);
        if (configuracaoAnterior.nome) bancoFinancas.cartoes_config.push(configuracaoAnterior);
        console.error('Erro ao salvar cartão:', erro);
        alert('Não foi possível salvar a configuração do cartão.');
    }
}

async function adicionarCartao(evento) {
    evento.preventDefault();
    const input = document.getElementById('novo-cartao');
    const nome = input.value.trim();
    if (!nome) return;
    if (bancoFinancas.cartoes.some(cartao => cartao.toLocaleLowerCase() === nome.toLocaleLowerCase())) {
        alert('Esse cartão já está cadastrado.');
        return;
    }
    bancoFinancas.cartoes.push(nome);
    input.value = '';
    try {
        await salvarFinancas();
    } catch (erro) {
        bancoFinancas.cartoes.pop();
        console.error('Erro ao adicionar cartão:', erro);
        alert('Não foi possível adicionar o cartão.');
    }
}

async function removerCartao(indice) {
    const cartao = bancoFinancas.cartoes[indice];
    if (!cartao || !confirm('Remover este cartão do cadastro? Os lançamentos existentes serão mantidos.')) return;
    const configuracoes = bancoFinancas.cartoes_config;
    bancoFinancas.cartoes.splice(indice, 1);
    bancoFinancas.cartoes_config = configuracoes.filter(config => config.nome !== cartao);
    try {
        await salvarFinancas();
    } catch (erro) {
        bancoFinancas.cartoes.splice(indice, 0, cartao);
        bancoFinancas.cartoes_config = configuracoes;
        console.error('Erro ao remover cartão:', erro);
        alert('Não foi possível remover o cartão.');
    }
}

async function adicionarPessoa(evento) {
    evento.preventDefault();
    const input = document.getElementById('nova-pessoa');
    const nome = input.value.trim();
    if (!nome) return;
    if (bancoFinancas.pessoas.some(pessoa => pessoa.toLocaleLowerCase() === nome.toLocaleLowerCase())) {
        alert('Essa pessoa já está cadastrada.');
        return;
    }
    bancoFinancas.pessoas.push(nome);
    input.value = '';
    try {
        await salvarFinancas();
    } catch (erro) {
        bancoFinancas.pessoas.pop();
        console.error('Erro ao adicionar pessoa:', erro);
        alert('Não foi possível adicionar a pessoa.');
    }
}

async function removerPessoa(indice) {
    const pessoa = bancoFinancas.pessoas[indice];
    if (!pessoa || !confirm('Remover esta pessoa do cadastro? Os lançamentos existentes serão mantidos.')) return;
    bancoFinancas.pessoas.splice(indice, 1);
    try {
        await salvarFinancas();
    } catch (erro) {
        bancoFinancas.pessoas.splice(indice, 0, pessoa);
        console.error('Erro ao remover pessoa:', erro);
        alert('Não foi possível remover a pessoa.');
    }
}

function configurarEventosFinancas() {
    document.querySelectorAll('.finance-tab').forEach(botao => botao.addEventListener('click', () => alternarAbaFinanceira(botao)));
    document.getElementById('mes-referencia').addEventListener('change', renderizarTudo);
    document.getElementById('resumo-filtro-pessoa').addEventListener('change', renderizarResumo);
    document.getElementById('resumo-filtro-cartao').addEventListener('change', renderizarResumo);
    document.getElementById('limpar-filtros-resumo').addEventListener('click', () => {
        document.getElementById('resumo-filtro-pessoa').value = '';
        document.getElementById('resumo-filtro-cartao').value = '';
        renderizarResumo();
    });
    document.getElementById('filtro-pessoa').addEventListener('change', renderizarCompras);
    document.getElementById('filtro-cartao').addEventListener('change', renderizarCompras);
    document.getElementById('adicionar-parte').addEventListener('click', adicionarPartePagamento);
    document.getElementById('form-compra').addEventListener('submit', salvarCompra);
    document.getElementById('form-cartao').addEventListener('submit', adicionarCartao);
    document.getElementById('form-pessoa').addEventListener('submit', adicionarPessoa);
}

document.addEventListener('DOMContentLoaded', () => {
    configurarEventosFinancas();
    carregarFinancas();
    window.setInterval(verificarViradaDoMes, 60000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) verificarViradaDoMes();
    });
});