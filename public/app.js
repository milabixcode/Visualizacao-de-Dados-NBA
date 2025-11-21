async function jsonGET(url) { 
  const r = await fetch(url); 
  if (!r.ok) throw new Error(await r.text()); 
  return r.json(); 
}

async function jsonPOST(url, body) { 
  const r = await fetch(url, {
    method:'POST', 
    headers:{'Content-Type':'application/json'}, 
    body: JSON.stringify(body)
  }); 
  if (!r.ok) throw new Error(await r.text()); 
  return r.json(); 
}

const metaSpan = document.getElementById('meta');
const btnIngest = document.getElementById('btn-ingest');
const btnRefresh = document.getElementById('btn-refresh');

btnIngest.addEventListener('click', async () => {
  try {
    metaSpan.textContent = 'Ingerindo…';
    const { ok, rows } = await jsonPOST('/api/ingest', {});
    metaSpan.textContent = ok ? `Linhas em games: ${rows}` : 'Falha na ingestão';
    await drawAll();
  } catch (e) { 
    metaSpan.textContent = 'Erro na ingestão'; 
    console.error(e); 
  }
});

btnRefresh.addEventListener('click', drawAll);

d3.formatDefaultLocale({
  decimal: ".",
  thousands: ",",
  grouping: [3],
  currency: ["$", ""],
  format: {
    type: "s"
  }
});

function formatKM(v) {
  const f = d3.format(".2s")(v);
  return f.replace("G", "B").replace("M", "M").replace("k", "k");
}

async function drawAll() {
  const meta = await jsonGET('/api/meta');
  metaSpan.textContent = meta.rows ? `Linhas: ${meta.rows}` : 'Banco vazio';
  Promise.all([
    jsonGET('/api/seasonal').then(drawSeasonal).catch(() => {}),
    jsonGET('/api/top_teams').then(drawTopPlayers).catch(() => {}),
    jsonGET('/api/team_stats').then(drawTeams).catch(() => {}),
    jsonGET('/api/scatter').then(drawScatter).catch(() => {}),
    jsonGET('/api/quarters').then(drawQuarters).catch(() => {}),
    jsonGET('/api/shooting_efficiency').then(drawShooting).catch(() => {}),
    jsonGET('/api/quality').then(drawQuality).catch(() => {})
  ]).catch(() => {});
}

function clearChart(sel) { 
  d3.select(sel).selectAll('*').remove(); 
}

