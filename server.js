// server.js (atualizado e robusto)
const express = require('express');
const fileUpload = require('express-fileupload');
const pdfParse = require('pdf-parse');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3333;

// Servir arquivos estáticos da raiz (index.html na raiz do repo)
app.use(express.static(path.join(__dirname)));
app.use(fileUpload());

// ----------------------- Rotas -----------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/comparar', async (req, res) => {
  if (!req.files || !req.files.pdf1 || !req.files.pdf2) {
    return res.status(400).json({ erro: 'Envie os dois PDFs.' });
  }

  try {
    const texto1 = (await pdfParse(req.files.pdf1.data)).text;
    const texto2 = (await pdfParse(req.files.pdf2.data)).text;

    const nome1 = extrairNome(texto1);
    const nome2 = extrairNome(texto2);

    const periodo1 = extrairPeriodo(texto1);
    const periodo2 = extrairPeriodo(texto2);

    const dias1 = extrairDias(texto1);
    const dias2 = extrairDias(texto2);

    // Logs úteis p/ depurar rápido (aparece no terminal)
    console.log('Periodo1:', periodo1, 'Periodo2:', periodo2);
    console.log('Qtd dias extraídos -> pdf1:', Object.keys(dias1).length, 'pdf2:', Object.keys(dias2).length);

    const flightTotal1 = somarHorasVoos(texto1);
    const flightTotal2 = somarHorasVoos(texto2);

    // Junta todas as datas e ordena cronologicamente
    const todasAsDatas = Array.from(new Set([
      ...Object.keys(dias1),
      ...Object.keys(dias2),
    ])).sort((a, b) => {
      const [da, ma, aa] = a.split('/').map(Number);
      const [db, mb, ab] = b.split('/').map(Number);
      return new Date(aa, ma - 1, da) - new Date(ab, mb - 1, db);
    });

    const resultado = todasAsDatas.map((data) => ({
      data,
      escala1: dias1[data] || '',
      escala2: dias2[data] || '',
    }));

    res.json({
      escalas: resultado,
      nome1,
      nome2,
      mes1: periodo1.mes,
      mes2: periodo2.mes,
      flightTotal1,
      flightTotal2,
    });
  } catch (err) {
    console.error('Erro ao comparar escalas:', err);
    res.status(500).json({ erro: 'Erro ao processar os PDFs.' });
  }
});

// ----------------------- Funções -----------------------
function extrairNome(texto) {
  // tenta “Tripulante: NOME”
  let m = texto.match(/Tripulante(?:\s*):\s*(.*?)\n/);
  if (m) return m[1].trim().toUpperCase();

  // fallback: algo antes de “Escala Summary”
  const linhaCab = (texto.split('\n').find(l => /Escala Summary/i.test(l)) || '').trim();
  m = linhaCab.match(/^(.+?)\s+Escala Summary/i);
  if (m) return m[1].trim().toUpperCase();

  return 'Tripulante';
}

function extrairPeriodo(texto) {
  // 1) PT-BR: Período: 01/08/2025 a 31/08/2025
  let m = texto.match(/Período:\s*(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    return {
      inicio: `${m[1]}/${m[2]}/${m[3]}`,
      fim: `${m[4]}/${m[5]}/${m[6]}`,
      mes: m[2],
    };
  }

  // 2) EN: "Escala Summary 1 Aug - 31 Aug 2025"
  const mesesEn = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
  m = texto.match(/Escala Summary[,]?\s*(\d{1,2})\s+([A-Za-z]{3})\s*-\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/i);
  if (m) {
    const mes = mesesEn[m[2].toLowerCase()] || mesesEn[m[4].toLowerCase()] || '';
    return {
      inicio: `${String(m[1]).padStart(2,'0')}/${mes}/${m[5]}`,
      fim: `${String(m[3]).padStart(2,'0')}/${mes}/${m[5]}`,
      mes,
    };
  }

  return { inicio: '', fim: '', mes: '' };
}

function extrairDias(texto) {
  const linhas = texto.split('\n');

  // A) DD/MM/AAAA
  const reDataBR = /^(\d{2})\/(\d{2})\/(\d{4})/;

  // B) Dow, DD Month (inglês)
  const reDataEN = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i;
  const mesesENfull = {
    january:'01', february:'02', march:'03', april:'04', may:'05', june:'06',
    july:'07', august:'08', september:'09', october:'10', november:'11', december:'12'
  };

  const per = extrairPeriodo(texto);
  const anoPadrao = per.inicio && per.inicio.includes('/') ? per.inicio.split('/')[2] : String(new Date().getFullYear());

  const dias = {};
  let dataAtual = '';

  for (let linha of linhas) {
    let m;

    // tenta BR
    m = linha.match(reDataBR);
    if (m) {
      const dia = m[1], mes = m[2], ano = m[3];
      dataAtual = `${dia}/${mes}/${ano}`;
      if (!dias[dataAtual]) dias[dataAtual] = '';
      continue;
    }

    // tenta EN
    m = linha.match(reDataEN);
    if (m) {
      const dia = String(m[2]).padStart(2, '0');
      const mes = mesesENfull[m[3].toLowerCase()] || '01';
      const ano = anoPadrao;
      dataAtual = `${dia}/${mes}/${ano}`;
      if (!dias[dataAtual]) dias[dataAtual] = '';
      continue;
    }

    // acumula atividade
    if (dataAtual) {
      const pedaco = linha.trim();
      if (pedaco && !/^(st|nd|rd|th)$/i.test(pedaco)) {
        dias[dataAtual] += (dias[dataAtual] ? ' | ' : '') + pedaco;
      }
    }
  }

  // limpa “Flight Time: …” e barra final
  Object.keys(dias).forEach(d => {
    dias[d] = dias[d]
      .replace(/Flight Time:.*?(\||$)/gi, '')
      .replace(/\s*\|\s*$/, '');
  });

  return dias;
}

function somarHorasVoos(texto) {
  // só soma voos ADxxxx com janela hh:mm - hh:mm
  const linhasVoo = texto.match(/AD\s?\d+.*?\d{2}:\d{2}\s*-\s*\d{2}:\d{2}.*$/g);
  let totalMin = 0;

  if (linhasVoo) {
    linhasVoo.forEach((l) => {
      const m = l.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
      if (!m) return;
      const h1 = parseInt(m[1], 10), m1 = parseInt(m[2], 10);
      const h2 = parseInt(m[3], 10), m2 = parseInt(m[4], 10);

      let a = h1 * 60 + m1;
      let b = h2 * 60 + m2;
      if (b < a) b += 24 * 60; // vira o dia

      totalMin += (b - a);
    });
  }

  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return `${h}h ${String(min).padStart(2, '0')}min`;
}

// ----------------------- Start -----------------------
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
