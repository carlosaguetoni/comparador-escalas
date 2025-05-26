const express = require('express');
const fileUpload = require('express-fileupload');
const pdf = require('pdf-parse');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3333;

app.use(fileUpload());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Função para extrair nome do tripulante
function extrairNome(texto) {
  const linha = texto.split('\n')[0];
  const match = linha.match(/^(.+?)\s+Escala Summary/i);
  return match ? match[1].trim() : 'Escala';
}

// Função para extrair o mês do primeiro dia a partir do cabeçalho
function extrairPeriodo(texto) {
  const linha = texto.split('\n')[0];
  const match = linha.match(/Escala Summary,?\s+(\d{1,2})\s+([A-Za-z]+)\s+-\s+(\d{1,2})\s+([A-Za-z]+)\s+2025/i);
  if (match) {
    const mesMap = {
      january: '01', february: '02', march: '03', april: '04',
      may: '05', june: '06', july: '07', august: '08',
      september: '09', october: '10', november: '11', december: '12'
    };
    return mesMap[match[2].toLowerCase()] || null; // pega o mês do primeiro dia
  }
  return null;
}

// Função para extrair dias e atividades
function extrairDias(texto) {
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
      const data = `${dia}/${mes}/2025`;

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

// Função para somar Flight Time
function somarHoras(texto) {
  const regex = /Flight Time:\s*(\d{2}):(\d{2})/g;
  let totalMin = 0;
  let match;
  while ((match = regex.exec(texto)) !== null) {
    const horas = parseInt(match[1], 10);
    const minutos = parseInt(match[2], 10);
    totalMin += horas * 60 + minutos;
  }
  const totalHoras = Math.floor(totalMin / 60);
  const restoMin = totalMin % 60;
  return `${totalHoras}h${restoMin}min`;
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

    const dados1 = extrairDias(texto1);
    const dados2 = extrairDias(texto2) || [];

    const mesReferencia = extrairPeriodo(texto1) || extrairPeriodo(texto2);

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

    res.json({ escalas: resultado, nome1, nome2, mesReferencia, flightTotal1, flightTotal2 });

  } catch (erro) {
    console.error('Erro ao comparar PDFs:', erro);
    res.status(500).json({ mensagem: 'Erro ao processar os arquivos PDF.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