function drawSeasonal(data) {
  if (!data || data.length === 0) return;
  
  const sel = '#chart-seasonal';
  clearChart(sel);
  const el = document.querySelector(sel);
  const containerWidth = el.clientWidth || el.parentElement.clientWidth || 1000;
  const w = Math.max(containerWidth * 1.2, 1600);
  const h = 450;
  const m = { t: 50, r: 10, b: 120, l: 90 };

  data.forEach(d => {
    d.games = +d.games || 0;
    d.season = String(d.season || 'Unknown');
  });

  const validData = data.filter(d => d.games > 0 && d.season !== 'Unknown');
  
  if (validData.length === 0) return;

  const maxGames = d3.max(validData, d => d.games);
  const padding = validData.length > 30 ? 0.5 : validData.length > 20 ? 0.6 : 0.7;
  
  const x = d3.scaleBand()
    .domain(validData.map(d => d.season))
    .range([m.l, w - m.r])
    .padding(padding);
  
  const y = d3.scaleLinear()
    .domain([0, maxGames])
    .nice()
    .range([h - m.b, m.t]);

  const svg = d3.select(sel)
    .append('svg')
    .attr('width', w)
    .attr('height', h);

  const g = svg.append('g');

  g.selectAll('rect')
    .data(validData)
    .enter()
    .append('rect')
    .attr('x', d => x(d.season))
    .attr('y', d => y(d.games))
    .attr('width', x.bandwidth())
    .attr('height', d => y(0) - y(d.games))
    .attr('fill', '#FF8C00')
    .attr('rx', 4)
    .on('mouseover', function(event, d) {
      d3.select(this).attr('opacity', 0.8);
      const tooltip = d3.select('body').append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
      tooltip.transition().duration(200).style('opacity', 0.9);
      tooltip.html(`
        <strong>Ano: ${d.season}</strong><br/>
        Jogos Únicos: ${d.games.toLocaleString('pt-BR')}
      `)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px');
    })
    .on('mouseout', function() {
      d3.select(this).attr('opacity', 1);
      d3.selectAll('.d3-tooltip').remove();
    });

  g.selectAll('.bar-label')
    .data(validData)
    .enter()
    .append('text')
    .attr('class', 'bar-label')
    .attr('x', d => x(d.season) + x.bandwidth() / 2 + 5)
    .attr('y', d => y(d.games) - 16)
    .attr('text-anchor', 'middle')
    .attr('transform', d => `rotate(270 ${x(d.season) + x.bandwidth() / 2 + 5} ${y(d.games) - 16})`)
    .style('font-size', '11px')
    .style('font-weight', 'bold')
    .style('fill', '#E8EAED')
    .text(d => d.games.toLocaleString('pt-BR'));

  const xAxis = d3.axisBottom(x)
    .tickFormat(d => d);
  
  const xAxisG = g.append('g')
    .attr('transform', `translate(0,${h-m.b})`)
    .call(xAxis);
  
  xAxisG.selectAll('text')
    .style('text-anchor', 'end')
    .attr('transform', 'rotate(-45)')
    .attr('dx', '-0.5em')
    .attr('dy', '0.8em')
    .style('font-size', '11px')
    .style('fill', '#E8EAED')
    .style('font-weight', '500');
  
  xAxisG.select('.domain')
    .attr('stroke', '#E8EAED')
    .attr('stroke-width', 2);
  
  xAxisG.selectAll('.tick line')
    .attr('stroke', '#E8EAED')
    .attr('stroke-width', 1);

  const yAxis = d3.axisLeft(y)
    .ticks(Math.min(10, Math.ceil(maxGames / 100)))
    .tickFormat(d => {
      if (d >= 1000) {
        return (d / 1000).toFixed(1) + 'k';
      }
      return d.toString();
    });
  
  const yAxisG = g.append('g')
    .attr('transform', `translate(${m.l},0)`)
    .call(yAxis);
  
  yAxisG.selectAll('text')
    .style('font-size', '12px')
    .style('fill', '#E8EAED')
    .style('font-weight', '500');
  
  yAxisG.select('.domain')
    .attr('stroke', '#E8EAED')
    .attr('stroke-width', 2);
  
  yAxisG.selectAll('.tick line')
    .attr('stroke', '#E8EAED')
    .attr('stroke-width', 1);

  svg.append('text')
    .attr('x', w / 2)
    .attr('y', h - 20)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('fill', '#FF8C00')
    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
    .text('Ano');
    
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -h / 2)
    .attr('y', 20)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('fill', '#FF8C00')
    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
    .text('Número de Jogos Únicos');
}

