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

// Função para extrair apenas o primeiro nome e mês
function extrairNome(texto) {
  const linhas = texto.split('\n');
  const linhaUtil = linhas.find(l => l.trim() !== '');
  if (!linhaUtil) return 'Escala';

  const match = linhaUtil.match(/^(.+?)\s+Escala Summary,?\s+\d{1,2}\s+([A-Za-z]+)/i);
  if (match) {
    const nomeCompleto = match[1].trim();
    const primeiroNome = nomeCompleto.split(' ')[0];
    const mesIngles = match[2].toLowerCase();

    const nomesMes = {
      january: 'Janeiro', february: 'Fevereiro', march: 'Março', april: 'Abril',
      may: 'Maio', june: 'Junho', july: 'Julho', august: 'Agosto',
      september: 'Setembro', october: 'Outubro', november: 'Novembro', december: 'Dezembro'
    };

    const mesFormatado = nomesMes[mesIngles] || 'Mês';
    return `${primeiroNome} - ${mesFormatado}`;
  }

  return 'Escala';
}

// Função para extrair os dias e atividades
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

// Função para pegar o mês de referência
function extrairMes(dados1, dados2) {
  const primeiro = (dados1 && dados1.length > 0) ? dados1[0] :
                   (dados2 && dados2.length > 0) ? dados2[0] :
                   null;
  return primeiro ? primeiro.data.split('/')[1] : null;
}

// Rota principal
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

    // Junta todas as datas dos dois arquivos
    const todasAsDatas = [...new Set([
      ...dados1.map(d => d.data),
      ...dados2.map(d => d.data)
    ])].sort((a, b) => {
      const [diaA, mesA, anoA] = a.split('/').map(Number);
      const [diaB, mesB, anoB] = b.split('/').map(Number);
      return new Date(anoA, mesA - 1, diaA) - new Date(anoB, mesB - 1, diaB);
    });

    const resultado = todasAsDatas.map(data => {
      const e1 = dados1.find(d => d.data === data)?.atividade || '';
      const e2 = dados2.find(d => d.data === data)?.atividade || '';
      return { data, escala1: e1, escala2: e2 };
    });

    res.json({ escalas: resultado, nome1, nome2 });

  } catch (erro) {
    console.error('Erro ao comparar PDFs:', erro);
    res.status(500).json({ mensagem: 'Erro ao processar os arquivos PDF.' });
  }
});


app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
