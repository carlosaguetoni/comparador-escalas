const express = require('express');
const fileUpload = require('express-fileupload');
const pdfParse = require('pdf-parse');
const path = require('path');
const app = express();

app.use(fileUpload());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3333;

app.post('/comparar', async (req, res) => {
  if (!req.files || !req.files.pdf1 || !req.files.pdf2) {
    return res.status(400).send('Arquivos ausentes.');
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

    const flightTotal1 = somarHorasVoos(texto1);
    const flightTotal2 = somarHorasVoos(texto2);

    const todasAsDatas = Array.from(new Set([...Object.keys(dias1), ...Object.keys(dias2)])).sort();

    const resultado = todasAsDatas.map(data => {
      return {
        data,
        escala1: dias1[data] || '',
        escala2: dias2[data] || ''
      };
    });

    return res.json({
      escalas: resultado,
      nome1,
      nome2,
      mes1: periodo1.mes,
      mes2: periodo2.mes,
      flightTotal1,
      flightTotal2
    });
  } catch (err) {
    console.error('Erro ao comparar escalas:', err);
    res.status(500).send('Erro interno ao processar os arquivos.');
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

function extrairNome(texto) {
  const match = texto.match(/Tripulante(?:\s*):\s*(.*?)\n/);
  return match ? match[1].trim().toUpperCase() : 'Tripulante';
}

function extrairPeriodo(texto) {
  const match = texto.match(/Período:\s*(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    return {
      inicio: `${match[1]}/${match[2]}/${match[3]}`,
      fim: `${match[4]}/${match[5]}/${match[6]}`,
      mes: match[2]
    };
  }
  return { inicio: '', fim: '', mes: '' };
}

function extrairDias(texto) {
  const linhas = texto.split('\n');
  const dias = {};
  let dataAtual = '';

  for (let linha of linhas) {
    const dataMatch = linha.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dataMatch) {
      dataAtual = `${dataMatch[1]}/${dataMatch[2]}/${dataMatch[3]}`;
      dias[dataAtual] = '';
    } else if (dataAtual) {
      dias[dataAtual] += (dias[dataAtual] ? ' | ' : '') + linha.trim();
    }
  }

  return dias;
}

function somarHorasVoos(texto) {
  const voos = texto.match(/AD\s?\d+.*?(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/g);
  let totalMinutos = 0;

  if (voos) {
    voos.forEach(voo => {
      const match = voo.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
      if (match) {
        const h1 = parseInt(match[1], 10);
        const m1 = parseInt(match[2], 10);
        const h2 = parseInt(match[3], 10);
        const m2 = parseInt(match[4], 10);

        let minutos1 = h1 * 60 + m1;
        let minutos2 = h2 * 60 + m2;

        // Trata virada de dia
        if (minutos2 < minutos1) minutos2 += 24 * 60;

        totalMinutos += minutos2 - minutos1;
      }
    });
  }

  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  return `${horas}h ${minutos}min`;
}