function drawTopPlayers(data) {
  if (!data || data.length === 0) return;
  
  const top10 = data
    .map(d => ({
      player: String(d.player || 'Unknown'),
      total_points: +d.total_points || 0,
      avg_points: +d.avg_points || 0,
      games: +d.games || 0
    }))
    .filter(d => d.total_points > 0 && d.player !== 'Unknown')
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, 10);
  
  if (top10.length === 0) return;
  
  const sel = '#chart-top-players';
  clearChart(sel);
  const el = document.querySelector(sel);
  const w = el.clientWidth || 1000;
  const h = Math.max(400, top10.length * 40 + 100);
  const m = { t: 20, r: 120, b: 60, l: 200 };

  const maxPoints = d3.max(top10, d => d.total_points) || 1;

  const x = d3.scaleLinear()
    .domain([0, maxPoints])
    .nice()
    .range([m.l, w - m.r]);
  
  const y = d3.scaleBand()
    .domain(top10.map(d => d.player))
    .range([m.t, h - m.b])
    .padding(0.2);

  const svg = d3.select(sel)
    .append('svg')
    .attr('width', w)
    .attr('height', h);

  const g = svg.append('g');

  g.selectAll('rect')
    .data(top10)
    .enter()
    .append('rect')
    .attr('x', m.l)
    .attr('y', d => y(d.player))
    .attr('width', d => x(d.total_points) - m.l)
    .attr('height', y.bandwidth())
    .attr('fill', '#FF8C00')
    .attr('rx', 4)
    .on('mouseover', function(event, d) {
      d3.select(this).attr('opacity', 0.8);
      const tooltip = d3.select('body').append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
      tooltip.transition().duration(200).style('opacity', 0.9);
      tooltip.html(`
        <strong>${d.player}</strong><br/>
        Total: ${d.total_points.toLocaleString('pt-BR')} pontos<br/>
        Média: ${d.avg_points.toFixed(1)} pontos por jogo<br/>
        Jogos: ${d.games.toLocaleString('pt-BR')}
      `)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px');
    })
    .on('mouseout', function() {
      d3.select(this).attr('opacity', 1);
      d3.selectAll('.d3-tooltip').remove();
    });

  g.selectAll('.bar-label')
    .data(top10)
    .enter()
    .append('text')
    .attr('class', 'bar-label')
    .attr('x', d => x(d.total_points) + 8)
    .attr('y', d => y(d.player) + y.bandwidth() / 2)
    .attr('dy', '0.35em')
    .style('font-size', '12px')
    .style('font-weight', 'bold')
    .style('fill', '#E8EAED')
    .text(d => d.total_points.toLocaleString('pt-BR'));

  g.append('g')
    .attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y))
    .selectAll('text')
    .style('font-size', '12px')
    .style('fill', '#E8EAED')
    .style('font-weight', '500');

  // Eixo X (pontos) - embaixo
  g.append('g')
    .attr('transform', `translate(0,${h-m.b})`)
    .call(d3.axisBottom(x).tickFormat(formatKM))
    .selectAll('text')
    .style('font-size', '11px')
    .style('fill', '#E8EAED');

  // Label do eixo X (Total de Pontos) - embaixo
  svg.append('text')
    .attr('x', w / 2)
    .attr('y', h - 15)
    .attr('text-anchor', 'middle')
    .style('font-size', '14px')
    .style('font-weight', 'bold')
    .style('fill', '#FF8C00')
    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
    .text('Total de Pontos');
    
  // Label do eixo Y (Times) - à esquerda, rotacionado
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -h / 2)
    .attr('y', 30)
    .attr('text-anchor', 'middle')
    .style('font-size', '14px')
    .style('font-weight', 'bold')
    .style('fill', '#FF8C00')
    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
    .text('Times');
}

function drawTeams(data) {
  if (!data || data.length === 0) return;
  
  const sel = '#chart-teams';
  clearChart(sel);
  const el = document.querySelector(sel);
  const w = el.clientWidth || 1000;
  const h = el.clientHeight || 400;
  const m = { t: 20, r: 100, b: 60, l: 150 };

  const topTeams = data.slice(0, 15);

  topTeams.forEach(d => {
    d.total_points = +d.total_points || 0;
    d.avg_points = +d.avg_points || 0;
    d.games = +d.games || 0;
  });

  const x = d3.scaleLinear()
    .domain([0, d3.max(topTeams, d => d.total_points) || 1])
    .range([m.l, w - m.r]);
  
  const y = d3.scaleBand()
    .domain(topTeams.map(d => d.team))
    .range([m.t, h - m.b])
    .padding(0.1);

  const svg = d3.select(sel)
    .append('svg')
    .attr('width', w)
    .attr('height', h + 30);

  const g = svg.append('g');

  g.selectAll('rect')
    .data(topTeams)
    .enter()
    .append('rect')
    .attr('x', m.l)
    .attr('y', d => y(d.team))
    .attr('width', d => x(d.total_points) - m.l)
    .attr('height', y.bandwidth())
    .attr('fill', '#1E90FF')
    .attr('rx', 4)
    .on('mouseover', function(event, d) {
      d3.select(this).attr('opacity', 0.8);
      const tooltip = d3.select('body').append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
      tooltip.transition().duration(200).style('opacity', 0.9);
      tooltip.html(`
        <strong>${d.team}</strong><br/>
        Total: ${d.total_points.toLocaleString()} pontos<br/>
        Média: ${d.avg_points.toFixed(1)} por jogo<br/>
        Jogos: ${d.games}
      `)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px');
    })
    .on('mouseout', function() {
      d3.select(this).attr('opacity', 1);
      d3.selectAll('.d3-tooltip').remove();
    });

  g.selectAll('.bar-label')
    .data(topTeams)
    .enter()
    .append('text')
    .attr('class', 'bar-label')
    .attr('x', d => x(d.total_points) + 5)
    .attr('y', d => y(d.team) + y.bandwidth() / 2)
    .attr('dy', '0.35em')
    .style('font-size', '11px')
    .style('font-weight', 'bold')
    .style('fill', '#E8EAED')
    .text(d => d.total_points.toLocaleString());

  g.append('g')
    .attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y))
    .selectAll('text')
    .style('font-size', '12px')
    .style('fill', '#E8EAED')
    .style('font-weight', '500');

  // Eixo X (pontos) - embaixo
  g.append('g')
    .attr('transform', `translate(0,${h-m.b})`)
    .call(d3.axisBottom(x).tickFormat(formatKM))
    .selectAll('text')
    .style('font-size', '11px')
    .style('fill', '#E8EAED');

  // Label do eixo X (Total de Pontos) - embaixo
  svg.append('text')
    .attr('x', w / 2)
    .attr('y', h - m.b + 40)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('fill', '#FF8C00')
    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
    .text('Total de Pontos');
    
  // Label do eixo Y (Times) - à esquerda, rotacionado
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -h / 2)
    .attr('y', 30)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('fill', '#FF8C00')
    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
    .text('Times');
}

