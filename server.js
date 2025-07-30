// server.js atualizado será inserido aqui com todas as melhorias
// incluindo: importações corretas, cálculo de horas filtrando apenas voos ADxxxx,
// tratamento de exceções, e resposta JSON completa

const express = require('express');
const fileUpload = require('express-fileupload');
const pdf = require('pdf-parse');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

app.use(fileUpload());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function extrairNome(texto) {
  const linha = texto.split('\n').find(l => l.includes('Escala Summary')) || '';
  const match = linha.match(/^(.+?)\s+Escala Summary/i);
  return match ? match[1].trim() : 'Escala';
}

function extrairPeriodo(texto) {
  const linha = texto.split('\n').find(l => l.includes('Escala Summary')) || '';
  const match = linha.match(/Escala Summary[,]?\s*(\d{1,2})\s+([A-Za-z]{3})\s*-\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/i);
  if (match) {
    const mesMap = {
      jan: '01', feb: '02', mar: '03', apr: '04',
      may: '05', jun: '06', jul: '07', aug: '08',
      sep: '09', oct: '10', nov: '11', dec: '12'
    };
    return {
      mes: mesMap[match[2].toLowerCase()] || null,
      ano: match[5] || null
    };
  }
  return { mes: null, ano: null };
}

function extrairDias(texto, anoPadrao = new Date().getFullYear().toString()) {
  const linhas = texto.split('\n');
  const regexData = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i;
  const dias = [];
  let diaAtual = null;
  let acumulando = false;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    const match = linha.match(regexData);

    if (match) {
      if (diaAtual) dias.push(diaAtual);
      const dia = match[2].padStart(2, '0');
      const mesMap = {
        January: '01', February: '02', March: '03', April: '04',
        May: '05', June: '06', July: '07', August: '08',
        September: '09', October: '10', November: '11', December: '12'
      };
      const mes = mesMap[match[3]];
      const data = `${dia}/${mes}/${anoPadrao}`;
      diaAtual = { data, atividade: '' };
      acumulando = true;
    } else if (acumulando && linha && !/^(st|nd|rd|th)$/i.test(linha)) {
      diaAtual.atividade += linha + ' | ';
    }
  }

  if (diaAtual) dias.push(diaAtual);
  dias.forEach(d => d.atividade = d.atividade.replace(/\s\|\s$/, ''));
  return dias;
}

function somarHoras(texto) {
  const linhas = texto.split('\n');
  const regexVoo = /AD\s?\d+.*?(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/;
  let totalMin = 0;

  for (const linha of linhas) {
    const match = linha.match(regexVoo);
    if (match) {
      const h1 = parseInt(match[1]);
      const m1 = parseInt(match[2]);
      const h2 = parseInt(match[3]);
      const m2 = parseInt(match[4]);
      let inicio = h1 * 60 + m1;
      let fim = h2 * 60 + m2;
      if (fim < inicio) fim += 24 * 60;
      totalMin += fim - inicio;
    }
  }
  const horas = Math.floor(totalMin / 60);
  const minutos = totalMin % 60;
  return `${horas}h${minutos.toString().padStart(2, '0')}min`;
}

app.post('/comparar', async (req, res) => {
  try {
    if (!req.files || !req.files.pdf1 || !req.files.pdf2) {
      return res.status(400).json({ mensagem: 'Ambos os arquivos PDF são obrigatórios.' });
    }

    const { pdf1, pdf2 } = req.files;
    const texto1 = (await pdf(pdf1.data)).text;
    const texto2 = (await pdf(pdf2.data)).text;

    const nome1 = extrairNome(texto1);
    const nome2 = extrairNome(texto2);
    const periodo1 = extrairPeriodo(texto1);
    const periodo2 = extrairPeriodo(texto2);

    const ano1 = periodo1.ano || new Date().getFullYear().toString();
    const ano2 = periodo2.ano || new Date().getFullYear().toString();
    const dados1 = extrairDias(texto1, ano1);
    const dados2 = extrairDias(texto2, ano2);

    const mesReferencia = periodo1.mes || periodo2.mes;
    if (!mesReferencia) {
      return res.json({ escalas: [], nome1, nome2, mesReferencia });
    }

    const todasAsDatas = [...new Set([
      ...dados1.map(d => d.data),
      ...dados2.map(d => d.data)
    ])]
      .filter(data => data.split('/')[1] === mesReferencia)
      .sort((a, b) => {
        const [diaA, mesA, anoA] = a.split('/').map(Number);
        const [diaB, mesB, anoB] = b.split('/').map(Number);
        return new Date(anoA, mesA - 1, diaA) - new Date(anoB, mesB - 1, diaB);
      });

    const resultado = todasAsDatas.map(data => {
      const e1 = dados1.find(d => d.data === data)?.atividade || '';
      const e2 = dados2.find(d => d.data === data)?.atividade || '';
      return { data, escala1: e1, escala2: e2 };
    });

    const flightTotal1 = somarHoras(texto1);
    const flightTotal2 = somarHoras(texto2);

    res.json({
      escalas: resultado,
      nome1,
      nome2,
      mes1: periodo1.mes,
      mes2: periodo2.mes,
      flightTotal1,
      flightTotal2
    });
  } catch (erro) {
    console.error('Erro na comparação:', erro);
    res.status(500).json({ mensagem: 'Erro interno ao comparar escalas.' });
  }
});

const path = require('path');

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});