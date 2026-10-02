window.escaparHtml = function(valor) {
    const caracteres = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(valor ?? '').replace(/[&<>"']/g, caractere => caracteres[caractere]);
};