function drawScatter(data) {
  if (!data || data.length === 0) return;
  
  const sel = '#chart-scatter';
  clearChart(sel);
  const el = document.querySelector(sel);
  const w = el.clientWidth || 1000;
  const h = el.clientHeight || 400;
  const m = { t: 20, r: 20, b: 60, l: 80 };

  data.forEach(d => {
    d.points = +d.points || 0;
    d.assists = +d.assists || 0;
    d.rebounds = +d.rebounds || 0;
  });

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.points) || 100])
    .range([m.l, w - m.r]);
  
  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.assists) || 20])
    .range([h - m.b, m.t]);

  const svg = d3.select(sel)
    .append('svg')
    .attr('width', w)
    .attr('height', h);

  const g = svg.append('g');

  g.selectAll('circle')
    .data(data)
    .enter()
    .append('circle')
    .attr('cx', d => x(d.points))
    .attr('cy', d => y(d.assists))
    .attr('r', 3)
    .attr('fill', '#FF8C00')
    .attr('opacity', 0.6)
    .on('mouseover', function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('r', 6)
        .attr('opacity', 1);
      const tooltip = d3.select('body').append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
      tooltip.transition().duration(200).style('opacity', 0.9);
      tooltip.html(`
        <strong>Estatísticas</strong><br/>
        Pontos: ${d.points}<br/>
        Assistências: ${d.assists}<br/>
        Rebotes: ${d.rebounds}
      `)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px');
    })
    .on('mouseout', function() {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('r', 3)
        .attr('opacity', 0.6);
      d3.selectAll('.d3-tooltip').remove();
    });

  g.append('g')
    .attr('transform', `translate(0,${h-m.b})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .style('fill', '#E8EAED');

  g.append('g')
    .attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y))
    .selectAll('text')
    .style('fill', '#E8EAED');

  svg.append('text')
    .attr('x', w / 2)
    .attr('y', h - 15)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('fill', '#FF8C00')
    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
    .text('Pontos');
    
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -h / 2)
    .attr('y', 30)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('fill', '#FF8C00')
    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
    .text('Assistências');
}

function drawQuarters(data) {
  if (!data || data.length === 0) return;
  
  const sel = '#chart-quarters';
  clearChart(sel);
  const el = document.querySelector(sel);
  const w = el.clientWidth || 1000;
  const h = 500;
  const m = { t: 40, r: 100, b: 80, l: 80 };

  data.forEach(d => {
    d.avg_points = +d.avg_points || 0;
    d.quarter = +d.quarter || 0;
    d.year = +d.year || 0;
  });

  const quartersData = [1, 2, 3, 4].map(q => ({
    quarter: q,
    name: `${q}º Quarto`,
    data: data.filter(d => d.quarter === q).sort((a, b) => a.year - b.year)
  }));

  const years = [...new Set(data.map(d => d.year))].sort((a, b) => a - b);
  const maxPoints = d3.max(data, d => d.avg_points) || 30;
  const minPoints = Math.max(0, d3.min(data, d => d.avg_points) - 2) || 0;

  const x = d3.scaleLinear()
    .domain([d3.min(years), d3.max(years)])
    .nice()
    .range([m.l, w - m.r]);
  
  const y = d3.scaleLinear()
    .domain([minPoints, maxPoints])
    .nice()
    .range([h - m.b, m.t]);

  const svg = d3.select(sel)
    .append('svg')
    .attr('width', w)
    .attr('height', h);

  const g = svg.append('g');

  const colors = ['#FF8C00', '#1E90FF', '#27ae60', '#FFD700'];
  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.avg_points))
    .curve(d3.curveMonotoneX);

  quartersData.forEach((qData, i) => {
    if (qData.data.length === 0) return;

    const path = g.append('path')
      .datum(qData.data)
      .attr('fill', 'none')
      .attr('stroke', colors[i])
      .attr('stroke-width', 2.5)
      .attr('d', line);

    g.selectAll(`.point-q${qData.quarter}`)
      .data(qData.data)
      .enter()
      .append('circle')
      .attr('class', `point-q${qData.quarter}`)
      .attr('cx', d => x(d.year))
      .attr('cy', d => y(d.avg_points))
      .attr('r', 3)
      .attr('fill', colors[i])
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .on('mouseover', function(event, d) {
        d3.select(this).attr('r', 5);
        const tooltip = d3.select('body').append('div')
          .attr('class', 'd3-tooltip')
          .style('opacity', 0);
        tooltip.transition().duration(200).style('opacity', 0.9);
        tooltip.html(`
          <strong>${qData.name} - ${d.year}</strong><br/>
          Média de Pontos: ${d.avg_points.toFixed(2)}<br/>
          Jogos: ${d.games ? d.games.toLocaleString('pt-BR') : 'N/A'}
        `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this).attr('r', 3);
        d3.selectAll('.d3-tooltip').remove();
      });
  });

  g.append('g')
    .attr('transform', `translate(0,${h-m.b})`)
    .call(d3.axisBottom(x).tickFormat(d => d))
    .selectAll('text')
    .style('font-size', '11px')
    .style('fill', '#E8EAED')
    .style('text-anchor', 'middle');

  g.append('g')
    .attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y))
    .selectAll('text')
    .style('font-size', '11px')
    .style('fill', '#E8EAED');

  // Labels dos eixos
  svg.append('text')
    .attr('x', w / 2)
    .attr('y', h - 15)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('fill', '#FF8C00')
    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
    .text('Ano');
    
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -h / 2)
    .attr('y', 30)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('fill', '#FF8C00')
    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
    .text('Média de Pontos por Quarto');

  // Legenda
  const legend = svg.append('g')
    .attr('transform', `translate(${w - m.r + 20}, ${m.t})`);

  quartersData.forEach((qData, i) => {
    if (qData.data.length === 0) return;
    
    const legendItem = legend.append('g')
      .attr('transform', `translate(0, ${i * 25})`);
    
    legendItem.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', colors[i])
      .attr('stroke-width', 2.5);
    
    legendItem.append('text')
      .attr('x', 25)
      .attr('y', 4)
      .style('font-size', '12px')
      .style('fill', '#E8EAED')
      .text(qData.name);
  });
}

function drawShooting(data) {
  if (!data || data.length === 0) return;
  
  const sel = '#chart-shooting';
  clearChart(sel);
  const el = document.querySelector(sel);
  const w = el.clientWidth || 1000;
  const h = Math.max(data.length * 30 + 100, 400);
  const m = { t: 20, r: 150, b: 60, l: 150 };

  data.forEach(d => {
    d.avg_fg_pct = +d.avg_fg_pct || 0;
    d.avg_fg3_pct = +d.avg_fg3_pct || 0;
    d.avg_ft_pct = +d.avg_ft_pct || 0;
  });

  const teams = data.map(d => d.team);
  const maxPct = d3.max(data, d => Math.max(d.avg_fg_pct, d.avg_fg3_pct, d.avg_ft_pct)) || 1;

  const x = d3.scaleLinear()
    .domain([0, maxPct])
    .nice()
    .range([m.l, w - m.r]);
  
  const y = d3.scaleBand()
    .domain(teams)
    .range([m.t, h - m.b])
    .padding(0.2);

  const svg = d3.select(sel)
    .append('svg')
    .attr('width', w)
    .attr('height', h);

  const g = svg.append('g');

  const teamGroups = g.selectAll('.team-group')
    .data(data)
    .enter()
    .append('g')
    .attr('class', 'team-group')
    .attr('transform', d => `translate(0,${y(d.team)})`);

  teamGroups.append('rect')
    .attr('x', m.l)
    .attr('y', -y.bandwidth() / 3)
    .attr('width', d => x(d.avg_fg_pct) - m.l)
    .attr('height', y.bandwidth() / 3 - 2)
    .attr('fill', '#FF8C00')
    .attr('rx', 2)
    .on('mouseover', function(event, d) {
      d3.select(this).attr('opacity', 0.8);
      const tooltip = d3.select('body').append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
      tooltip.transition().duration(200).style('opacity', 0.9);
      tooltip.html(`
        <strong>${d.team} - FG%</strong><br/>
        Percentual: ${(d.avg_fg_pct * 100).toFixed(1)}%
      `)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px');
    })
    .on('mouseout', function() {
      d3.select(this).attr('opacity', 1);
      d3.selectAll('.d3-tooltip').remove();
    });

  teamGroups.append('rect')
    .attr('x', m.l)
    .attr('y', 0)
    .attr('width', d => x(d.avg_fg3_pct) - m.l)
    .attr('height', y.bandwidth() / 3 - 2)
    .attr('fill', '#1E90FF')
    .attr('rx', 2)
    .on('mouseover', function(event, d) {
      d3.select(this).attr('opacity', 0.8);
      const tooltip = d3.select('body').append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
      tooltip.transition().duration(200).style('opacity', 0.9);
      tooltip.html(`
        <strong>${d.team} - 3P%</strong><br/>
        Percentual: ${(d.avg_fg3_pct * 100).toFixed(1)}%
      `)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px');
    })
    .on('mouseout', function() {
      d3.select(this).attr('opacity', 1);
      d3.selectAll('.d3-tooltip').remove();
    });

  teamGroups.append('rect')
    .attr('x', m.l)
    .attr('y', y.bandwidth() / 3)
    .attr('width', d => x(d.avg_ft_pct) - m.l)
    .attr('height', y.bandwidth() / 3 - 2)
    .attr('fill', '#27ae60')
    .attr('rx', 2)
    .on('mouseover', function(event, d) {
      d3.select(this).attr('opacity', 0.8);
      const tooltip = d3.select('body').append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
      tooltip.transition().duration(200).style('opacity', 0.9);
      tooltip.html(`
        <strong>${d.team} - FT%</strong><br/>
        Percentual: ${(d.avg_ft_pct * 100).toFixed(1)}%
      `)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px');
    })
    .on('mouseout', function() {
      d3.select(this).attr('opacity', 1);
      d3.selectAll('.d3-tooltip').remove();
    });

  g.append('g')
    .attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y))
    .selectAll('text')
    .style('font-size', '11px')
    .style('fill', '#E8EAED');

  g.append('g')
    .attr('transform', `translate(0,${h-m.b})`)
    .call(d3.axisBottom(x).tickFormat(d => (d * 100).toFixed(0) + '%'))
    .selectAll('text')
    .style('font-size', '11px')
    .style('fill', '#E8EAED');

  // Labels dos eixos
  svg.append('text')
    .attr('x', w / 2)
    .attr('y', h - 15)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('fill', '#FF8C00')
    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
    .text('Percentual de Acerto (%)');
    
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -h / 2)
    .attr('y', 30)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('fill', '#FF8C00')
    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.5)')
    .text('Times');

  const legend = svg.append('g')
    .attr('transform', `translate(${w - m.r + 20}, ${m.t})`);

  const legendData = [
    { label: 'FG%', color: '#FF8C00' },
    { label: '3P%', color: '#1E90FF' },
    { label: 'FT%', color: '#27ae60' }
  ];

  legend.selectAll('.legend-item')
    .data(legendData)
    .enter()
    .append('g')
    .attr('class', 'legend-item')
    .attr('transform', (d, i) => `translate(0, ${i * 25})`)
    .each(function(d) {
      const g = d3.select(this);
      g.append('rect')
        .attr('width', 15)
        .attr('height', 15)
        .attr('fill', d.color)
        .attr('rx', 2);
      g.append('text')
        .attr('x', 20)
        .attr('y', 12)
        .style('font-size', '12px')
        .style('fill', '#E8EAED')
        .text(d.label);
    });
}

function drawQuality(q) {
  const el = document.getElementById('quality');
  if (!q || Object.keys(q).length === 0) {
    el.innerHTML = '<p style="color: #9AA0A6;">Carregando diagnósticos de qualidade...</p>';
    return;
  }

  const total = q.rows_total || 0;
  const badPoints = q.bad_points || 0;
  const missingDate = q.missing_date || 0;
  const missingTeam = q.missing_team || 0;
  const invalidPoints = q.invalid_points || 0;
  const validGames = q.valid_games || 0;
  const avgPoints = q.avg_points || 0;

  const validPct = total > 0 ? ((validGames / total) * 100).toFixed(1) : 0;
  const badPointsPct = total > 0 ? ((badPoints / total) * 100).toFixed(1) : 0;
  const missingDatePct = total > 0 ? ((missingDate / total) * 100).toFixed(1) : 0;
  const missingTeamPct = total > 0 ? ((missingTeam / total) * 100).toFixed(1) : 0;

  el.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px;">
      <div style="background: var(--surface-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);">
        <div style="font-size: 24px; font-weight: bold; color: var(--primary);">${total.toLocaleString('pt-BR')}</div>
        <div style="font-size: 12px; color: var(--text-light); margin-top: 5px;">Total de Registros</div>
      </div>
      <div style="background: var(--surface-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--success);">
        <div style="font-size: 24px; font-weight: bold; color: var(--success);">${validGames.toLocaleString('pt-BR')}</div>
        <div style="font-size: 12px; color: var(--text-light); margin-top: 5px;">Jogos Válidos (${validPct}%)</div>
      </div>
      <div style="background: var(--surface-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--warning);">
        <div style="font-size: 24px; font-weight: bold; color: var(--warning);">${badPoints.toLocaleString('pt-BR')}</div>
        <div style="font-size: 12px; color: var(--text-light); margin-top: 5px;">Pontos Inválidos (${badPointsPct}%)</div>
      </div>
      <div style="background: var(--surface-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--danger);">
        <div style="font-size: 24px; font-weight: bold; color: var(--danger);">${missingDate.toLocaleString('pt-BR')}</div>
        <div style="font-size: 12px; color: var(--text-light); margin-top: 5px;">Datas Faltantes (${missingDatePct}%)</div>
      </div>
      <div style="background: var(--surface-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--secondary);">
        <div style="font-size: 24px; font-weight: bold; color: var(--secondary);">${avgPoints.toFixed(1)}</div>
        <div style="font-size: 12px; color: var(--text-light); margin-top: 5px;">Média de Pontos</div>
      </div>
    </div>
    ${missingTeam > 0 ? `
      <div style="background: var(--surface-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--danger); margin-top: 10px;">
        <div style="font-size: 18px; font-weight: bold; color: var(--danger);">${missingTeam.toLocaleString('pt-BR')}</div>
        <div style="font-size: 12px; color: var(--text-light); margin-top: 5px;">Times Faltantes (${missingTeamPct}%)</div>
      </div>
    ` : ''}
    ${invalidPoints > 0 ? `
      <div style="background: var(--surface-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--warning); margin-top: 10px;">
        <div style="font-size: 18px; font-weight: bold; color: var(--warning);">${invalidPoints.toLocaleString('pt-BR')}</div>
        <div style="font-size: 12px; color: var(--text-light); margin-top: 5px;">Pontos Não Convertíveis</div>
      </div>
    ` : ''}
  `;
}

drawAll().catch(() => {});

