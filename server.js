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

// Extrai o mês (em número) do primeiro bloco de dados
function extrairMes(dados) {
  if (dados.length === 0) return null;
  return dados[0].data.split('/')[1]; // formato dd/mm/yyyy
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

    const mesReferencia = extrairMes(dados1) || extrairMes(dados2);

    // Junta todas as datas, mas apenas do mês selecionado
    const todasAsDatas = [...new Set([
      ...dados1.map(d => d.data),
      ...dados2.map(d => d.data)
    ])]
      .filter(data => data.split('/')[1] === mesReferencia) // só do mês certo
      .sort();

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

// Rota principal
app.post('/comparar', async (req, res) => {
  try {
    if (!req.files || !req.files.pdf1 || !req.files.pdf2) {
      return res.status(400).json({ mensagem: 'Ambos os arquivos PDF são obrigatórios.' });
    }

    const { pdf1, pdf2 } = req.files;
    const texto1 = (await pdf(pdf1.data)).text;
    console.log('Linha 1 do PDF 1:', texto1.split('\n')[0]);

    const texto2 = (await pdf(pdf2.data)).text;
    console.log('Linha 1 do PDF 2:', texto2.split('\n')[0]);

    const nome1 = extrairNome(texto1);
    const nome2 = extrairNome(texto2);

    const dados1 = extrairDias(texto1);
    const dados2 = extrairDias(texto2) || [];

    const todasAsDatas = [...new Set([...dados1.map(d => d.data), ...dados2.map(d => d.data)])].sort();

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
  
