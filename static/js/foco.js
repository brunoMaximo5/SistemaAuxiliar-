function converterDataEstudo(valor) {
    if (typeof valor !== 'string' || !valor) return null;

    let ano;
    let mes;
    let dia;
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        [ano, mes, dia] = valor.split('-').map(Number);
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
        [dia, mes, ano] = valor.split('/').map(Number);
    } else {
        return null;
    }

    const data = new Date(ano, mes - 1, dia);
    if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
    data.setHours(0, 0, 0, 0);
    return data;
}

window.registrarSessaoFoco = async function(tempoSegundos, disciplinaIndex) {
    if (!Number.isFinite(tempoSegundos) || tempoSegundos <= 0) {
        throw new Error('A duração da sessão de foco é inválida.');
    }

    const resposta = await fetch('/api/dados');
    if (!resposta.ok) throw new Error('Não foi possível carregar os dados para registrar o foco.');
    const dados = await resposta.json();

    const agora = new Date();
    const hojeIso = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    const minutosDeEstudo = Math.floor(tempoSegundos / 60);

    dados.tempo_total = (Number(dados.tempo_total) || 0) + tempoSegundos;
    dados.xp = (Number(dados.xp) || 0) + minutosDeEstudo;

    if (!dados.historico_diario || typeof dados.historico_diario !== 'object' || Array.isArray(dados.historico_diario)) {
        dados.historico_diario = {};
    }
    dados.historico_diario[hojeIso] = (Number(dados.historico_diario[hojeIso]) || 0) + tempoSegundos;

    const indice = Number(disciplinaIndex);
    if (Number.isInteger(indice) && indice >= 0 && Array.isArray(dados.edital) && dados.edital[indice]) {
        const disciplina = dados.edital[indice];
        disciplina.tempo_estudado = (Number(disciplina.tempo_estudado) || 0) + tempoSegundos;

        if (!dados.historico_secoes || typeof dados.historico_secoes !== 'object' || Array.isArray(dados.historico_secoes)) {
            dados.historico_secoes = {};
        }
        if (!dados.historico_secoes[hojeIso] || typeof dados.historico_secoes[hojeIso] !== 'object' || Array.isArray(dados.historico_secoes[hojeIso])) {
            dados.historico_secoes[hojeIso] = {};
        }
        const categoria = disciplina.categoria || 'Principal';
        dados.historico_secoes[hojeIso][categoria] = (Number(dados.historico_secoes[hojeIso][categoria]) || 0) + tempoSegundos;
    }

    const ultimaData = converterDataEstudo(dados.ultima_data_estudo || dados.ultimo_acesso);
    if (!ultimaData) {
        dados.dias_seguidos = 1;
    } else {
        const diferencaDias = Math.round((agora.setHours(0, 0, 0, 0) - ultimaData.getTime()) / 86400000);
        if (diferencaDias === 1) {
            dados.dias_seguidos = (Number(dados.dias_seguidos) || 0) + 1;
        } else if (diferencaDias > 1) {
            dados.dias_seguidos = 1;
        } else if (diferencaDias === 0 && !Number(dados.dias_seguidos)) {
            dados.dias_seguidos = 1;
        }
    }

    dados.ultima_data_estudo = hojeIso;
    dados.ultimo_acesso = hojeIso;
    dados.ofensiva = dados.dias_seguidos;

    const respostaSalvar = await fetch('/api/dados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });
    if (!respostaSalvar.ok) throw new Error('Não foi possível salvar a sessão de foco.');

    return dados;
};