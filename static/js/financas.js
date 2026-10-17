let bancoFinancas = { cartoes: [], pessoas: [], despesas: [], receitas: [], categorias: ['Outros'], cartoes_config: [] };
let ultimoMesAutomatico = '';

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function mesAtualLocal() {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function dataAtualLocal() {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}

function dataCompraValida(valor) {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return '';
    const data = new Date(`${valor}T00:00:00`);
    const canonica = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    return canonica === valor ? valor : '';
}

function alternarAbaFinanceira(botao) {
    if (!botao || !botao.dataset || !botao.dataset.panel) return;
    const painelAlvoId = `painel-${botao.dataset.panel}`;

    document.querySelectorAll('.finance-tab').forEach(item => {
        const ativo = (item === botao);
        item.classList.toggle('active', ativo);
        item.setAttribute('aria-selected', String(ativo));
    });

    document.querySelectorAll('.finance-panel').forEach(painel => {
        const ativo = (painel.id === painelAlvoId);
        painel.classList.toggle('active', ativo);
        painel.style.display = ativo ? 'block' : 'none';
    });
}

document.addEventListener('click', (evento) => {
    const botaoTab = evento.target.closest('.finance-tab');
    if (botaoTab) {
        evento.preventDefault();
        alternarAbaFinanceira(botaoTab);
    }
});

function inicializarControlesFinanceiros() {
    try {
        const mes = document.getElementById('mes-referencia');
        const dataAnalise = document.getElementById('data-analise-financeira');
        const dataCompra = document.getElementById('data-compra');
        const dataCompraRapida = document.getElementById('rapido-data-compra');
        if (mes && !mes.value) {
            mes.value = mesAtualLocal();
        }
        if (dataAnalise && !dataAnalise.value) dataAnalise.value = dataAtualLocal();
        if (dataCompra && !dataCompra.value) dataCompra.value = dataAtualLocal();
        if (dataCompraRapida && !dataCompraRapida.value) dataCompraRapida.value = dataAtualLocal();
    } catch (erro) {
        console.error('Erro ao inicializar campo de mês:', erro);
    }
}

function normalizarFinancas(financas) {
    try {
        const origem = financas && typeof financas === 'object' && !Array.isArray(financas) ? financas : {};
        const categorias = Array.isArray(origem.categorias) ? origem.categorias.filter(item => typeof item === 'string' && item.trim()) : [];
        if (!categorias.includes('Outros')) categorias.push('Outros');
        const despesasOriginais = Array.isArray(origem.despesas) ? origem.despesas : [];
        const despesas = despesasOriginais.filter(item => item && typeof item === 'object').map((item, indice) => {
            const forma = ['pix_debito', 'pix_credito', 'cartao_credito', 'va', 'vr', 'dinheiro'].includes(item.forma_pagamento)
                ? item.forma_pagamento
                : item.meio === 'pix' ? (item.credito || item.pix_credito ? 'pix_credito' : 'pix_debito')
                    : item.meio === 'cartao' || item.cartao ? 'cartao_credito' : 'dinheiro';
            const titular = item.titular_despesa || item.pessoa || 'Minha Despesa';
            const pessoa = item.pessoa || '';
            const origemCartaoConta = item.origem_cartao_conta || '';
            const cartao = item.cartao || (forma === 'pix_credito' ? origemCartaoConta : '');
            return { 
                ...item, 
                tipo: 'Despesa', 
                descricao: item.descricao || 'Sem descrição', 
                categoria: item.categoria || 'Outros', 
                titular_despesa: titular, 
                pessoa, 
                forma_pagamento: forma, 
                meio: forma.startsWith('pix_') ? 'pix' : forma === 'cartao_credito' ? 'cartao' : forma, 
                cartao, 
                origem_cartao_conta: origemCartaoConta || cartao, 
                valor_total: Number(item.valor_total ?? item.valor), 
                parcelas: Number(item.parcelas), 
                compra_id: item.compra_id || item.id || `legado-despesa-${indice}`,
                data_compra: dataCompraValida(item.data_compra)
            };
        });
        return {
            ...origem,
            cartoes: Array.isArray(origem.cartoes) ? origem.cartoes.filter(cartao => typeof cartao === 'string') : [],
            pessoas: Array.isArray(origem.pessoas) ? origem.pessoas.filter(pessoa => typeof pessoa === 'string') : [],
            despesas,
            receitas: Array.isArray(origem.receitas) ? origem.receitas.filter(item => item && typeof item === 'object').map((item, indice) => ({ 
                ...item, 
                id: item.id || `legado-receita-${indice}`, 
                tipo: 'Receita', 
                valor: Number(item.valor ?? item.valor_total), 
                categoria: item.categoria || 'Outros', 
                mes_referencia: item.mes_referencia || item.mes_inicio || '' 
            })) : [],
            categorias: [...new Set(categorias)],
            cartoes_config: Array.isArray(origem.cartoes_config) ? origem.cartoes_config.filter(config => config && typeof config === 'object').map(config => ({ ...config, titular: config.titular || 'Minha Despesa' })) : []
        };
    } catch (erro) {
        console.error('Erro ao normalizar finanças:', erro);
        return { cartoes: [], pessoas: [], despesas: [], receitas: [], categorias: ['Outros'], cartoes_config: [] };
    }
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
        if (pessoaSelecionada && despesa.titular_despesa !== pessoaSelecionada && despesa.pessoa !== pessoaSelecionada) return false;
        if (!cartaoSelecionado) return true;
        return ['cartao_credito', 'pix_credito'].includes(despesa.forma_pagamento) && despesa.cartao === cartaoSelecionado;
    });
    const porPessoa = new Map(pessoas.map(pessoa => [pessoa, 0]));
    const porCartao = new Map(cartoes.map(cartao => [cartao, 0]));
    let totalCartoes = 0, totalPix = 0, totalVa = 0, totalVr = 0, totalDinheiro = 0;

    filtrados.forEach(({ despesa, parcela }) => {
        if (['cartao_credito', 'pix_credito'].includes(despesa.forma_pagamento)) {
            totalCartoes += parcela.valor;
            porCartao.set(despesa.cartao, (porCartao.get(despesa.cartao) || 0) + parcela.valor);
        } else if (despesa.forma_pagamento === 'pix_debito') totalPix += parcela.valor;
        else if (despesa.forma_pagamento === 'va') totalVa += parcela.valor;
        else if (despesa.forma_pagamento === 'vr') totalVr += parcela.valor;
        else if (despesa.forma_pagamento === 'dinheiro') totalDinheiro += parcela.valor;
        const titular = despesa.titular_despesa || despesa.pessoa;
        porPessoa.set(titular, (porPessoa.get(titular) || 0) + parcela.valor);
    });

    const ordenarTotais = totais => [...totais]
        .map(([nome, valor]) => ({ nome, valor }))
        .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));

    return {
        itens: filtrados,
        totalCartoes,
        totalPix,
        totalVa,
        totalVr,
        totalDinheiro,
        totalGeral: totalCartoes + totalPix + totalVa + totalVr + totalDinheiro,
        porPessoa: ordenarTotais(porPessoa),
        porCartao: ordenarTotais(porCartao)
    };
}

function escapar(valor) {
    try {
        return typeof window.escaparHtml === 'function' ? window.escaparHtml(valor ?? '') : String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    } catch (erro) {
        return '';
    }
}

function valorFormatado(valor) {
    return formatoMoeda.format(Number(valor) || 0);
}

function configuracaoCartao(nome) {
    return (Array.isArray(bancoFinancas.cartoes_config) ? bancoFinancas.cartoes_config : []).find(config => config && config.nome === nome) || {};
}

async function carregarFinancas() {
    try {
        ultimoMesAutomatico = mesAtualLocal();
        const seletorMes = document.getElementById('mes-referencia');
        if (seletorMes && !seletorMes.value) seletorMes.value = ultimoMesAutomatico;
        
        const resposta = await fetch('/api/dados');
        if (!resposta.ok) throw new Error('Falha ao carregar dados financeiros.');
        const dados = await resposta.json();
        bancoFinancas = normalizarFinancas((dados && dados.financas) || {});
        renderizarTudo();
        adicionarPartePagamento();
    } catch (erro) {
        console.error('Erro ao carregar finanças:', erro);
        bancoFinancas = normalizarFinancas(null);
        try { renderizarTudo(); } catch (e) {}
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

function opcoesPessoas(valorSelecionado = '') {
    const pessoas = Array.isArray(bancoFinancas.pessoas) ? bancoFinancas.pessoas : [];
    return '<option value="">Selecione...</option>' + pessoas.map(p => `<option value="${escapar(p)}" ${p === valorSelecionado ? 'selected' : ''}>${escapar(p)}</option>`).join('');
}

function opcoesCartoes(valorSelecionado = '') {
    const cartoes = Array.isArray(bancoFinancas.cartoes) ? bancoFinancas.cartoes : [];
    return '<option value="">Selecione...</option>' + cartoes.map(c => `<option value="${escapar(c)}" ${c === valorSelecionado ? 'selected' : ''}>${escapar(c)}</option>`).join('');
}

function criarTabela(cabecalhos, linhas, mensagemVazia) {
    if (linhas.length === 0) return `<div class="empty-state">${escapar(mensagemVazia)}</div>`;
    return `<table class="finance-table"><thead><tr>${cabecalhos.map(t => `<th>${escapar(t)}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table>`;
}

function despesasDoMes() {
    try {
        const seletorMes = document.getElementById('mes-referencia');
        const mesReferencia = (seletorMes && seletorMes.value) ? seletorMes.value : mesAtualLocal();
        const despesas = Array.isArray(bancoFinancas.despesas) ? bancoFinancas.despesas : [];
        return despesas.map((despesa, indice) => ({ despesa, indice, parcela: obterParcelaNoMes(despesa || {}, mesReferencia) })).filter(item => item.parcela);
    } catch (erro) {
        console.error('Erro ao calcular despesas do mês:', erro);
        return [];
    }
}

function renderizarResumo() {
    const campoPessoa = document.getElementById('resumo-filtro-pessoa');
    const campoCartao = document.getElementById('resumo-filtro-cartao');
    const pessoa = campoPessoa ? campoPessoa.value : '';
    const cartao = campoCartao ? campoCartao.value : '';
    const resumo = calcularResumoFinanceiro(selecionarDespesasFinanceiras(), pessoa, cartao, bancoFinancas.pessoas, bancoFinancas.cartoes);
    
    [['total-cartoes', resumo.totalCartoes], ['total-pix', resumo.totalPix], ['total-mes', resumo.totalGeral]].forEach(([id, valor]) => {
        const campo = document.getElementById(id); if (campo) campo.textContent = valorFormatado(valor);
    });

    const campoMes = document.getElementById('mes-referencia');
    const mes = (campoMes && campoMes.value) ? campoMes.value : mesAtualLocal();
    const contexto = document.getElementById('contexto-resumo');
    const intervalo = intervaloAnalise();
    const rotulo = intervalo.periodo === 'dia' ? `dia ${intervalo.inicio}` : intervalo.periodo === 'semana' ? `semana de ${intervalo.inicio} a ${intervalo.fim}` : `mês ${intervalo.mes}`;
    if (contexto) contexto.textContent = `Valores previstos para ${rotulo}${pessoa ? ` · ${pessoa}` : ''}${cartao ? ` · ${cartao}` : ''}${!pessoa && !cartao ? ' · visão completa' : ''}`;
    const periodoSelecionado = document.getElementById('periodo-selecionado-resumo');
    if (periodoSelecionado) periodoSelecionado.textContent = `Período selecionado: ${rotulo}`;

    const linhas = resumo.itens.map(({ despesa, parcela }) => `<tr><td>${escapar(despesa.descricao)}</td><td>${escapar(despesa.data_compra || 'Data não informada')}</td><td>${escapar(despesa.pessoa)}</td><td>${etiquetaFormaPagamento(despesa)}</td><td>${parcela.numero}/${parcela.quantidade}</td><td class="amount">${valorFormatado(parcela.valor)}</td></tr>`);
    const lancamentos = document.getElementById('resumo-lancamentos');
    if (lancamentos) lancamentos.innerHTML = criarTabela(['Compra', 'Data da compra', 'Pessoa', 'Pagamento', 'Parcela', 'Valor'], linhas, 'Nenhum lançamento corresponde aos filtros no período selecionado.');

    const linhasPessoa = resumo.porPessoa.map(({ nome, valor }) => `<tr><td>${escapar(nome)}</td><td class="amount">${valorFormatado(valor)}</td></tr>`);
    const pessoas = document.getElementById('resumo-pessoas');
    if (pessoas) pessoas.innerHTML = criarTabela(['Pessoa', 'Total previsto'], linhasPessoa, 'Nenhum pagamento corresponde aos filtros.');

    const linhasCartao = resumo.porCartao.map(({ nome, valor }) => {
        const config = configuracaoCartao(nome);
        const datas = config.dia_fechamento && config.dia_vencimento ? `<div class="muted">Fecha dia ${Number(config.dia_fechamento)} · vence dia ${Number(config.dia_vencimento)}</div>` : '<div class="muted">Configure fechamento e vencimento</div>';
        return `<tr><td>${escapar(nome)}${datas}</td><td class="amount">${valorFormatado(valor)}</td></tr>`;
    });
    const cartoes = document.getElementById('resumo-cartoes');
    if (cartoes) cartoes.innerHTML = criarTabela(['Cartão', 'Total previsto'], linhasCartao, 'Nenhuma fatura de cartão corresponde aos filtros.');
}

function renderizarCompras() {
    const campoPessoa = document.getElementById('filtro-pessoa');
    const campoCartao = document.getElementById('filtro-cartao');
    const filtroPessoa = campoPessoa ? campoPessoa.value : '';
    const filtroCartao = campoCartao ? campoCartao.value : '';
    const itens = selecionarDespesasFinanceiras().filter(({ despesa }) => {
        if (filtroPessoa && despesa.pessoa !== filtroPessoa) return false;
        if (filtroCartao && despesa.cartao !== filtroCartao) return false;
        return true;
    });
    const linhas = itens.map(({ despesa, indice, parcela }) => {
        const meio = etiquetaFormaPagamento(despesa);
        const inicial = Number(despesa.valor_total);
        const total = Number.isFinite(inicial) ? valorFormatado(inicial) : 'Valor inválido';
        return `<tr><td><strong>${escapar(despesa.descricao)}</strong><div class="muted">${escapar(despesa.pessoa)}</div></td><td>${escapar(despesa.data_compra || 'Data não informada')}</td><td>${meio}</td><td>${parcela.numero}/${parcela.quantidade}<div class="muted">Começou em ${escapar(despesa.mes_inicio)}</div></td><td class="amount">${valorFormatado(parcela.valor)}<div class="muted">de ${total}</div></td><td><button type="button" class="finance-button danger remove-part" data-index="${indice}">Remover</button></td></tr>`;
    });
    const lista = document.getElementById('lista-compras');
    if (lista) {
        lista.innerHTML = criarTabela(['Compra', 'Data da compra', 'Meio', 'Parcela', 'Este mês', ''], linhas, 'Nenhuma parcela ativa no período selecionado.');
        lista.querySelectorAll('.remove-part').forEach(b => b.addEventListener('click', () => removerPartePagamento(Number(b.dataset.index))));
    }
}

function renderizarPix() {
    const itens = selecionarDespesasFinanceiras().filter(({ despesa }) => ['pix_debito', 'pix_credito'].includes(despesa.forma_pagamento));
    const linhas = itens.map(({ despesa, indice, parcela }) => `<tr><td>${escapar(despesa.descricao)}<div class="muted">${escapar(despesa.pessoa)}</div></td><td>${escapar(despesa.data_compra || 'Data não informada')}</td><td>${etiquetaFormaPagamento(despesa)}</td><td>${parcela.numero}/${parcela.quantidade}</td><td class="amount">${valorFormatado(parcela.valor)}</td><td><button type="button" class="finance-button danger remove-pix" data-index="${indice}">Remover</button></td></tr>`);
    const lista = document.getElementById('lista-pix');
    if (lista) {
        lista.innerHTML = criarTabela(['Pagamento', 'Data da compra', 'Forma', 'Parcela', 'Valor do mês', ''], linhas, 'Nenhum pagamento Pix no período selecionado.');
        lista.querySelectorAll('.remove-pix').forEach(b => b.addEventListener('click', () => removerPartePagamento(Number(b.dataset.index))));
    }
}

function etiquetaFormaPagamento(despesa) {
    const nomes = { pix_debito: 'Pix débito', pix_credito: 'Pix crédito', va: 'VA', vr: 'VR', dinheiro: 'Dinheiro' };
    if (despesa.forma_pagamento === 'cartao_credito') return `Cartão · ${escapar(despesa.cartao || 'Não informado')}`;
    if (despesa.forma_pagamento === 'pix_credito') return `Pix crédito · ${escapar(despesa.cartao || despesa.origem_cartao_conta || 'Não informado')}`;
    return nomes[despesa.forma_pagamento] || escapar(despesa.meio || 'Não informado');
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
        alert('Não foi possível remover este pagamento.');
    }
}

function opcoesCategoriasFinanceiras(valor = '') {
    const categorias = Array.isArray(bancoFinancas.categorias) ? bancoFinancas.categorias : [];
    return categorias.map(c => `<option value="${escapar(c)}" ${c === valor ? 'selected' : ''}>${escapar(c)}</option>`).join('');
}

function renderizarSelects() {
    const selectPessoa = document.getElementById('select-pessoa');
    if (selectPessoa) { const atual = selectPessoa.value; selectPessoa.innerHTML = opcoesPessoas(atual); selectPessoa.value = atual; }
    ['categoria-despesa', 'receita-categoria', 'rapido-categoria'].forEach(id => {
        const campo = document.getElementById(id); if (!campo) return;
        const atual = campo.value; campo.innerHTML = opcoesCategoriasFinanceiras(atual); campo.value = atual;
    });
    ['filtro-pessoa', 'resumo-filtro-pessoa'].forEach(id => {
        const campo = document.getElementById(id); if (!campo) return; const atual = campo.value;
        campo.innerHTML = `<option value="">${id === 'filtro-pessoa' ? 'Todas' : 'Todas as pessoas'}</option>` + bancoFinancas.pessoas.map(p => `<option value="${escapar(p)}">${escapar(p)}</option>`).join(''); campo.value = atual;
    });
    ['filtro-cartao', 'resumo-filtro-cartao'].forEach(id => {
        const campo = document.getElementById(id); if (!campo) return; const atual = campo.value;
        campo.innerHTML = `<option value="">${id === 'filtro-cartao' ? 'Todos' : 'Todos os cartões'}</option>` + bancoFinancas.cartoes.map(c => `<option value="${escapar(c)}">${escapar(c)}</option>`).join(''); campo.value = atual;
    });
    const rapidoCartao = document.getElementById('rapido-cartao');
    if (rapidoCartao) { const atual = rapidoCartao.value; rapidoCartao.innerHTML = opcoesCartoes(atual); rapidoCartao.value = atual; }
}

function renderizarDashboard() {
    const intervalo = intervaloAnalise();
    const mes = intervalo.mes;
    const itensCalculados = selecionarDespesasFinanceiras();
    const itens = Array.isArray(itensCalculados) ? itensCalculados.filter(item => item && item.despesa && item.parcela) : [];
    const receitas = Array.isArray(bancoFinancas.receitas) ? bancoFinancas.receitas : [];
    const entradas = receitas.filter(r => r && r.mes_referencia === mes).reduce((total, r) => total + Number(r.valor || 0), 0);
    const total = itens.reduce((soma, item) => soma + item.parcela.valor, 0);
    const fatura = itens.filter(item => ['cartao_credito', 'pix_credito'].includes(item.despesa.forma_pagamento)).reduce((soma, item) => soma + item.parcela.valor, 0);
    const pessoal = itens.filter(item => !/^Reembolsável\s*-\s*/i.test(item.despesa.titular_despesa)).reduce((soma, item) => soma + item.parcela.valor, 0);
    const porForma = forma => itens.filter(item => item.despesa.forma_pagamento === forma).reduce((soma, item) => soma + item.parcela.valor, 0);
    
    [['dashboard-entradas', entradas], ['dashboard-saldo', entradas - total], ['dashboard-fatura-banco', fatura], ['dashboard-gasto-pessoal', pessoal], ['dashboard-va', porForma('va')], ['dashboard-vr', porForma('vr')], ['dashboard-dinheiro', porForma('dinheiro')], ['dashboard-pix-debito', porForma('pix_debito')], ['dashboard-pix-credito', porForma('pix_credito')]].forEach(([id, valor]) => { 
        const campo = document.getElementById(id); if (campo) campo.textContent = valorFormatado(valor); 
    });

    const categorias = {}; itens.forEach(({ despesa, parcela }) => { const cat = despesa.categoria || 'Outros'; categorias[cat] = (categorias[cat] || 0) + (Number(parcela.valor) || 0); });
    const maior = Math.max(...Object.values(categorias), 1);
    const painelCategorias = document.getElementById('dashboard-categorias');
    if (painelCategorias) painelCategorias.innerHTML = Object.entries(categorias).map(([nome, valor]) => `<div class="category-bar"><span>${escapar(nome)}</span><progress max="${maior}" value="${valor}"></progress><strong>${valorFormatado(valor)}</strong></div>`).join('') || '<div class="muted">Nenhuma despesa no mês.</div>';
    
    const familiares = {}; itens.filter(({ despesa }) => /^Reembolsável\s*-\s*/i.test(despesa.titular_despesa)).forEach(({ despesa, parcela }) => { const nome = despesa.titular_despesa.replace(/^Reembolsável\s*-\s*/i, '').trim(); familiares[nome] = (familiares[nome] || 0) + parcela.valor; });
    const painelFamilia = document.getElementById('a-receber-familia');
    if (painelFamilia) painelFamilia.innerHTML = Object.entries(familiares).map(([nome, valor]) => `<div class="category-bar"><span>${escapar(nome)}</span><span></span><strong>${valorFormatado(valor)}</strong></div>`).join('') || '<div class="muted">Nenhum valor familiar a receber.</div>';

    const porDia = {};
    itens.forEach(({ despesa, parcela }) => { const data = dataCompraValida(despesa.data_compra); if (data) { if (!porDia[data]) porDia[data] = { quantidade: 0, total: 0 }; porDia[data].quantidade += 1; porDia[data].total += parcela.valor; } });
    const painelDias = document.getElementById('gastos-por-dia');
    const linhasDias = Object.entries(porDia).sort(([a], [b]) => a.localeCompare(b)).map(([data, dados]) => `<tr><td>${escapar(data)}</td><td>${dados.quantidade}</td><td class="amount">${valorFormatado(dados.total)}</td></tr>`);
    if (painelDias) painelDias.innerHTML = intervalo.periodo === 'mes' ? criarTabela(['Data', 'Lançamentos', 'Total'], linhasDias, 'Nenhuma compra com data informada neste mês.') : '<div class="muted">Gastos por dia disponível apenas na visão mensal.</div>';
}

function renderizarReceitas() {
    const campoMes = document.getElementById('mes-referencia');
    const mes = (campoMes && campoMes.value) ? campoMes.value : mesAtualLocal();
    const receitas = Array.isArray(bancoFinancas.receitas) ? bancoFinancas.receitas : [];
    const linhas = receitas.map((receita, indice) => receita && receita.mes_referencia === mes ? `<tr><td>${escapar(receita.descricao)}</td><td>${escapar(receita.categoria)}</td><td class="amount">${valorFormatado(receita.valor)}</td><td><button type="button" class="finance-button danger remove-receita" data-index="${indice}">Remover</button></td></tr>` : '').filter(Boolean);
    const lista = document.getElementById('lista-receitas');
    if (lista) {
        lista.innerHTML = criarTabela(['Descrição', 'Categoria', 'Valor', ''], linhas, 'Nenhuma receita no mês selecionado.');
        lista.querySelectorAll('.remove-receita').forEach(b => b.addEventListener('click', () => removerReceita(Number(b.dataset.index))));
    }
}

function renderizarCartoesEPessoas() {
    const cartoes = Array.isArray(bancoFinancas.cartoes) ? bancoFinancas.cartoes : [];
    const pessoas = Array.isArray(bancoFinancas.pessoas) ? bancoFinancas.pessoas : [];
    const container = document.getElementById('configuracao-cartoes');
    if (container) {
        container.innerHTML = cartoes.map((cartao, indice) => {
            const config = configuracaoCartao(cartao);
            return `<div class="card-settings" data-index="${indice}"><div class="finance-field card-name"><label>Cartão</label><strong>${escapar(cartao)}</strong></div><div class="finance-field"><label>Fecha no dia</label><input class="closing-day" type="number" min="1" max="31" value="${escapar(config.dia_fechamento || '')}"></div><div class="finance-field"><label>Vence no dia</label><input class="due-day" type="number" min="1" max="31" value="${escapar(config.dia_vencimento || '')}"></div><div class="finance-field"><label>Titular</label><input class="card-holder" value="${escapar(config.titular || '')}"></div><div class="finance-actions"><button type="button" class="finance-button save-card" data-index="${indice}">Salvar</button><button type="button" class="finance-button danger delete-card" data-index="${indice}">Remover</button></div></div>`;
        }).join('') || '<div class="empty-state">Adicione seu primeiro cartão.</div>';
    }
    const listaPessoas = document.getElementById('lista-pessoas');
    if (listaPessoas) listaPessoas.innerHTML = pessoas.map((pessoa, indice) => `<div class="card-settings"><div class="card-name">${escapar(pessoa)}</div><button type="button" class="finance-button danger delete-person" data-index="${indice}">Remover</button></div>`).join('') || '<div class="empty-state">Nenhuma pessoa cadastrada.</div>';
    
    document.querySelectorAll('.save-card').forEach(b => b.addEventListener('click', () => salvarConfiguracaoCartao(Number(b.dataset.index))));
    document.querySelectorAll('.delete-card').forEach(b => b.addEventListener('click', () => removerCartao(Number(b.dataset.index))));
    document.querySelectorAll('.delete-person').forEach(b => b.addEventListener('click', () => removerPessoa(Number(b.dataset.index))));
}

function renderizarTudo() {
    [renderizarSelects, renderizarDashboard, renderizarResumo, renderizarReceitas, renderizarCompras, renderizarPix, renderizarCartoesEPessoas].forEach(fn => {
        try { fn(); } catch (e) { console.error(`Erro em ${fn.name}:`, e); }
    });
}

function adicionarPartePagamento() {
    const container = document.getElementById('partes-pagamento');
    if (!container) return;
    const parte = document.createElement('div');
    parte.className = 'payment-part';
    parte.innerHTML = `<div class="payment-part-head"><span>Parte</span><button type="button" class="finance-button danger remove-draft-part">Remover</button></div><div class="payment-part-fields"><div class="finance-field"><label>Forma de pagamento</label><select class="payment-method"><option value="cartao_credito">Cartão de crédito</option><option value="pix_debito">Pix</option><option value="pix_credito">Pix Crédito</option><option value="va">VA</option><option value="vr">VR</option><option value="dinheiro">Dinheiro</option></select></div><div class="finance-field card-field"><label>Cartão</label><select class="payment-card">${opcoesCartoes()}</select></div><div class="finance-field"><label>Valor desta parte</label><input class="payment-amount" type="number" min="0.01" step="0.01" required></div><div class="finance-field"><label>Parcelas</label><input class="payment-installments" type="number" min="1" step="1" value="1" required></div><div class="finance-field"><label>Mês inicial</label><input class="payment-start-month" type="month" value="${mesAtualLocal()}" required></div></div>`;
    container.appendChild(parte);
    
    const metodo = parte.querySelector('.payment-method');
    const campoCartao = parte.querySelector('.card-field');
    const selectCartao = parte.querySelector('.payment-card');
    const atualizar = () => {
        if (!metodo || !campoCartao || !selectCartao) return;
        const exigeCartao = metodo.value === 'cartao_credito';
        campoCartao.hidden = !exigeCartao;
        selectCartao.required = exigeCartao;
    };
    if (metodo) metodo.addEventListener('change', atualizar);
    atualizar();
    
    const remover = parte.querySelector('.remove-draft-part');
    if (remover) remover.addEventListener('click', () => {
        if (container.children.length > 1) parte.remove();
        else alert('A compra precisa ter pelo menos uma forma de pagamento.');
    });
}

async function salvarCompra(evento) {
    evento.preventDefault(); 
    const descricao = document.getElementById('desc-despesa').value.trim(); 
    const pessoa = document.getElementById('select-pessoa').value; 
    const titular = document.getElementById('titular-despesa').value.trim() || pessoa || 'Minha Despesa'; 
    const categoria = document.getElementById('categoria-despesa').value || 'Outros'; 
    const dataCompra = dataCompraValida(document.getElementById('data-compra').value);
    const linhas = [...document.querySelectorAll('#partes-pagamento .payment-part')]; 
    const compraId = gerarIdCompra(); 
    const novas = [];
    
    if (!descricao || !linhas.length) return alert('Informe a descrição e uma forma de pagamento.');
    for (const linha of linhas) { 
        const forma = linha.querySelector('.payment-method').value; 
        const cartao = forma === 'cartao_credito' ? linha.querySelector('.payment-card').value : ''; 
        const valor = Number(linha.querySelector('.payment-amount').value); 
        const parcelas = Number(linha.querySelector('.payment-installments').value); 
        const mes = linha.querySelector('.payment-start-month').value; 
        if (valor <= 0 || !Number.isInteger(parcelas) || parcelas < 1 || !/^\d{4}-\d{2}$/.test(mes) || !dataCompra || (forma === 'cartao_credito' && !cartao)) return alert('Revise valor, parcelas, data da compra, mês, cartão e forma de pagamento.'); 
        novas.push({ compra_id: compraId, tipo: 'Despesa', descricao, pessoa, titular_despesa: titular, categoria, forma_pagamento: forma, meio: forma.startsWith('pix_') ? 'pix' : forma === 'cartao_credito' ? 'cartao' : forma, cartao, valor_total: valor, parcelas, mes_inicio: mes, data_compra: dataCompra }); 
    }
    bancoFinancas.despesas.push(...novas); 
    try { 
        await salvarFinancas(); 
        document.getElementById('form-compra').reset(); 
        document.getElementById('data-compra').value = dataAtualLocal();
        document.getElementById('partes-pagamento').innerHTML = ''; 
        adicionarPartePagamento(); 
    } catch (erro) { 
        bancoFinancas.despesas.splice(-novas.length, novas.length); 
        alert('Não foi possível salvar a compra.'); 
    }
}

async function adicionarReceita(evento) { 
    evento.preventDefault(); 
    const receita = { id: gerarIdCompra(), tipo: 'Receita', descricao: document.getElementById('receita-descricao').value.trim(), valor: Number(document.getElementById('receita-valor').value), mes_referencia: document.getElementById('receita-mes').value, categoria: document.getElementById('receita-categoria').value || 'Outros' }; 
    if (!receita.descricao || receita.valor <= 0 || !/^\d{4}-\d{2}$/.test(receita.mes_referencia)) return alert('Preencha descrição, valor e mês da receita.'); 
    bancoFinancas.receitas.push(receita); 
    try { await salvarFinancas(); evento.target.reset(); } catch (erro) { bancoFinancas.receitas.pop(); alert('Não foi possível salvar a receita.'); } 
}

async function adicionarCategoria(evento) { 
    evento.preventDefault(); 
    const input = document.getElementById('nova-categoria'); 
    const categoria = input.value.trim(); 
    if (!categoria || bancoFinancas.categorias.includes(categoria)) return; 
    bancoFinancas.categorias.push(categoria); 
    try { await salvarFinancas(); input.value = ''; } catch (erro) { bancoFinancas.categorias.pop(); alert('Não foi possível salvar a categoria.'); } 
}

async function removerReceita(indice) { 
    if (!confirm('Remover esta receita?')) return; 
    const removida = bancoFinancas.receitas.splice(indice, 1)[0]; 
    try { await salvarFinancas(); } catch (erro) { bancoFinancas.receitas.splice(indice, 0, removida); alert('Não foi possível remover a receita.'); } 
}

async function adicionarCartao(evento) {
    evento.preventDefault();
    const input = document.getElementById('novo-cartao');
    const campoTitular = document.getElementById('novo-cartao-titular');
    const nome = input.value.trim();
    const titular = campoTitular ? campoTitular.value.trim() || 'Minha Despesa' : 'Minha Despesa';
    if (!nome) return;
    if (bancoFinancas.cartoes.some(c => c.toLocaleLowerCase() === nome.toLocaleLowerCase())) return alert('Esse cartão já está cadastrado.');
    bancoFinancas.cartoes.push(nome);
    bancoFinancas.cartoes_config.push({ nome, titular });
    input.value = '';
    if (campoTitular) campoTitular.value = '';
    try { await salvarFinancas(); } catch (erro) { bancoFinancas.cartoes.pop(); bancoFinancas.cartoes_config.pop(); alert('Não foi possível adicionar o cartão.'); }
}

async function removerCartao(indice) {
    const cartao = bancoFinancas.cartoes[indice];
    if (!cartao || !confirm('Remover este cartão do cadastro?')) return;
    const configs = bancoFinancas.cartoes_config;
    bancoFinancas.cartoes.splice(indice, 1);
    bancoFinancas.cartoes_config = configs.filter(c => c.nome !== cartao);
    try { await salvarFinancas(); } catch (erro) { bancoFinancas.cartoes.splice(indice, 0, cartao); bancoFinancas.cartoes_config = configs; alert('Não foi possível remover o cartão.'); }
}

async function adicionarPessoa(evento) {
    evento.preventDefault();
    const input = document.getElementById('nova-pessoa');
    const nome = input.value.trim();
    if (!nome) return;
    if (bancoFinancas.pessoas.some(p => p.toLocaleLowerCase() === nome.toLocaleLowerCase())) return alert('Essa pessoa já está cadastrada.');
    bancoFinancas.pessoas.push(nome);
    input.value = '';
    try { await salvarFinancas(); } catch (erro) { bancoFinancas.pessoas.pop(); alert('Não foi possível adicionar a pessoa.'); }
}

async function removerPessoa(indice) {
    const pessoa = bancoFinancas.pessoas[indice];
    if (!pessoa || !confirm('Remover esta pessoa do cadastro?')) return;
    bancoFinancas.pessoas.splice(indice, 1);
    try { await salvarFinancas(); } catch (erro) { bancoFinancas.pessoas.splice(indice, 0, pessoa); alert('Não foi possível remover a pessoa.'); }
}

async function salvarConfiguracaoCartao(indice) {
    const nome = bancoFinancas.cartoes[indice]; 
    const linha = document.querySelector(`.card-settings[data-index="${indice}"]`); 
    if (!linha) return;
    const anterior = configuracaoCartao(nome); 
    const fechamento = Number(linha.querySelector('.closing-day').value); 
    const vencimento = Number(linha.querySelector('.due-day').value); 
    if (![fechamento, vencimento].every(v => Number.isInteger(v) && v >= 1 && v <= 31)) return alert('Informe dias entre 1 e 31.'); 
    bancoFinancas.cartoes_config = bancoFinancas.cartoes_config.filter(c => c.nome !== nome); 
    bancoFinancas.cartoes_config.push({ ...anterior, nome, titular: linha.querySelector('.card-holder').value.trim() || 'Minha Despesa', dia_fechamento: fechamento, dia_vencimento: vencimento }); 
    try { await salvarFinancas(); } catch (erro) { alert('Não foi possível salvar a configuração do cartão.'); }
}

function atualizarCampoCartaoRapido() { 
    const forma = document.getElementById('rapido-forma').value; 
    const exigeCartao = ['cartao_credito', 'pix_credito'].includes(forma); 
    const campo = document.getElementById('rapido-cartao-campo'); 
    const select = document.getElementById('rapido-cartao'); 
    if (campo) campo.hidden = !exigeCartao; 
    if (select) select.required = exigeCartao; 
}

async function salvarLancamentoRapido(evento) { 
    evento.preventDefault(); 
    const forma = document.getElementById('rapido-forma').value; 
    const origem = document.getElementById('rapido-cartao').value; 
    const despesa = { 
        compra_id: gerarIdCompra(), 
        tipo: 'Despesa', 
        descricao: document.getElementById('rapido-descricao').value.trim(), 
        valor_total: Number(document.getElementById('rapido-valor').value), 
        forma_pagamento: forma, 
        meio: forma.startsWith('pix_') ? 'pix' : forma === 'cartao_credito' ? 'cartao' : forma, 
        cartao: origem, 
        origem_cartao_conta: origem, 
        categoria: document.getElementById('rapido-categoria').value || 'Outros', 
        titular_despesa: document.getElementById('rapido-titular').value.trim() || 'Minha Despesa', 
        pessoa: document.getElementById('rapido-titular').value.trim() || 'Minha Despesa', 
        parcelas: Number(document.getElementById('rapido-parcelas').value), 
        mes_inicio: document.getElementById('rapido-mes').value,
        data_compra: dataCompraValida(document.getElementById('rapido-data-compra').value)
    }; 
    if (!despesa.descricao || !Number.isFinite(despesa.valor_total) || despesa.valor_total <= 0 || !Number.isInteger(despesa.parcelas) || despesa.parcelas < 1 || !/^\d{4}-\d{2}$/.test(despesa.mes_inicio) || !despesa.data_compra || (['cartao_credito', 'pix_credito'].includes(forma) && !origem)) return alert('Preencha os campos do lançamento, data e selecione o cartão/origem.'); 
    bancoFinancas.despesas.push(despesa); 
    try { 
        await salvarFinancas(); 
        evento.target.reset(); 
        document.getElementById('rapido-data-compra').value = dataAtualLocal();
        atualizarCampoCartaoRapido(); 
        document.getElementById('modal-lancamento-rapido')?.classList.remove('is-open'); 
    } catch (erro) { 
        bancoFinancas.despesas.pop(); 
        alert('Não foi possível salvar o lançamento.'); 
    } 
}

function configurarEventosFinancas() {
    const ouvir = (id, evento, callback) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.financeEventReady) {
            el.dataset.financeEventReady = 'true';
            el.addEventListener(evento, (...args) => {
                try { callback(...args); } catch (e) { console.error(`Erro no evento ${id}:`, e); }
            });
        }
    };

    ouvir('mes-referencia', 'change', renderizarTudo);
    ouvir('periodo-financeiro', 'change', renderizarTudo);
    ouvir('data-analise-financeira', 'change', renderizarTudo);
    ouvir('resumo-filtro-pessoa', 'change', renderizarResumo);
    ouvir('resumo-filtro-cartao', 'change', renderizarResumo);
    ouvir('filtro-pessoa', 'change', renderizarCompras);
    ouvir('filtro-cartao', 'change', renderizarCompras);
    ouvir('adicionar-parte', 'click', adicionarPartePagamento);
    ouvir('form-compra', 'submit', salvarCompra);
    ouvir('form-receita', 'submit', adicionarReceita);
    ouvir('form-categoria', 'submit', adicionarCategoria);
    ouvir('form-cartao', 'submit', adicionarCartao);
    ouvir('form-pessoa', 'submit', adicionarPessoa);
    ouvir('rapido-forma', 'change', atualizarCampoCartaoRapido);
    
    ouvir('limpar-filtros-resumo', 'click', () => {
        const pessoa = document.getElementById('resumo-filtro-pessoa');
        const cartao = document.getElementById('resumo-filtro-cartao');
        if (pessoa) pessoa.value = '';
        if (cartao) cartao.value = '';
        renderizarResumo();
    });

    ouvir('btn-lancamento-rapido', 'click', () => {
        const modal = document.getElementById('modal-lancamento-rapido');
        const mes = document.getElementById('mes-referencia');
        const rapidoMes = document.getElementById('rapido-mes');
        const rapidoDataCompra = document.getElementById('rapido-data-compra');
        if (modal) modal.classList.add('is-open');
        if (rapidoMes) rapidoMes.value = (mes && mes.value) ? mes.value : mesAtualLocal();
        if (rapidoDataCompra && !rapidoDataCompra.value) rapidoDataCompra.value = dataAtualLocal();
        atualizarCampoCartaoRapido();
    });

    ouvir('fechar-lancamento-rapido', 'click', () => document.getElementById('modal-lancamento-rapido')?.classList.remove('is-open'));
    ouvir('form-lancamento-rapido', 'submit', salvarLancamentoRapido);
}

function inicializarSistemas() {
    inicializarControlesFinanceiros();
    configurarEventosFinancas();
    carregarFinancas();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarSistemas, { once: true });
} else {
    inicializarSistemas();
}

function intervaloAnalise() {
    const periodo = document.getElementById('periodo-financeiro')?.value || 'mes';
    const data = document.getElementById('data-analise-financeira')?.value || dataAtualLocal();
    if (periodo === 'mes') {
        const mes = document.getElementById('mes-referencia')?.value || mesAtualLocal();
        return { periodo, inicio: `${mes}-01`, fim: `${mes}-31`, mes };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { periodo, inicio: '', fim: '', mes: '' };
    const inicio = new Date(`${data}T00:00:00`);
    const fim = new Date(inicio);
    if (periodo === 'semana') fim.setDate(fim.getDate() + 6);
    const formatar = valor => `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(valor.getDate()).padStart(2, '0')}`;
    return { periodo, inicio: data, fim: formatar(fim), mes: data.slice(0, 7) };
}

function selecionarDespesasFinanceiras() {
    const intervalo = intervaloAnalise();
    const despesas = Array.isArray(bancoFinancas.despesas) ? bancoFinancas.despesas : [];
    if (intervalo.periodo === 'mes') return despesas.map((despesa, indice) => ({ despesa, indice, parcela: obterParcelaNoMes(despesa || {}, intervalo.mes) })).filter(item => item.parcela);
    return despesas.map((despesa, indice) => {
        const dataCompra = dataCompraValida(despesa?.data_compra);
        if (!dataCompra || dataCompra < intervalo.inicio || dataCompra > intervalo.fim) return null;
        return { despesa, indice, dataCompra, parcela: obterParcelaNoMes(despesa || {}, intervalo.mes) };
    }).filter(item => item && item.parcela);
}